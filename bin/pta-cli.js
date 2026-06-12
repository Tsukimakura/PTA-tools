const inquirer = require('inquirer');
const { getCookieViaBrowser } = require('../src/auth/authManager');
const { getConfig, updateCookie } = require('../src/utils/config');
const { calculateRealStatus } = require('../src/utils/helpers');
const { fetchAllProblemSets, downloadProblemSet } = require('../src/services/downloader');
const { generateTerminalReport } = require('../src/services/report');
const { downloadArchive } = require('../src/services/archiveDownloader');

/**
 * Handle operations for ongoing or pending problem sets
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 */
async function handleOngoingSet(setId, setName) {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: `Select an action for [ONGOING/PENDING] ${setName}:`,
            choices: [
                { name: 'Download Problem Set (Clean Markdown)', value: 'DOWNLOAD_CLEAN' },
                { name: '< Back to Main Menu', value: 'BACK' }
            ]
        }
    ]);

    if (action === 'DOWNLOAD_CLEAN') {
        console.log(`[INFO] Starting clean download workflow for: ${setName}`);
        await downloadProblemSet(setId, setName);
    }
}

/**
 * Handle operations for ended problem sets
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 */
async function handleEndedSet(setId, setName) {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: `Select an action for [ENDED] ${setName}:`,
            choices: [
                { name: 'View Terminal Report Card', value: 'REPORT' },
                { name: 'Download Archive (With Source Code & Results)', value: 'ARCHIVE' },
                { name: '< Back to Main Menu', value: 'BACK' }
            ]
        }
    ]);

    if (action === 'REPORT') {
        await generateTerminalReport(setId, setName);
    } else if (action === 'ARCHIVE') {
        await downloadArchive(setId, setName);
    }
}

/**
 * Main Interactive CLI Loop
 */
async function initCLI() {
    console.log("========================================");
    console.log("      PTA-Tools Interactive Console     ");
    console.log("========================================\n");

    const config = getConfig();

    // 1. Session and Authentication Guard
    if (!config.cookie) {
        console.log("[INFO] No valid cookie found. Initiating login sequence...");
        const success = await getCookieViaBrowser();
        if (!success) {
            console.error("[ERROR] Authentication failed. Exiting CLI.");
            process.exit(1);
        }
    }

    // 2. Fetch All Metadata
    let problemSets = await fetchAllProblemSets();
    
    if (problemSets === null) {
        console.warn("[WARN] Credentials expired. Re-authenticating...");
        updateCookie("");
        const success = await getCookieViaBrowser();
        if (!success) process.exit(1);
        problemSets = await fetchAllProblemSets();
    }

    if (!problemSets || problemSets.length === 0) {
        console.log("[INFO] No problem sets found for this account.");
        return;
    }

    // 3. Prepare Main Menu Choice Vector
    const choices = problemSets.map(set => {
        const realStatus = calculateRealStatus(set.startAt, set.endAt);
        return {
            name: `[${realStatus}] ${set.name}`,
            value: set.id
        };
    });

    choices.push(new inquirer.Separator());
    choices.push({ name: "Exit", value: "EXIT" });

    // 4. Persistent Navigation Loop
    while (true) {
        const { selectedSetId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedSetId',
                message: 'Select a Problem Set to inspect or download (Use Arrow Keys):',
                choices: choices,
                pageSize: 15
            }
        ]);

        if (selectedSetId === "EXIT") {
            console.log("[INFO] Exiting tool.");
            process.exit(0);
        }

        const selectedSet = problemSets.find(s => s.id === selectedSetId);
        const realStatus = calculateRealStatus(selectedSet.startAt, selectedSet.endAt);

        // Routing logic based on status matrix
        if (realStatus === 'ENDED') {
            await handleEndedSet(selectedSetId, selectedSet.name);
        } else {
            await handleOngoingSet(selectedSetId, selectedSet.name);
        }
        
        console.log("\n----------------------------------------");
    }
}

initCLI();
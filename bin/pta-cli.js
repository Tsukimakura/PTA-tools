const inquirer = require('inquirer');
const { getCookieViaBrowser } = require('../src/auth/authManager');
const { getConfig, updateCookie } = require('../src/utils/config');
const { calculateRealStatus } = require('../src/utils/helpers');
const { fetchAllProblemSets, downloadProblemSet, downloadOngoingProgress } = require('../src/services/downloader');
const { generateTerminalReport, generateOngoingInfo } = require('../src/services/report');
const { downloadArchive } = require('../src/services/archiveDownloader');

/**
 * Handle operations for ongoing or pending problem sets
 * @param {object} selectedSet - The full problem set object
 */
async function handleOngoingSet(selectedSet) {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: `Select an action for [ONGOING/PENDING] ${selectedSet.name}:`,
            prefix: '>',
            choices: [
                { name: 'View Real-time Progress', value: 'INFO' },
                { name: 'Download Problem Set (Clean Markdown)', value: 'DOWNLOAD_CLEAN' },
                { name: 'Download Current Progress (With Saved Answers)', value: 'DOWNLOAD_PROGRESS' },
                { name: '< Back to Main Menu', value: 'BACK' }
            ]
        }
    ]);

    if (action === 'INFO') {
        await generateOngoingInfo(selectedSet);
    } else if (action === 'DOWNLOAD_CLEAN') {
        console.log(`[INFO] Starting clean download workflow for: ${selectedSet.name}`);
        await downloadProblemSet(selectedSet.id, selectedSet.name);
    } else if (action === 'DOWNLOAD_PROGRESS') {
        await downloadOngoingProgress(selectedSet.id, selectedSet.name);
    }
}

/**
 * Handle operations for ended problem sets
 * @param {object} selectedSet - The full problem set object
 */
async function handleEndedSet(selectedSet) {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: `Select an action for [ENDED] ${selectedSet.name}:`,
            prefix: '>',
            choices: [
                { name: 'View Terminal Report Card', value: 'REPORT' },
                { name: 'Download Archive (With Source Code & Results)', value: 'ARCHIVE' },
                { name: '< Back to Main Menu', value: 'BACK' }
            ]
        }
    ]);

    if (action === 'REPORT') {
        await generateTerminalReport(selectedSet.id, selectedSet.name);
    } else if (action === 'ARCHIVE') {
        await downloadArchive(selectedSet.id, selectedSet.name);
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

    // 1. Session Guard
    if (!config.cookie) {
        console.log("[INFO] No valid cookie found. Initiating login sequence...");
        const success = await getCookieViaBrowser();
        if (!success) {
            console.error("[ERROR] Authentication failed. Exiting CLI.");
            process.exit(1);
        }
    }

    // 2. Fetch Metadata
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

    // 3. Prepare Choices
    const choices = problemSets.map(set => {
        const realStatus = calculateRealStatus(set.startAt, set.endAt);
        return {
            name: `[${realStatus}] ${set.name}`,
            value: set.id
        };
    });

    choices.push(new inquirer.Separator());
    choices.push({ name: "Exit", value: "EXIT" });

    // 4. Persistent Loop
    while (true) {
        const { selectedSetId } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedSetId',
                message: 'Select a Problem Set to inspect or download (Use Arrow Keys):',
                prefix: '>',
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

        // Sub-menu routing passing the ENTIRE object
        if (realStatus === 'ENDED') {
            await handleEndedSet(selectedSet);
        } else {
            await handleOngoingSet(selectedSet);
        }
        
        console.log("\n----------------------------------------");
    }
}

initCLI();
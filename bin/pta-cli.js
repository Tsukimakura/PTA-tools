const inquirer = require('inquirer');
const { getCookieViaBrowser } = require('../src/auth/authManager');
const { getConfig, updateCookie } = require('../src/utils/config');
const { calculateRealStatus } = require('../src/utils/helpers');

// Import the download function
const { fetchAllProblemSets, downloadProblemSet } = require('../src/services/downloader');

async function initCLI() {
    console.log("========================================");
    console.log("      PTA-Tools Interactive Console     ");
    console.log("========================================\n");

    const config = getConfig();

    if (!config.cookie) {
        console.log("[INFO] No valid cookie found. Initiating login sequence...");
        const success = await getCookieViaBrowser();
        if (!success) {
            console.error("[ERROR] Authentication failed. Exiting CLI.");
            process.exit(1);
        }
    }

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

    const choices = problemSets.map(set => {
        const realStatus = calculateRealStatus(set.startAt, set.endAt);
        return {
            name: `[${realStatus}] ${set.name}`,
            value: set.id
        };
    });

    choices.push(new inquirer.Separator());
    choices.push({ name: "Exit", value: "EXIT" });

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

    // [UPDATED] Find the full set object to get its exact name
    const selectedSet = problemSets.find(s => s.id === selectedSetId);

    console.log(`\n[INFO] You selected Set ID: ${selectedSetId}`);
    console.log(`[INFO] Phase 2: Starting background download engine...\n`);
    
    // Trigger the download workflow
    await downloadProblemSet(selectedSetId, selectedSet.name);
}

initCLI();
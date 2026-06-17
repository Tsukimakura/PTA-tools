const { ptaFetch } = require('../api/client');
const { getEndpoints } = require('../api/endpoints');
const { calculateRealStatus } = require('../utils/helpers');
const { ensureExamSession } = require('./examSession');

/**
 * Fallback function to print basic info if advanced data fails
 */
function printBasicInfo(selectedSet) {
    console.log("\n========================================");
    console.log(` Information: ${selectedSet.name}`);
    console.log("========================================");
    console.log(` Set ID: ${selectedSet.id}`);
    console.log(` Start Time: ${new Date(selectedSet.startAt).toLocaleString()}`);
    console.log(` End Time: ${new Date(selectedSet.endAt).toLocaleString()}`);
    console.log(` Status: ${calculateRealStatus(selectedSet.startAt, selectedSet.endAt)}`);
    console.log("========================================\n");
}

/**
 * Fetch and print a real-time progress dashboard for an ONGOING problem set
 * @param {object} selectedSet - The full problem set object
 */
async function generateOngoingInfo(selectedSet) {
    const endpoints = getEndpoints();
    const setId = selectedSet.id;
    console.log(`\n[INFO] Fetching real-time progress for: ${selectedSet.name}...`);

    try {
        // 1. Use interceptor to get or start Exam Session
        const sessionData = await ensureExamSession(setId, selectedSet.name);

        const examId = sessionData.exam.id;
        const userId = sessionData.exam.userId;
        const studentName = sessionData.exam.studentUser ? sessionData.exam.studentUser.name : 'Unknown';
        const studentNumber = sessionData.exam.studentUser ? sessionData.exam.studentUser.studentNumber : 'Unknown';

        // 2. Fetch Summaries (Max scores and total problems)
        const summaryRes = await ptaFetch(endpoints.PROBLEM_SUMMARIES(setId));
        const summaryData = await summaryRes.json();
        const summaries = summaryData.summaries || {};

        // 3. Fetch Rankings (Current scores and rank)
        const rankingRes = await ptaFetch(endpoints.COMMON_RANKINGS(setId, userId));
        const rankingData = await rankingRes.json();
        const selfRank = rankingData.selfRanking || null;
        const totalUsers = rankingData.total || 0;

        // 4. Fetch Problem Status (Completion counts)
        const statusRes = await ptaFetch(endpoints.PROBLEM_STATUS(examId, setId));
        const statusData = await statusRes.json();
        const problemStatusList = statusData.problemStatus || [];

        // Aggregate completion counts by type
        const completionByType = {};
        problemStatusList.forEach(p => {
            const type = p.problemType;
            if (!completionByType[type]) completionByType[type] = { completed: 0 };
            
            // Count as completed if the status is anything other than empty or NO_ANSWER
            if (p.problemSubmissionStatus && p.problemSubmissionStatus !== 'PROBLEM_NO_ANSWER') {
                completionByType[type].completed++;
            }
        });

        // 5. Render Dashboard
        console.log("\n========================================");
        console.log(` Progress Dashboard: ${selectedSet.name}`);
        console.log("========================================");
        console.log(` Set ID: ${selectedSet.id}`);
        console.log(` End Time: ${new Date(selectedSet.endAt).toLocaleString()}`);
        console.log(` Status: ${calculateRealStatus(selectedSet.startAt, selectedSet.endAt)}`);
        
        console.log("----------------------------------------");
        console.log(" [ Overall Progress ]");
        console.log(` User: ${studentName} (${studentNumber})`);
        
        if (selfRank) {
            console.log(` Rank: ${selfRank.rank} / ${totalUsers}`);
            let maxTotal = 0;
            for (const t in summaries) maxTotal += summaries[t].totalScore;
            console.log(` Total Score: ${selfRank.totalScore} / ${maxTotal} pts`);
        } else {
            console.log(` Rank: Not available (Ranking might be hidden)`);
            console.log(` Total Score: 0 pts (No submissions evaluated yet)`);
        }

        console.log("\n [ Module Details ]");
        for (const [type, summary] of Object.entries(summaries)) {
            const maxScore = summary.totalScore;
            const totalProbs = summary.total;
            
            const completedProbs = completionByType[type] ? completionByType[type].completed : 0;
            const currentScore = selfRank && selfRank.typeScores && selfRank.typeScores[type] !== undefined 
                                 ? selfRank.typeScores[type] 
                                 : 0;

            // Format output with fixed widths for strict column alignment
            const typeName = type.replace(/_/g, ' ').padEnd(18, ' ');
            const progressStr = `${completedProbs}/${totalProbs}`.padStart(7, ' ');
            const scoreStr = `${currentScore}/${maxScore}`.padStart(9, ' ');

            console.log(` - ${typeName} | Progress: ${progressStr} | Score: ${scoreStr} pts`);
        }
        console.log("========================================\n");

    } catch (error) {
        if (error.message === "USER_CANCELED") {
            console.log("[INFO] Start canceled. Falling back to basic info.");
            printBasicInfo(selectedSet);
            return;
        }
        console.log(`[WARN] Advanced progress unavailable (${error.message}). Falling back to basic info.`);
        printBasicInfo(selectedSet);
    }
}

/**
 * Fetch and print a formatted terminal report card for a specific problem set
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 */
async function generateTerminalReport(setId, setName) {
    const endpoints = getEndpoints();
    console.log(`\n[INFO] Fetching report data for: ${setName}...`);

    try {
        // 1. Use interceptor to get Exam Session
        const sessionData = await ensureExamSession(setId, setName);

        const userId = sessionData.exam.userId;
        const studentName = sessionData.exam.studentUser.name;
        const studentNumber = sessionData.exam.studentUser.studentNumber;

        // 2. Fetch Problem Summaries to get the maximum possible scores
        const summaryRes = await ptaFetch(endpoints.PROBLEM_SUMMARIES(setId));
        const summaryData = await summaryRes.json();
        const summaries = summaryData.summaries || {};
        
        let maxTotalScore = 0;
        for (const type in summaries) {
            maxTotalScore += summaries[type].totalScore || 0;
        }

        // 3. Fetch Rankings to get the user's actual scores
        const rankingRes = await ptaFetch(endpoints.COMMON_RANKINGS(setId, userId));
        const rankingData = await rankingRes.json();

        if (!rankingData.selfRanking) {
            console.log("[INFO] No ranking data available for this problem set.");
            return;
        }

        const selfRank = rankingData.selfRanking;

        // 4. Print Report Card
        console.log("\n========================================");
        console.log(` Report Card: ${setName}`);
        console.log("========================================");
        console.log(` User: ${studentName} (${studentNumber})`);
        console.log(` Rank: ${selfRank.rank} / ${rankingData.total}`);
        console.log(` Total Score: ${selfRank.totalScore} / ${maxTotalScore} pts`);
        console.log(` Total Time: ${selfRank.solvingTime} seconds\n`);

        console.log("\n [ Module Scores ]");
        for (const [type, score] of Object.entries(selfRank.typeScores)) {
            const maxTypeScore = summaries[type] ? summaries[type].totalScore : '-';
            
            // Format output with fixed widths for strict column alignment
            const typeName = type.replace(/_/g, ' ').padEnd(18, ' ');
            const scoreStr = `${score}/${maxTypeScore}`.padStart(9, ' ');

            console.log(` - ${typeName} | Score: ${scoreStr} pts`);
        }
        console.log("========================================\n");

    } catch (error) {
        if (error.message === "USER_CANCELED") {
            console.log("[INFO] Operation canceled by user.");
            return;
        }
        console.error(`[ERROR] Failed to generate report: ${error.message}`);
    }
}

module.exports = {
    generateTerminalReport,
    generateOngoingInfo
};
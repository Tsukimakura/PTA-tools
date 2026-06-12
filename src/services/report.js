const { ptaFetch } = require('../api/client');
const { getEndpoints } = require('../api/endpoints');

/**
 * Fetch and print a formatted terminal report card for a specific problem set
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 */
async function generateTerminalReport(setId, setName) {
    const endpoints = getEndpoints();
    console.log(`\n[INFO] Fetching report data for: ${setName}...`);

    try {
        // 1. Get Exam Session to retrieve exam_id, user_id, and student info
        const sessionRes = await ptaFetch(endpoints.EXAM_SESSION(setId));
        const sessionData = await sessionRes.json();

        if (!sessionData.exam || !sessionData.exam.id) {
            throw new Error("Failed to obtain exam session data.");
        }

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

        console.log("[ Module Scores ]");
        for (const [type, score] of Object.entries(selfRank.typeScores)) {
            const maxTypeScore = summaries[type] ? summaries[type].totalScore : '-';
            console.log(` - ${type.replace(/_/g, ' ')}: ${score} / ${maxTypeScore} pts`);
        }
        console.log("========================================\n");

    } catch (error) {
        console.error(`[ERROR] Failed to generate report: ${error.message}`);
    }
}

module.exports = {
    generateTerminalReport
};
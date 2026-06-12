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

        // 2. Fetch Rankings
        const rankingRes = await ptaFetch(endpoints.COMMON_RANKINGS(setId, userId));
        const rankingData = await rankingRes.json();

        if (!rankingData.selfRanking) {
            console.log("[INFO] No ranking data available for this problem set.");
            return;
        }

        const selfRank = rankingData.selfRanking;

        // 3. Print Report Card
        console.log("\n========================================");
        console.log(` Report Card: ${setName}`);
        console.log("========================================");
        console.log(` User: ${studentName} (${studentNumber})`);
        console.log(` Rank: ${selfRank.rank} / ${rankingData.total}`);
        console.log(` Total Score: ${selfRank.totalScore} pts`);
        console.log(` Total Time: ${selfRank.solvingTime} seconds\n`);

        console.log("[ Module Scores ]");
        for (const [type, score] of Object.entries(selfRank.typeScores)) {
            console.log(` - ${type.replace(/_/g, ' ')}: ${score} pts`);
        }
        console.log("========================================\n");

    } catch (error) {
        console.error(`[ERROR] Failed to generate report: ${error.message}`);
    }
}

module.exports = {
    generateTerminalReport
};
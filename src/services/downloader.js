const fs = require('fs');
const path = require('path');
const { ptaFetch } = require('../api/client');
const { getEndpoints } = require('../api/endpoints');
const { sanitizeFilename, generateMarkdown } = require('./parser');

/**
 * Fetch all problem sets available to the user, handling API pagination automatically.
 * @returns {Promise<Array>} Array of problem set objects
 */
async function fetchAllProblemSets() {
    const endpoints = getEndpoints();
    let allProblemSets = [];
    let page = 0;
    const limit = 50; 
    let total = Infinity;

    console.log("[INFO] Fetching full problem set list from server...");

    while (allProblemSets.length < total) {
        try {
            const response = await ptaFetch(endpoints.ALL_PROBLEM_SETS(page, limit));
            const data = await response.json();

            // Handle potential auth errors
            if (data.error && data.error.code === 'USER_NOT_FOUND') {
                return null; // Return null to signal authentication failure
            }
            if (data.error) {
                throw new Error(`API Error: ${data.error.message || data.error.code}`);
            }

            // On the first request, update the total count target
            if (page === 0 && data.total !== undefined) {
                total = data.total;
            }

            const currentSets = data.problemSets || [];
            if (currentSets.length === 0) break; // Safety break if page is unexpectedly empty

            allProblemSets = allProblemSets.concat(currentSets);
            page++;

            // Small 300ms delay to prevent rate-limiting (WAF defense)
            await new Promise(r => setTimeout(r, 300));
        } catch (error) {
            console.error(`[ERROR] Failed to fetch problem sets on page ${page}: ${error.message}`);
            break;
        }
    }

    console.log(`[INFO] Successfully fetched ${allProblemSets.length} problem sets.`);
    return allProblemSets;
}

/**
 * Simulate exam entry, fetch all problems, and save as Markdown
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 */
async function downloadProblemSet(setId, setName) {
    const endpoints = getEndpoints();
    console.log(`\n[INFO] Initializing exam session for: ${setName}...`);

    try {
        // 1. Trigger Exam Session to get exam_id
        const sessionRes = await ptaFetch(endpoints.EXAM_SESSION(setId));
        const sessionData = await sessionRes.json();
        
        if (!sessionData.exam || !sessionData.exam.id) {
            throw new Error("Failed to obtain exam_id. You might not have permission or the set is not open.");
        }
        const examId = sessionData.exam.id;
        console.log(`[INFO] Session established. Exam ID: ${examId}`);

        // 2. Fetch Problem Summaries (to know what types of problems exist)
        console.log("[INFO] Fetching problem type summaries...");
        const summaryRes = await ptaFetch(endpoints.PROBLEM_SUMMARIES(setId));
        const summaryData = await summaryRes.json();
        
        if (!summaryData.summaries) {
            throw new Error("Failed to fetch problem summaries.");
        }
        const problemTypes = Object.keys(summaryData.summaries);
        console.log(`[INFO] Found problem types: ${problemTypes.join(', ')}`);

        // 3. Fetch problems for each type
        const problemsByType = {};
        for (const type of problemTypes) {
            console.log(`[INFO] Downloading problems of type: ${type}...`);
            const probRes = await ptaFetch(endpoints.EXAM_PROBLEMS(setId, examId, type));
            const probData = await probRes.json();
            
            problemsByType[type] = probData.problemSetProblems || [];
            
            // Tiny delay to avoid rate-limiting
            await new Promise(r => setTimeout(r, 200));
        }

        // 4. Parse into Markdown and save to disk
        console.log("[INFO] Compiling Markdown file...");
        const markdownContent = generateMarkdown(setName, problemsByType);
        
        // Ensure "downloads" directory exists in the project root
        const downloadDir = path.join(__dirname, '../../downloads');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const safeFilename = sanitizeFilename(setName) + '.md';
        const finalPath = path.join(downloadDir, safeFilename);
        
        fs.writeFileSync(finalPath, markdownContent, 'utf8');
        
        console.log(`[SUCCESS] Problem set successfully downloaded and saved to: \n -> ${finalPath}\n`);

    } catch (error) {
        console.error(`[ERROR] Download process failed: ${error.message}`);
    }
}

module.exports = {
    fetchAllProblemSets,
    downloadProblemSet
};
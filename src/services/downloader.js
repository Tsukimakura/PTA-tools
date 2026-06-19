const fs = require('fs');
const path = require('path');
const { ptaFetch } = require('../api/client');
const { getEndpoints } = require('../api/endpoints');
const { sanitizeFilename, generateMarkdown } = require('./parser');
const { ensureExamSession } = require('./examSession');

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
        // 1. Use interceptor to get or start Exam Session
        const sessionData = await ensureExamSession(setId, setName);
        const examId = sessionData.exam.id;

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

/**
 * Export current progress (problems + saved answers) for ONGOING exams
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 */
async function downloadOngoingProgress(setId, setName) {
    const endpoints = getEndpoints();
    console.log(`\n[INFO] Initializing Progress Export Engine for: ${setName}...`);

    try {
        const sessionData = await ensureExamSession(setId, setName);
        const examId = sessionData.exam.id;

        console.log("[INFO] Fetching problem type summaries...");
        const summaryRes = await ptaFetch(endpoints.PROBLEM_SUMMARIES(setId));
        const summaryData = await summaryRes.json();
        const problemTypes = Object.keys(summaryData.summaries || {});

        const problemsByType = {};
        const savedAnswersMap = {}; // Map to store answers without judge logic

        for (const type of problemTypes) {
            console.log(`[INFO] Fetching problems and saved answers for type: ${type}...`);
            const probRes = await ptaFetch(endpoints.EXAM_PROBLEMS(setId, examId, type));
            const probData = await probRes.json();
            const problems = probData.problemSetProblems || [];
            problemsByType[type] = problems;

            // Extract ONLY answers based on problem type
            if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_OR_FALSE') {
                const subRes = await ptaFetch(endpoints.LAST_SUBMISSIONS_BY_TYPE(examId, setId, type));
                const subData = await subRes.json();
                
                if (subData.submission && subData.submission.submissionDetails) {
                    subData.submission.submissionDetails.forEach(detail => {
                        const pid = detail.problemSetProblemId;
                        if (detail.multipleChoiceSubmissionDetail) {
                            savedAnswersMap[pid] = detail.multipleChoiceSubmissionDetail.answer;
                        } else if (detail.trueOrFalseSubmissionDetail) {
                            savedAnswersMap[pid] = detail.trueOrFalseSubmissionDetail.answer;
                        }
                    });
                }
            } else {
                for (const prob of problems) {
                    const subRes = await ptaFetch(endpoints.LAST_SUBMISSIONS_BY_PROBLEM(examId, setId, prob.id));
                    const subData = await subRes.json();
                    
                    if (subData.submission && subData.submission.submissionDetails && subData.submission.submissionDetails.length > 0) {
                        const detail = subData.submission.submissionDetails[0];
                        if (detail.programmingSubmissionDetail) {
                            savedAnswersMap[prob.id] = detail.programmingSubmissionDetail.program;
                        } else if (detail.codeCompletionSubmissionDetail) {
                            savedAnswersMap[prob.id] = detail.codeCompletionSubmissionDetail.program;
                        } else if (detail.fillInTheBlankForProgrammingSubmissionDetail) {
                            const answers = detail.fillInTheBlankForProgrammingSubmissionDetail.answers || [];
                            savedAnswersMap[prob.id] = answers.map((ans, idx) => `/* Blank ${idx + 1} */\n${ans}`).join('\n\n');
                        } else if (detail.multipleFileSubmissionDetail) {
                            const files = detail.multipleFileSubmissionDetail.files || [];
                            const fileContents = detail.multipleFileSubmissionDetail.fileContents || {};
                            if (Object.keys(fileContents).length > 0) {
                                let contentBlocks = [];
                                for (const [filePath, content] of Object.entries(fileContents)) {
                                    contentBlocks.push(`/* --- File: ${filePath} --- */\n${content.trim()}`);
                                }
                                savedAnswersMap[prob.id] = `/* MULTIPLE FILE (Inline) */\n\n${contentBlocks.join('\n\n')}`;
                            } else if (files.length > 0) {
                                const fileList = files.map(f => `- ${f.path}`).join('\n');
                                savedAnswersMap[prob.id] = `/* MULTIPLE FILE (Zip) */\n${fileList}`;
                            }
                        }
                    }
                    await new Promise(r => setTimeout(r, 150));
                }
            }
            await new Promise(r => setTimeout(r, 200));
        }

        console.log("[INFO] Compiling Markdown file with saved answers...");
        const markdownContent = generateMarkdown(setName, problemsByType, savedAnswersMap);
        
        const downloadDir = path.join(__dirname, '../../downloads');
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

        const safeFilename = `[Progress] ${sanitizeFilename(setName)}.md`;
        const finalPath = path.join(downloadDir, safeFilename);
        
        fs.writeFileSync(finalPath, markdownContent, 'utf8');
        console.log(`[SUCCESS] Current progress successfully exported to: \n -> ${finalPath}\n`);

    } catch (error) {
        if (error.message === "USER_CANCELED") {
            console.log("[INFO] Progress export canceled.");
            return;
        }
        console.error(`[ERROR] Export process failed: ${error.message}`);
    }
}

module.exports = {
    fetchAllProblemSets,
    downloadProblemSet,
    downloadOngoingProgress
};
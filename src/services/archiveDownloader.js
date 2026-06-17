const fs = require('fs');
const path = require('path');
const { ptaFetch } = require('../api/client');
const { getEndpoints } = require('../api/endpoints');
const { sanitizeFilename, generateArchiveMarkdown } = require('./archiveParser');
const { ensureExamSession } = require('./examSession');

async function downloadArchive(setId, setName) {
    const endpoints = getEndpoints();
    console.log(`\n[INFO] Initializing Archive Engine for: ${setName}...`);

    try {
        // 1. Use interceptor to get or start Exam Session
        const sessionData = await ensureExamSession(setId, setName);
        const examId = sessionData.exam.id;

        // 2. Fetch Problem Summaries
        console.log("[INFO] Fetching problem schema...");
        const summaryRes = await ptaFetch(endpoints.PROBLEM_SUMMARIES(setId));
        const summaryData = await summaryRes.json();
        
        if (!summaryData.summaries) throw new Error("Failed to fetch problem summaries.");
        const problemTypes = Object.keys(summaryData.summaries);

        const problemsByType = {};
        const submissionMap = {};

        // 3. Fetch Problems and Submissions
        for (const type of problemTypes) {
            console.log(`[INFO] Processing problem type: ${type}...`);
            
            // Fetch raw problems
            const probRes = await ptaFetch(endpoints.EXAM_PROBLEMS(setId, examId, type));
            const probData = await probRes.json();
            const problems = probData.problemSetProblems || [];
            problemsByType[type] = problems;

            // Fetch submissions based on problem type logic
            if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_OR_FALSE') {
                const subRes = await ptaFetch(endpoints.LAST_SUBMISSIONS_BY_TYPE(examId, setId, type));
                const subData = await subRes.json();
                
                if (subData.submission) {
                    const details = subData.submission.submissionDetails || [];
                    const judges = subData.submission.judgeResponseContents || [];
                    
                    details.forEach(detail => {
                        const pid = detail.problemSetProblemId;
                        if (!submissionMap[pid]) submissionMap[pid] = {};
                        
                        // Handle different choice question payloads
                        if (detail.multipleChoiceSubmissionDetail) {
                            submissionMap[pid].answer = detail.multipleChoiceSubmissionDetail.answer;
                        } else if (detail.trueOrFalseSubmissionDetail) {
                            submissionMap[pid].answer = detail.trueOrFalseSubmissionDetail.answer;
                        }
                    });

                    judges.forEach(judge => {
                        const pid = judge.problemSetProblemId;
                        if (!submissionMap[pid]) submissionMap[pid] = {};
                        submissionMap[pid].status = judge.status;
                        submissionMap[pid].score = judge.score;
                    });
                }
            } 
            // Branch specifically for Fill-in-the-blank programming questions
            else if (type === 'FILL_IN_THE_BLANK_FOR_PROGRAMMING') {
                const subRes = await ptaFetch(endpoints.LAST_SUBMISSIONS_BY_TYPE(examId, setId, type));
                const subData = await subRes.json();
                
                if (subData.submission) {
                    const s = subData.submission;
                    const details = s.submissionDetails || [];
                    const judges = s.judgeResponseContents || [];
                    
                    details.forEach(detail => {
                        const pid = detail.problemSetProblemId;
                        if (!submissionMap[pid]) submissionMap[pid] = {};
                        
                        if (detail.fillInTheBlankForProgrammingSubmissionDetail) {
                            const answers = detail.fillInTheBlankForProgrammingSubmissionDetail.answers || [];
                            // Convert the array of answers into a readable code-like block with comments
                            submissionMap[pid].program = answers.map((ans, idx) => `/* Blank ${idx + 1} */\n${ans}`).join('\n\n');
                        }
                    });

                    judges.forEach(judge => {
                        const pid = judge.problemSetProblemId;
                        if (!submissionMap[pid]) submissionMap[pid] = {};
                        
                        submissionMap[pid].status = judge.status;
                        submissionMap[pid].score = judge.score;
                        // Inherit global submission metrics for the problem
                        submissionMap[pid].compiler = s.compiler || 'NO_COMPILER';
                        submissionMap[pid].time = s.time || 0;
                        submissionMap[pid].memory = s.memory || 0;
                        
                        if (judge.fillInTheBlankForProgrammingResponseContent) {
                            submissionMap[pid].testcases = judge.fillInTheBlankForProgrammingResponseContent.contents || [];
                        }
                    });
                }
            }
            else if (type === 'PROGRAMMING') {
                // Programming submissions must be fetched individually by problem ID
                for (const prob of problems) {
                    const subRes = await ptaFetch(endpoints.LAST_SUBMISSIONS_BY_PROBLEM(examId, setId, prob.id));
                    const subData = await subRes.json();
                    
                    if (subData.submission) {
                        const s = subData.submission;
                        const detail = s.submissionDetails && s.submissionDetails.length > 0 ? s.submissionDetails[0] : null;
                        const judge = s.judgeResponseContents && s.judgeResponseContents.length > 0 ? s.judgeResponseContents[0] : null;
                        
                        submissionMap[prob.id] = {
                            status: s.status,
                            score: s.score,
                            time: s.time,
                            memory: s.memory,
                            compiler: s.compiler,
                            program: detail && detail.programmingSubmissionDetail ? detail.programmingSubmissionDetail.program : 'NO CODE EXPORTED',
                            testcases: judge && judge.programmingJudgeResponseContent ? judge.programmingJudgeResponseContent.testcaseJudgeResults : {},
                            hints: s.hints || {}
                        };
                    }
                    await new Promise(r => setTimeout(r, 150)); // Prevent rate-limiting
                }
            }
            await new Promise(r => setTimeout(r, 200));
        }

        // 4. Compile and Save
        console.log("[INFO] Merging source code and generating Markdown Archive...");
        const markdownContent = generateArchiveMarkdown(setName, problemsByType, submissionMap);
        
        const downloadDir = path.join(__dirname, '../../downloads');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const safeFilename = `[Archive] ${sanitizeFilename(setName)}.md`;
        const finalPath = path.join(downloadDir, safeFilename);
        
        fs.writeFileSync(finalPath, markdownContent, 'utf8');
        
        console.log(`[SUCCESS] Archive successfully generated and saved to: \n -> ${finalPath}\n`);

    } catch (error) {
        console.error(`[ERROR] Archive download failed: ${error.message}`);
    }
}

module.exports = { downloadArchive };
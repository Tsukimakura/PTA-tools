const inquirer = require('inquirer');
const { ptaFetch } = require('../api/client');
const { getEndpoints } = require('../api/endpoints');
const { ensureExamSession } = require('./examSession');

/**
 * Clean HTML and limit string length for terminal display
 */
function formatTitleForCli(rawTitle) {
    if (!rawTitle) return "Unknown Title";
    let cleanTitle = rawTitle.replace(/<[^>]+>/g, '').trim();
    if (cleanTitle.length > 50) return cleanTitle.substring(0, 47) + '...';
    return cleanTitle;
}

/**
 * Handle interactive submission for supported problem types
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 * @param {string} problemType - The type of problems to answer
 */
async function submitInteractiveAnswers(setId, setName, problemType) {
    const endpoints = getEndpoints();
    console.log(`\n[INFO] Initializing Submission Engine for [${problemType}]...`);

    try {
        const sessionData = await ensureExamSession(setId, setName);
        const examId = sessionData.exam.id;

        console.log("[INFO] Fetching problem list...");
        const probRes = await ptaFetch(endpoints.EXAM_PROBLEMS(setId, examId, problemType));
        const probData = await probRes.json();
        const problems = probData.problemSetProblems || [];

        if (problems.length === 0) {
            console.log(`[INFO] No problems found for type: ${problemType}`);
            return;
        }

        console.log("[INFO] Fetching saved progress to prevent data overwrite...");
        const subRes = await ptaFetch(endpoints.LAST_SUBMISSIONS_BY_TYPE(examId, setId, problemType));
        const subData = await subRes.json();
        
        const existingAnswers = {};
        if (subData.submission && subData.submission.submissionDetails) {
            subData.submission.submissionDetails.forEach(detail => {
                const pid = detail.problemSetProblemId;
                if (problemType === 'MULTIPLE_CHOICE' && detail.multipleChoiceSubmissionDetail) {
                    existingAnswers[pid] = detail.multipleChoiceSubmissionDetail.answer;
                } else if (problemType === 'TRUE_OR_FALSE' && detail.trueOrFalseSubmissionDetail) {
                    existingAnswers[pid] = detail.trueOrFalseSubmissionDetail.answer;
                } else if (problemType === 'FILL_IN_THE_BLANK_FOR_PROGRAMMING' && detail.fillInTheBlankForProgrammingSubmissionDetail) {
                    // Array of answers for multiple blanks
                    existingAnswers[pid] = detail.fillInTheBlankForProgrammingSubmissionDetail.answers || [];
                }
            });
        }

        console.log("\n----------------------------------------");
        console.log(` Answer Interface: ${problemType.replace(/_/g, ' ')}`);
        if (problemType.includes('FILL_IN_THE_BLANK')) {
            console.log(" Instructions: Press [ENTER] to keep default. Type '!CLEAR' to empty a blank. Type '!ABORT' to exit.");
        } else {
            console.log(" Instructions: Select 'SKIP' to keep current answer. Select 'ABORT' to exit entirely.");
        }
        console.log("----------------------------------------\n");

        const newAnswers = {};

        for (let i = 0; i < problems.length; i++) {
            const prob = problems[i];
            const label = prob.label ? `[${prob.label}] ` : '';
            const displayTitle = formatTitleForCli(prob.title);
            
            // -----------------------------------------------------
            // Branch A: Objective Questions (MCQ, T/F)
            // -----------------------------------------------------
            if (problemType === 'MULTIPLE_CHOICE' || problemType === 'TRUE_OR_FALSE') {
                const currentSaved = existingAnswers[prob.id] || 'UNANSWERED';
                let choices = [];
                
                if (problemType === 'TRUE_OR_FALSE') {
                    choices = [
                        { name: 'TRUE (T)', value: 'TRUE' },
                        { name: 'FALSE (F)', value: 'FALSE' },
                        new inquirer.Separator(),
                        { name: 'SKIP (Keep current / Unanswered)', value: 'SKIP' },
                        { name: 'ABORT (Exit without saving)', value: 'ABORT' }
                    ];
                } else {
                    choices = [
                        'A', 'B', 'C', 'D', 'E', 'F',
                        new inquirer.Separator(),
                        { name: 'SKIP (Keep current / Unanswered)', value: 'SKIP' },
                        { name: 'ABORT (Exit without saving)', value: 'ABORT' }
                    ];
                }

                let defaultIndex = choices.findIndex(c => (typeof c === 'string' ? c : c.value) === currentSaved);
                if (defaultIndex === -1) defaultIndex = choices.findIndex(c => (typeof c === 'string' ? c : c.value) === 'SKIP');
                
                const { answer } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'answer',
                        message: `Q${i + 1} ${label}${displayTitle}\n  Current: ${currentSaved}\n  Your Answer:`,
                        choices: choices,
                        default: defaultIndex,
                        prefix: '?'
                    }
                ]);

                if (answer === 'ABORT') {
                    console.log("\n[INFO] Submission aborted by user. No answers were uploaded.");
                    return; 
                }

                if (answer !== 'SKIP') newAnswers[prob.id] = answer;
            }
            // -----------------------------------------------------
            // Branch B: Fill-in-the-Blank for Programming
            // -----------------------------------------------------
            else if (problemType === 'FILL_IN_THE_BLANK_FOR_PROGRAMMING') {
                const config = prob.problemConfig && prob.problemConfig.fillInTheBlankForProgrammingProblemConfig;
                const blanksCount = config && config.blanks ? config.blanks.length : 0;
                
                if (blanksCount === 0) {
                    console.log(`[WARN] Skipping Q${i + 1} ${label} - No blanks detected in API payload.`);
                    continue;
                }

                console.log(`? Q${i + 1} ${label}${displayTitle} (${blanksCount} Blanks)`);
                const currentAnswers = existingAnswers[prob.id] || [];
                const updatedAnswers = [];
                let hasChanges = false;
                let userAborted = false;

                for (let b = 0; b < blanksCount; b++) {
                    const defaultVal = currentAnswers[b] !== undefined ? currentAnswers[b] : '';
                    const displayDefault = defaultVal === '' ? '(Empty)' : defaultVal;

                    const { blankInput } = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'blankInput',
                            message: `  Blank ${b + 1} [Default: ${displayDefault}]:`,
                            default: defaultVal,
                            prefix: ' '
                        }
                    ]);

                    if (blankInput === '!ABORT') {
                        userAborted = true;
                        break;
                    }

                    let finalVal = blankInput;
                    if (blankInput === '!CLEAR') finalVal = '';
                    
                    updatedAnswers.push(finalVal);
                    if (finalVal !== defaultVal) hasChanges = true;
                }

                if (userAborted) {
                    console.log("\n[INFO] Submission aborted by user. No answers were uploaded.");
                    return;
                }

                // Only record to newAnswers map if the array actually changed
                if (hasChanges) {
                    newAnswers[prob.id] = updatedAnswers;
                }
            }
        }

        // Build Final Payload
        const finalAnswersMap = { ...existingAnswers, ...newAnswers };
        const detailsPayload = [];

        for (const [probId, ans] of Object.entries(finalAnswersMap)) {
            const detailObj = {
                problemId: "0",
                problemSetProblemId: probId
            };
            
            if (problemType === 'MULTIPLE_CHOICE') {
                detailObj.multipleChoiceSubmissionDetail = { answer: ans };
            } else if (problemType === 'TRUE_OR_FALSE') {
                detailObj.trueOrFalseSubmissionDetail = { answer: ans };
            } else if (problemType === 'FILL_IN_THE_BLANK_FOR_PROGRAMMING') {
                detailObj.fillInTheBlankForProgrammingSubmissionDetail = { answers: ans };
            }
            
            detailsPayload.push(detailObj);
        }

        if (detailsPayload.length === 0) {
            console.log("\n[INFO] No valid answers to submit. Aborting request.");
            return;
        }

        const payload = {
            problemType: problemType,
            details: detailsPayload
        };

        console.log("\n[INFO] Transmitting payload to server...");
        const postRes = await ptaFetch(endpoints.SUBMIT_EXAM(examId), {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json;charset=UTF-8' }
        });

        const postData = await postRes.json();

        if (postData.error) {
            throw new Error(`Submission rejected: ${postData.error.message || postData.error.code}`);
        }

        console.log(`[SUCCESS] Answers successfully submitted! (Submission ID: ${postData.submissionId})`);
        console.log(`[INFO] Server status code: 200 OK. Grading is deferred by server config.`);

    } catch (error) {
        if (error.message === "USER_CANCELED") {
            console.log("[INFO] Operation canceled by user.");
            return;
        }
        console.error(`\n[ERROR] Submission failed: ${error.message}`);
    }
}

/**
 * Dispatcher for selecting which problem type to answer
 */
async function handleSubmissionDispatcher(selectedSet) {
    const endpoints = getEndpoints();
    try {
        const summaryRes = await ptaFetch(endpoints.PROBLEM_SUMMARIES(selectedSet.id));
        const summaryData = await summaryRes.json();
        const availableTypes = Object.keys(summaryData.summaries || {});

        const supportedTypes = ['TRUE_OR_FALSE', 'MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK_FOR_PROGRAMMING'];
        const validTypes = availableTypes.filter(t => supportedTypes.includes(t));

        if (validTypes.length === 0) {
            console.log("\n[WARN] This problem set contains no supported interactive questions.");
            return;
        }

        const { targetType } = await inquirer.prompt([
            {
                type: 'list',
                name: 'targetType',
                message: 'Select problem type to answer:',
                prefix: '>',
                choices: [
                    ...validTypes.map(t => ({ name: t.replace(/_/g, ' '), value: t })),
                    { name: '< Cancel', value: 'CANCEL' }
                ]
            }
        ]);

        if (targetType !== 'CANCEL') {
            await submitInteractiveAnswers(selectedSet.id, selectedSet.name, targetType);
        }
    } catch (error) {
        console.error(`[ERROR] Dispatcher encountered an issue: ${error.message}`);
    }
}

module.exports = {
    handleSubmissionDispatcher
};
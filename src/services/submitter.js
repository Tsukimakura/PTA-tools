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
 * Format answer array or string for compact menu display
 */
function formatAnswerForMenu(ans) {
    if (ans === undefined || ans === null || ans === 'UNANSWERED') return 'UNANSWERED';
    let displayAns = ans;
    if (Array.isArray(ans)) {
        displayAns = ans.map(a => a === '' ? '(Empty)' : a).join(' | ');
    }
    if (typeof displayAns === 'string' && displayAns.length > 25) {
        return displayAns.substring(0, 22) + '...';
    }
    return displayAns;
}

/**
 * Handle interactive submission with a random-access modification menu
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 * @param {string} problemType - The type of problems to answer
 */
async function submitInteractiveAnswers(setId, setName, problemType) {
    const endpoints = getEndpoints();
    console.log(`\n[INFO] Initializing Submission Engine for [${problemType}]...`);

    try {
        // 1. Initialization & Fetch Data
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

        console.log("[INFO] Fetching saved progress from server...");
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
                    existingAnswers[pid] = detail.fillInTheBlankForProgrammingSubmissionDetail.answers || [];
                }
            });
        }

        // 2. Staging Area for Local Modifications
        const stagedAnswers = {};

        // 3. Interactive Modification Loop
        while (true) {
            console.log("\n========================================");
            console.log(` Editor: ${problemType.replace(/_/g, ' ')}`);
            console.log("========================================");

            const questionChoices = problems.map((prob, index) => {
                const label = prob.label ? `[${prob.label}] ` : '';
                const displayTitle = formatTitleForCli(prob.title);
                
                // Determine the effective answer (staged overrides existing)
                const effectiveAns = stagedAnswers[prob.id] !== undefined 
                    ? stagedAnswers[prob.id] 
                    : (existingAnswers[prob.id] || 'UNANSWERED');
                
                const displayAns = formatAnswerForMenu(effectiveAns);
                const isModifiedMark = stagedAnswers[prob.id] !== undefined ? ' *[Modified]*' : '';

                return {
                    name: `Q${index + 1} ${label}${displayTitle}\n      -> ${displayAns}${isModifiedMark}`,
                    value: prob.id
                };
            });

            questionChoices.push(new inquirer.Separator());
            questionChoices.push({ name: '[√] SUBMIT ALL CHANGES TO SERVER', value: 'ACTION_SUBMIT' });
            questionChoices.push({ name: '[x] ABORT (Discard local changes & Exit)', value: 'ACTION_ABORT' });

            const { selectedTarget } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selectedTarget',
                    message: 'Select a question to modify, or execute an action:',
                    choices: questionChoices,
                    pageSize: 15
                }
            ]);

            // Handle Global Actions
            if (selectedTarget === 'ACTION_ABORT') {
                console.log("\n[INFO] Editor closed. Local modifications discarded.");
                return;
            }
            if (selectedTarget === 'ACTION_SUBMIT') {
                break; // Break the loop to proceed to the API POST phase
            }

            // 4. Handle Specific Question Routing
            const targetProb = problems.find(p => p.id === selectedTarget);
            const qIndex = problems.findIndex(p => p.id === selectedTarget) + 1;
            const label = targetProb.label ? `[${targetProb.label}] ` : '';
            const displayTitle = formatTitleForCli(targetProb.title);
            
            const currentEffectiveAns = stagedAnswers[targetProb.id] !== undefined 
                ? stagedAnswers[targetProb.id] 
                : (existingAnswers[targetProb.id] || 'UNANSWERED');

            console.log(`\n--- Editing Q${qIndex} ---`);

            // -----------------------------------------------------
            // Sub-Routine A: Objective Questions
            // -----------------------------------------------------
            if (problemType === 'MULTIPLE_CHOICE' || problemType === 'TRUE_OR_FALSE') {
                let choices = [];
                if (problemType === 'TRUE_OR_FALSE') {
                    choices = [
                        { name: 'TRUE (T)', value: 'TRUE' },
                        { name: 'FALSE (F)', value: 'FALSE' }
                    ];
                } else {
                    choices = ['A', 'B', 'C', 'D', 'E', 'F'];
                }
                choices.push(new inquirer.Separator());
                choices.push({ name: '< BACK (Keep current & Return to Menu)', value: 'ACTION_BACK' });

                let defaultIndex = choices.findIndex(c => (typeof c === 'string' ? c : c.value) === currentEffectiveAns);
                if (defaultIndex === -1) defaultIndex = 0;

                const { answer } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'answer',
                        message: `Q${qIndex} ${label}${displayTitle}\n  Current: ${currentEffectiveAns}\n  New Answer:`,
                        choices: choices,
                        default: defaultIndex,
                        prefix: '?'
                    }
                ]);

                if (answer !== 'ACTION_BACK') {
                    stagedAnswers[targetProb.id] = answer;
                }
            }
            // -----------------------------------------------------
            // Sub-Routine B: Fill-in-the-Blank for Programming
            // -----------------------------------------------------
            else if (problemType === 'FILL_IN_THE_BLANK_FOR_PROGRAMMING') {
                const config = targetProb.problemConfig && targetProb.problemConfig.fillInTheBlankForProgrammingProblemConfig;
                const blanksCount = config && config.blanks ? config.blanks.length : 0;
                
                if (blanksCount === 0) {
                    console.log(`[WARN] No blanks detected in API payload for this question.`);
                    continue;
                }

                console.log(`Instructions: Press [ENTER] to keep default. Type '!CLEAR' to empty. Type '!BACK' to cancel edit.`);
                const baseAnswers = currentEffectiveAns === 'UNANSWERED' ? [] : currentEffectiveAns;
                const updatedAnswers = [];
                let userBackedOut = false;

                for (let b = 0; b < blanksCount; b++) {
                    const defaultVal = baseAnswers[b] !== undefined ? baseAnswers[b] : '';
                    const displayDefault = defaultVal === '' ? '(Empty)' : defaultVal;

                    const { blankInput } = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'blankInput',
                            message: `  Blank ${b + 1}/${blanksCount} [Default: ${displayDefault}]:`,
                            default: defaultVal,
                            prefix: ' '
                        }
                    ]);

                    if (blankInput === '!BACK') {
                        userBackedOut = true;
                        break;
                    }

                    updatedAnswers.push(blankInput === '!CLEAR' ? '' : blankInput);
                }

                if (!userBackedOut) {
                    // Check if array is deeply different (simple stringify comparison)
                    if (JSON.stringify(updatedAnswers) !== JSON.stringify(baseAnswers)) {
                        stagedAnswers[targetProb.id] = updatedAnswers;
                    }
                }
            }
            // -----------------------------------------------------
            // Sub-Routine C: Programming / Function (Future Implementation)
            // -----------------------------------------------------
            else if (problemType === 'PROGRAMMING' || problemType === 'MULTIPLE_FILE') {
                console.log(`[WARN] Interactive local-file submission for ${problemType} is not yet implemented.`);
                // Here we will eventually prompt the user for a file path, read it, and add to stagedAnswers.
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        // 5. Build Final Payload and Submit
        if (Object.keys(stagedAnswers).length === 0) {
            console.log("\n[INFO] No changes were made. Aborting request.");
            return;
        }

        // Merge existing answers with staged answers
        const finalAnswersMap = { ...existingAnswers, ...stagedAnswers };
        const detailsPayload = [];

        for (const [probId, ans] of Object.entries(finalAnswersMap)) {
            const detailObj = { problemId: "0", problemSetProblemId: probId };
            
            if (problemType === 'MULTIPLE_CHOICE') {
                detailObj.multipleChoiceSubmissionDetail = { answer: ans };
            } else if (problemType === 'TRUE_OR_FALSE') {
                detailObj.trueOrFalseSubmissionDetail = { answer: ans };
            } else if (problemType === 'FILL_IN_THE_BLANK_FOR_PROGRAMMING') {
                detailObj.fillInTheBlankForProgrammingSubmissionDetail = { answers: ans };
            }
            // Future extensions for programming will go here
            
            detailsPayload.push(detailObj);
        }

        const payload = {
            problemType: problemType,
            details: detailsPayload
        };

        console.log("\n[INFO] Transmitting updated payload to server...");
        const postRes = await ptaFetch(endpoints.SUBMIT_EXAM(examId), {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json;charset=UTF-8' }
        });

        const postData = await postRes.json();

        if (postData.error) {
            throw new Error(`Submission rejected: ${postData.error.message || postData.error.code}`);
        }

        console.log(`[SUCCESS] Answers successfully updated! (Submission ID: ${postData.submissionId})`);

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
const fs = require('fs');
const path = require('path');
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
function formatAnswerForMenu(ans, problemType) {
    if (ans === undefined || ans === null || ans === 'UNANSWERED') return 'UNANSWERED';
    
    if (problemType === 'CODE_COMPLETION' || problemType === 'PROGRAMMING') {
        if (typeof ans === 'object' && ans.program !== undefined) {
            const byteSize = Buffer.byteLength(ans.program, 'utf8');
            return `[Code: ${byteSize} bytes | Compiler: ${ans.compiler}]`;
        }
        // Fallback safety
        return `[Code Loaded]`;
    }

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
 * Asynchronously poll the judge result until it completes or times out
 */
async function pollJudgeResult(examId, setId, probId, maxRetries = 15) {
    const endpoints = getEndpoints();
    let attempts = 0;

    while (attempts < maxRetries) {
        await new Promise(r => setTimeout(r, 1500)); // 1.5s interval
        
        try {
            const res = await ptaFetch(endpoints.LAST_SUBMISSIONS_BY_PROBLEM(examId, setId, probId));
            const data = await res.json();
            
            if (data && data.submission) {
                const status = data.submission.status;
                if (status !== 'WAITING' && status !== 'JUDGING') {
                    return data.submission; // Judging finished
                }
            }
        } catch (err) {
            // Ignore temporary network errors during polling
        }
        attempts++;
    }
    return null; // Timeout
}

/**
 * Print detailed testcase results and compiler output in a formatted ASCII table
 */
function printJudgeReport(probTitle, submissionData) {
    console.log(`\n--- Judge Report: ${probTitle} ---`);
    console.log(`Final Status: ${submissionData.status} | Score: ${submissionData.score}`);

    const judges = submissionData.judgeResponseContents || [];
    if (judges.length === 0) {
        console.log("[INFO] No detailed judge response contents available.");
        return;
    }

    const judgeData = judges[0];
    let compilationLog = "";
    let testcases = null;

    // Extract data dynamically based on the specific judge response structure
    if (judgeData.codeCompletionJudgeResponseContent) {
        const compRes = judgeData.codeCompletionJudgeResponseContent.compilationResult;
        compilationLog = compRes ? (compRes.log || "") : "";
        testcases = judgeData.codeCompletionJudgeResponseContent.testcaseJudgeResults;
    } else if (judgeData.programmingJudgeResponseContent) {
        const compRes = judgeData.programmingJudgeResponseContent.compilationResult;
        compilationLog = compRes ? (compRes.log || "") : "";
        testcases = judgeData.programmingJudgeResponseContent.testcaseJudgeResults;
    } else {
        // Fallback for objective questions or other types
        testcases = judgeData.testcaseJudgeResults;
    }

    // Display Compiler Output if it exists
    if (compilationLog.trim() !== "") {
        console.log("\n[ Compiler Output ]");
        console.log("".padEnd(85, "-"));
        console.log(compilationLog.trim());
        console.log("".padEnd(85, "-") + "\n");
    }

    const hints = submissionData.hints || {};

    if (!testcases) {
        console.log("[INFO] No testcase specifics provided by server.");
        return;
    }

    console.log("".padEnd(85, "-"));
    console.log(`| ${"Case".padEnd(4)} | ${"Status".padEnd(18)} | ${"Score".padEnd(5)} | ${"Time(s)".padEnd(7)} | ${"Mem(KB)".padEnd(7)} | ${"Hint"}`);
    console.log("".padEnd(85, "-"));

    for (const [caseId, caseData] of Object.entries(testcases)) {
        const status = caseData.result || "UNKNOWN";
        const score = caseData.testcaseScore !== undefined ? caseData.testcaseScore.toString() : "-";
        const time = caseData.time !== undefined ? caseData.time.toFixed(3) : "-";
        const mem = caseData.memory !== undefined ? Math.round(caseData.memory / 1024).toString() : "-";
        const hint = hints[caseId] || "-";

        // Truncate hint if too long for terminal
        const displayHint = hint.length > 25 ? hint.substring(0, 22) + "..." : hint;

        console.log(`| ${caseId.padEnd(4)} | ${status.padEnd(18)} | ${score.padEnd(5)} | ${time.padEnd(7)} | ${mem.padEnd(7)} | ${displayHint}`);
    }
    console.log("".padEnd(85, "-") + "\n");
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
                } else if (problemType === 'CODE_COMPLETION' && detail.codeCompletionSubmissionDetail) {
                    existingAnswers[pid] = {
                        program: detail.codeCompletionSubmissionDetail.program || "",
                        compiler: detail.codeCompletionSubmissionDetail.compiler || "NO_COMPILER"
                    };
                } else if (problemType === 'PROGRAMMING' && detail.programmingSubmissionDetail) {
                    existingAnswers[pid] = {
                        program: detail.programmingSubmissionDetail.program || "",
                        compiler: detail.programmingSubmissionDetail.compiler || "NO_COMPILER"
                    };
                }
            });
        }

        const stagedAnswers = {};

        // Main Modification Loop
        while (true) {
            console.log("\n========================================");
            console.log(` Editor: ${problemType.replace(/_/g, ' ')}`);
            console.log("========================================");

            const questionChoices = problems.map((prob, index) => {
                const label = prob.label ? `[${prob.label}] ` : '';
                const displayTitle = formatTitleForCli(prob.title);
                
                const effectiveAns = stagedAnswers[prob.id] !== undefined 
                    ? stagedAnswers[prob.id] 
                    : (existingAnswers[prob.id] || 'UNANSWERED');
                
                const displayAns = formatAnswerForMenu(effectiveAns, problemType);
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

            if (selectedTarget === 'ACTION_ABORT') {
                console.log("\n[INFO] Editor closed. Local modifications discarded.");
                return;
            }
            if (selectedTarget === 'ACTION_SUBMIT') {
                break;
            }

            const targetProb = problems.find(p => p.id === selectedTarget);
            const qIndex = problems.findIndex(p => p.id === selectedTarget) + 1;
            const label = targetProb.label ? `[${targetProb.label}] ` : '';
            const displayTitle = formatTitleForCli(targetProb.title);
            
            const currentEffectiveAns = stagedAnswers[targetProb.id] !== undefined 
                ? stagedAnswers[targetProb.id] 
                : (existingAnswers[targetProb.id] || 'UNANSWERED');

            console.log(`\n--- Editing Q${qIndex} ---`);

            // Branch A: Objective Questions
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

                if (answer !== 'ACTION_BACK') stagedAnswers[targetProb.id] = answer;
            }
            // Branch B: Fill-in-the-Blank for Programming
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

                if (!userBackedOut && JSON.stringify(updatedAnswers) !== JSON.stringify(baseAnswers)) {
                    stagedAnswers[targetProb.id] = updatedAnswers;
                }
            }
            // Branch C: Programming / Function Code Injection
            else if (problemType === 'CODE_COMPLETION' || problemType === 'PROGRAMMING') {
                console.log(`Instructions: Enter the relative or absolute path to your source file.`);
                console.log(`Example: ./src/6-1.c or C:\\workspace\\solution.cpp\n`);

                const { filePath } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'filePath',
                        message: `Source file path (Type '!BACK' to cancel):`,
                        prefix: '>'
                    }
                ]);

                if (filePath === '!BACK') continue;

                try {
                    const absolutePath = path.resolve(process.cwd(), filePath.trim());
                    const codeContent = fs.readFileSync(absolutePath, 'utf8');
                    
                    if (codeContent.trim() === '') {
                        console.log(`[WARN] The specified file is empty. Please check the file content.`);
                        continue;
                    }

                    // Prompt for compiler selection
                    let previousCompiler = 'GCC';
                    if (currentEffectiveAns && currentEffectiveAns.compiler && currentEffectiveAns.compiler !== 'NO_COMPILER') {
                        previousCompiler = currentEffectiveAns.compiler;
                    }

                    const { compilerChoice } = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'compilerChoice',
                            message: 'Select the compiler environment:',
                            choices: [
                                'GCC', 'GXX', 'CLANG', 'CLANGXX', 
                                'PYTHON3', 'JAVA', 'JAVASCRIPT', 'GO'
                            ],
                            default: previousCompiler,
                            prefix: '>'
                        }
                    ]);

                    // Store both program content and compiler selection
                    stagedAnswers[targetProb.id] = {
                        program: codeContent,
                        compiler: compilerChoice
                    };
                    
                    console.log(`[SUCCESS] Loaded ${Buffer.byteLength(codeContent, 'utf8')} bytes from: ${absolutePath}`);
                    
                    // Show a quick preview of the first 3 lines
                    const previewLines = codeContent.split('\n').slice(0, 3).join('\n');
                    console.log(`\n--- Code Preview ---\n${previewLines}\n--------------------\n`);
                    await new Promise(r => setTimeout(r, 1500));

                } catch (fsError) {
                    console.log(`[ERROR] Failed to read file: ${fsError.message}`);
                    console.log(`[INFO] Please ensure the path is correct and the file has read permissions.`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        // Final Payload Construction
        if (Object.keys(stagedAnswers).length === 0) {
            console.log("\n[INFO] No changes were made. Aborting request.");
            return;
        }

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
            } else if (problemType === 'CODE_COMPLETION') {
                detailObj.codeCompletionSubmissionDetail = {
                    program: ans.program,
                    compiler: ans.compiler
                };
            } else if (problemType === 'PROGRAMMING') {
                detailObj.programmingSubmissionDetail = {
                    program: ans.program,
                    compiler: ans.compiler
                };
            }
            
            detailsPayload.push(detailObj);
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

        console.log(`[SUCCESS] Answers successfully committed! (Submission ID: ${postData.submissionId})`);

        // Trigger Active Polling for Code Executions
        if (problemType === 'CODE_COMPLETION' || problemType === 'PROGRAMMING') {
            console.log(`[INFO] Code submission detected. Initiating sandbox judge polling...`);
            
            const stagedProbIds = Object.keys(stagedAnswers);
            for (const probId of stagedProbIds) {
                const targetProb = problems.find(p => p.id === probId);
                const displayTitle = formatTitleForCli(targetProb.title);
                
                process.stdout.write(`\n[JUDGE] Waiting for results on [${targetProb.label}] ${displayTitle}... `);
                
                const resultData = await pollJudgeResult(examId, setId, probId);
                
                if (resultData) {
                    process.stdout.write(`Done.\n`);
                    printJudgeReport(displayTitle, resultData);
                } else {
                    process.stdout.write(`TIMEOUT.\n`);
                    console.log(`[WARN] Polling timed out. The server might be experiencing high load.`);
                }
            }
        }

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

        const supportedTypes = ['TRUE_OR_FALSE', 'MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK_FOR_PROGRAMMING', 'CODE_COMPLETION', 'PROGRAMMING'];
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
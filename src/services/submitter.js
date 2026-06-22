const inquirer = require('inquirer');
const { ptaFetch } = require('../api/client');
const { getEndpoints } = require('../api/endpoints');
const { ensureExamSession } = require('./examSession');

/**
 * Handle interactive submission for objective problem types (T/F, Multiple Choice)
 * @param {string} setId - The target problem set ID
 * @param {string} setName - The original name of the problem set
 * @param {string} problemType - The type of problems to answer (e.g., 'TRUE_OR_FALSE')
 */
async function submitObjectiveAnswers(setId, setName, problemType) {
    const endpoints = getEndpoints();
    console.log(`\n[INFO] Initializing Submission Engine for [${problemType}]...`);

    try {
        // 1. Ensure active exam session
        const sessionData = await ensureExamSession(setId, setName);
        const examId = sessionData.exam.id;

        // 2. Fetch all problems of this type to build the question list
        console.log("[INFO] Fetching problem list...");
        const probRes = await ptaFetch(endpoints.EXAM_PROBLEMS(setId, examId, problemType));
        const probData = await probRes.json();
        const problems = probData.problemSetProblems || [];

        if (problems.length === 0) {
            console.log(`[INFO] No problems found for type: ${problemType}`);
            return;
        }

        // 3. Fetch last submissions to prevent overwriting existing answers
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
                }
            });
        }

        // 4. Interactive CLI Prompting
        console.log("\n----------------------------------------");
        console.log(` Answer Interface: ${problemType.replace(/_/g, ' ')}`);
        console.log(" Instructions: Select 'SKIP' to keep current answer. Select 'ABORT' to exit entirely.");
        console.log("----------------------------------------\n");

        const newAnswers = {};
        for (let i = 0; i < problems.length; i++) {
            const prob = problems[i];
            const currentSaved = existingAnswers[prob.id] || 'UNANSWERED';
            const label = prob.label ? `[${prob.label}] ` : '';
            
            // Limit title length for clean terminal display
            let displayTitle = prob.title.replace(/<[^>]+>/g, '').trim();
            if (displayTitle.length > 50) displayTitle = displayTitle.substring(0, 47) + '...';

            let choices = [];
            if (problemType === 'TRUE_OR_FALSE') {
                choices = [
                    { name: 'TRUE (T)', value: 'TRUE' },
                    { name: 'FALSE (F)', value: 'FALSE' },
                    new inquirer.Separator(),
                    { name: 'SKIP (Keep current / Unanswered)', value: 'SKIP' },
                    { name: 'ABORT (Exit without saving)', value: 'ABORT' }
                ];
            } else if (problemType === 'MULTIPLE_CHOICE') {
                choices = [
                    'A', 'B', 'C', 'D', 'E', 'F',
                    new inquirer.Separator(),
                    { name: 'SKIP (Keep current / Unanswered)', value: 'SKIP' },
                    { name: 'ABORT (Exit without saving)', value: 'ABORT' }
                ];
            }

            // Determine default selection: prioritize existing answer, fallback to SKIP
            let defaultIndex = choices.findIndex(c => (typeof c === 'string' ? c : c.value) === currentSaved);
            if (defaultIndex === -1) {
                defaultIndex = choices.findIndex(c => (typeof c === 'string' ? c : c.value) === 'SKIP');
            }
            
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

            // Break the loop and return early if user aborts
            if (answer === 'ABORT') {
                console.log("\n[INFO] Submission aborted by user. No answers were uploaded.");
                return; 
            }

            // Only register real changes (ignore SKIP)
            if (answer !== 'SKIP') {
                newAnswers[prob.id] = answer;
            }
        }

        // 5. Build POST Payload
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

        // 6. Execute POST Request
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
        console.log(`[INFO] Note: Objective questions are graded after the exam concludes.`);

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
        // Fetch summaries to see what problem types are actually in this specific set
        const summaryRes = await ptaFetch(endpoints.PROBLEM_SUMMARIES(selectedSet.id));
        const summaryData = await summaryRes.json();
        const availableTypes = Object.keys(summaryData.summaries || {});

        const supportedTypes = ['TRUE_OR_FALSE', 'MULTIPLE_CHOICE'];
        const validTypes = availableTypes.filter(t => supportedTypes.includes(t));

        if (validTypes.length === 0) {
            console.log("\n[WARN] This problem set contains no supported objective questions (T/F, Multiple Choice).");
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
            await submitObjectiveAnswers(selectedSet.id, selectedSet.name, targetType);
        }
    } catch (error) {
        console.error(`[ERROR] Dispatcher encountered an issue: ${error.message}`);
    }
}

module.exports = {
    handleSubmissionDispatcher
};
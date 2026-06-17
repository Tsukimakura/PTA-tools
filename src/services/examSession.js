const inquirer = require('inquirer');
const { ptaFetch } = require('../api/client');
const { getEndpoints } = require('../api/endpoints');

/**
 * Retrieves the exam session. If the exam hasn't been started,
 * prompts the user to start it interactively via CLI.
 * @param {string} setId - The problem set ID
 * @param {string} setName - The problem set name (for display)
 * @returns {Promise<object>} The session data containing exam info
 */
async function ensureExamSession(setId, setName) {
    const endpoints = getEndpoints();
    
    // 1. Try getting the session normally (GET)
    let sessionRes = await ptaFetch(endpoints.EXAM_SESSION(setId));
    let sessionData = await sessionRes.json();

    // 2. If exam is not started, exam.id is usually missing or an error is returned
    if (sessionData.error || !sessionData.exam || !sessionData.exam.id) {
        console.log(`\n[WARN] The problem set "${setName}" has not been started yet.`);
        
        const { startNow } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'startNow',
                message: 'Do you want to start this problem set now?',
                default: false
            }
        ]);

        if (startNow) {
            console.log(`[INFO] Attempting to start problem set...`);
            
            // Send POST request to initialize the exam
            const postRes = await ptaFetch(endpoints.EXAM_SESSION(setId), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                },
                body: JSON.stringify({}) // Empty JSON body as required by PTA API
            });
            
            const postData = await postRes.json();

            // Catch any explicit errors from the POST request
            if (postData.error) {
                throw new Error(`Failed to start: ${postData.error.message || postData.error.code}`);
            }
            
            console.log(`[SUCCESS] Problem set started successfully! Fetching data...`);
            
            // Give the backend a brief moment to sync the database state (800ms)
            await new Promise(r => setTimeout(r, 800));

            // Re-fetch the session using standard GET to guarantee identical data structure
            sessionRes = await ptaFetch(endpoints.EXAM_SESSION(setId));
            sessionData = await sessionRes.json();

            // Final verification
            if (sessionData.error || !sessionData.exam || !sessionData.exam.id) {
                throw new Error(`Verification failed: ${sessionData.error ? sessionData.error.message : 'Unknown API error'}`);
            }
            
        } else {
            // Throw a specific error to be caught by the outer catch blocks
            throw new Error("USER_CANCELED");
        }
    }

    return sessionData;
}

module.exports = {
    ensureExamSession
};
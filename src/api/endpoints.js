const { getConfig } = require('../utils/config');

/**
 * Returns the relevant API endpoints.
 */
function getEndpoints() {
    const config = getConfig();
    return {
        // Legacy single URL for the monitor
        PROBLEM_SETS: config.apiUrl,
        
        // Base API for fetching all problem sets with pagination
        ALL_PROBLEM_SETS: (page = 0, limit = 30) => 
            `https://pintia.cn/api/problem-sets?filter=%7B%7D&page=${page}&limit=${limit}&order_by=END_AT&asc=false`,
        
        // Initialize exam session to get the dynamic exam_id
        EXAM_SESSION: (setId) => `https://pintia.cn/api/problem-sets/${setId}/exams`,
        
        // Get summaries of problem types (TRUE_OR_FALSE, PROGRAMMING, etc.)
        PROBLEM_SUMMARIES: (setId) => `https://pintia.cn/api/problem-sets/${setId}/problem-summaries`,
        
        // Fetch actual problems by specific type and exam session
        EXAM_PROBLEMS: (setId, examId, type) => `https://pintia.cn/api/problem-sets/${setId}/exam-problems?exam_id=${examId}&problem_type=${type}`
    };
}

module.exports = {
    getEndpoints
};
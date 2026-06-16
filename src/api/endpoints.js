/**
 * Returns the relevant API endpoints.
 */
function getEndpoints() {
    // Use a 7-day buffer instead of strictly 'now', allowing the monitor to capture their real ENDED status and exact timestamps.
    const bufferDate = new Date();
    bufferDate.setDate(bufferDate.getDate() - 7);
    
    const filterParams = JSON.stringify({ endAtAfter: bufferDate.toISOString() });
    const encodedFilter = encodeURIComponent(filterParams);

    return {
        // Dynamic URL for the monitor, eliminating the need for manual configuration
        PROBLEM_SETS: `https://pintia.cn/api/problem-sets?filter=${encodedFilter}&page=0&limit=30&order_by=END_AT&asc=true`,
        
        // Base API for fetching all problem sets with pagination
        ALL_PROBLEM_SETS: (page = 0, limit = 30) => 
            `https://pintia.cn/api/problem-sets?filter=%7B%7D&page=${page}&limit=${limit}&order_by=END_AT&asc=false`,
        
        // Initialize exam session to get the dynamic exam_id
        EXAM_SESSION: (setId) => `https://pintia.cn/api/problem-sets/${setId}/exams`,
        
        // Get summaries of problem types (TRUE_OR_FALSE, PROGRAMMING, etc.)
        PROBLEM_SUMMARIES: (setId) => `https://pintia.cn/api/problem-sets/${setId}/problem-summaries`,
        
        // Fetch actual problems by specific type and exam session
        EXAM_PROBLEMS: (setId, examId, type) => `https://pintia.cn/api/problem-sets/${setId}/exam-problems?exam_id=${examId}&problem_type=${type}`,

        // Fetch completion status of each problem (Required for real-time dashboard)
        PROBLEM_STATUS: (examId, setId) => 
            `https://pintia.cn/api/exams/${examId}/problem-sets/${setId}/problem-status`,

        // Endpoints for Archive and Report features
        COMMON_RANKINGS: (setId, userId) => 
            `https://pintia.cn/api/problem-sets/${setId}/common-rankings?target_user_id=${userId}`,
            
        LAST_SUBMISSIONS_BY_TYPE: (examId, setId, type) => 
            `https://pintia.cn/api/exams/${examId}/problem-sets/${setId}/last-submissions?problem_type=${type}`,
            
        LAST_SUBMISSIONS_BY_PROBLEM: (examId, setId, problemId) => 
            `https://pintia.cn/api/exams/${examId}/problem-sets/${setId}/last-submissions?problem_set_problem_id=${problemId}`
    };
}

module.exports = {
    getEndpoints
};
// Calculate the real display status based on time window

function calculateRealStatus(startAt, endAt) {
    const now = Date.now();
    const start = new Date(startAt).getTime();
    const end = new Date(endAt).getTime();

    if (now < start) return 'NOT_STARTED';
    if (now > end) return 'ENDED';
    return 'ONGOING';
}

// Helper function for consistent log timestamps

function getTimestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

module.exports = {
    calculateRealStatus,
    getTimestamp
};
function parseProblemSetPage(payload, context = 'Problem-set list') {
    const page = payload && payload.data && typeof payload.data === 'object'
        ? payload.data
        : payload;

    if (!page || !Array.isArray(page.problemSets)) {
        throw new Error(`${context} returned no problemSets array.`);
    }

    if (page.total !== undefined
        && (!Number.isInteger(page.total) || page.total < 0)) {
        throw new Error(`${context} returned an invalid total.`);
    }

    return {
        problemSets: page.problemSets,
        total: page.total
    };
}

function assertCompleteProblemSetPage({ context, collected, pageSets, total }) {
    if (total !== Infinity && collected < total && pageSets.length === 0) {
        throw new Error(`${context} ended before all ${total} problem sets were received.`);
    }

    if (total !== Infinity && collected < total && pageSets.length > 0) {
        return;
    }
}

module.exports = {
    parseProblemSetPage,
    assertCompleteProblemSetPage
};

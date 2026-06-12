/**
 * Sanitize strings for safe file naming across different OS
 */
function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Clean and format raw PTA text to standard Markdown
 * @param {string} text - Raw text from PTA
 * @returns {string} Cleaned text
 */
function cleanText(text) {
    if (!text) return '';
    
    return text
        // 1. Bulletproof regex for PTA placeholders
        // Use escaped underscores (\_) to prevent Markdown from rendering them as horizontal rules or bold text
        .replace(/~?\s*@\[.*?\]\([^)]*\)/g, '\\_\\_\\_\\_\\_\\_')
        
        // 2. Convert block math $$...$$ to inline math $...$
        .replace(/\$\$(.*?)\$\$/gs, '$$$1$$');
}

/**
 * Generate beautifully formatted Markdown from PTA problem data
 * @param {string} setName - Name of the problem set
 * @param {object} problemsByType - Dictionary of problems grouped by type
 * @returns {string} Formatted Markdown content
 */
function generateMarkdown(setName, problemsByType) {
    // Removed Obsidian YAML frontmatter, starting directly with the H1 Title
    let md = `# ${setName}\n\n`;

    for (const [type, problems] of Object.entries(problemsByType)) {
        if (!problems || problems.length === 0) continue;

        // Add Section Header for Problem Type
        md += `## ${type.replace(/_/g, ' ')}\n\n`;

        problems.forEach((prob, index) => {
            const label = prob.label ? `[${prob.label}] ` : '';
            const score = prob.score ? `(${prob.score} pts)` : '';
            const author = prob.author ? ` - *Author: ${prob.author}*` : '';
            
            // Clean the title as well, just in case it contains math or placeholders
            const cleanTitle = cleanText(prob.title);
            md += `### ${index + 1}. ${label}${cleanTitle} ${score}${author}\n\n`;
            
            // Apply the cleaning function to the main content
            if (prob.content) {
                md += `${cleanText(prob.content)}\n\n`;
            } else if (prob.description) {
                md += `${cleanText(prob.description)}\n\n`;
            }

            // Divider between problems
            md += `---\n\n`;
        });
    }

    return md;
}

module.exports = {
    sanitizeFilename,
    generateMarkdown
};
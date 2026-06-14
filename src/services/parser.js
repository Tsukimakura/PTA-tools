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
        .replace(/~?\s*@\[.*?\]\([^)]*\)/g, '\\_\\_\\_\\_\\_\\_')
        
        // 2. Convert block math $$...$$ to inline math $...$
        .replace(/\$\$(.*?)\$\$/gs, '$$$1$$')
        
        // 3. Fix relative image URLs to absolute URLs
        .replace(/\]\(~\//g, '](https://images.ptausercontent.com/')
        
        // 4. Ensure spaces around inline math $...$ (avoiding punctuation boundaries)
        .replace(/([^\s(\[{])\$(.*?)\$/gs, '$1 $$$2$$')
        .replace(/\$(.*?)\$([^\s.,:;!?\-\)\]}])/gs, '$$$1$$ $2')
        
        // 5. Enforce empty lines between multiple-choice options (A., B., C., etc.)
        // Matches a non-newline char, a single newline, and then A-H followed by . or 、
        .replace(/([^\n])\n([A-H][\.、]\s?)/g, '$1\n\n$2')
        
        // 6. Match entire code blocks and pad them with exactly one empty line outside
        .replace(/\n*(```[\s\S]*?```)\n*/g, '\n\n$1\n\n')
        
        // 7. Ensure empty lines before tables
        .replace(/([^\n|])\n\|/g, '$1\n\n|')
        
        // 8. Cleanup: Prevent multiple consecutive empty lines
        .replace(/\n{4,}/g, '\n\n');
}

/**
 * Generate beautifully formatted Markdown from PTA problem data
 * @param {string} setName - Name of the problem set
 * @param {object} problemsByType - Dictionary of problems grouped by type
 * @returns {string} Formatted Markdown content
 */
function generateMarkdown(setName, problemsByType) {
    let md = `# ${setName}\n\n`;

    for (const [type, problems] of Object.entries(problemsByType)) {
        if (!problems || problems.length === 0) continue;

        md += `## ${type.replace(/_/g, ' ')}\n\n`;

        problems.forEach((prob, index) => {
            const label = prob.label ? `[${prob.label}] ` : '';
            const score = prob.score ? `(${prob.score} pts)` : '';
            const author = prob.author ? ` - *Author: ${prob.author}*` : '';
            
            const cleanTitle = cleanText(prob.title);
            md += `### ${index + 1}. ${label}${cleanTitle} ${score}${author}\n\n`;
            
            let problemBody = prob.content ? cleanText(prob.content) : (prob.description ? cleanText(prob.description) : '');

            // Inject multiple choice options with double newlines
            if (type === 'MULTIPLE_CHOICE' && prob.problemConfig && prob.problemConfig.multipleChoiceProblemConfig) {
                const choices = prob.problemConfig.multipleChoiceProblemConfig.choices;
                if (choices && Array.isArray(choices) && choices.length > 0) {
                    
                    const rawText = prob.content || prob.description || "";
                    const hasEmbeddedChoices = /(^|\n|<br>|<p>)\s*A[\.、]\s/i.test(rawText);
                    
                    if (!hasEmbeddedChoices) {
                        problemBody += '\n\n';
                        choices.forEach((choice, i) => {
                            const letter = String.fromCharCode(65 + i);
                            problemBody += `${letter}. ${cleanText(choice)}\n\n`;
                        });
                    }
                }
            }

            md += `${problemBody}\n\n`;
            md += `---\n\n`;
        });
    }

    return md;
}

module.exports = {
    sanitizeFilename,
    generateMarkdown
};
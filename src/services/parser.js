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
        // 1. Strip useless PTA default rich-text editor templates
        .replace(/这是.*?题模板。[\s\S]*?与评测代码对应的测试数据\*?（默认无）\*?\n?/g, '')
        .replace(/这是一个.*?的样例。[^\n]*\n?/g, '')
        
        // 2. Fix explicit PTA placeholders (@[] or @@[]) - Use raw underscores, NO escaping needed for code blocks
        .replace(/~?\s*@+\[.*?\]\([^)]*\)/g, '______')
        
        // 3. Heuristics for "invisible" blanks left by sloppy problem creation
        .replace(/\b(while|if|for)\s*\(\s*\)/g, '$1( ______ )') // Fix empty conditions: while () -> while ( ______ )
        .replace(/=\s*;/g, '= ______;')                        // Fix empty assignments: a = ; -> a = ______ ;
        .replace(/^(\s*);\s*$/gm, '$1______;')                 // Fix isolated semicolons: [space]; -> [space]______;
        
        // 4. Convert block math $$...$$ to inline math $...$
        .replace(/\$\$(.*?)\$\$/gs, '$$$1$$')
        
        // 5. Fix relative image URLs to absolute URLs
        .replace(/\]\(~\//g, '](https://images.ptausercontent.com/')
        
        // 6. Ensure spaces around inline math $...$ (avoiding punctuation boundaries)
        .replace(/([^\s(\[{])\$(.*?)\$/gs, '$1 $$$2$$')
        .replace(/\$(.*?)\$([^\s.,:;!?\-\)\]}])/gs, '$$$1$$ $2')
        
        // 7. Enforce empty lines between multiple-choice options (A., B., C., etc.)
        .replace(/([^\n])\n([A-H][\.、]\s?)/g, '$1\n\n$2')
        
        // 8. Match entire code blocks and pad them with exactly one empty line outside
        .replace(/\n*(```[\s\S]*?```)\n*/g, '\n\n$1\n\n')
        
        // 9. Ensure empty lines before tables
        .replace(/([^\n|])\n\|/g, '$1\n\n|')
        
        // 10. Cleanup: Prevent multiple consecutive empty lines
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
            
            // Clean both fields first
            let cleanContent = cleanText(prob.content);
            let cleanDesc = cleanText(prob.description);
            // If content is empty after stripping garbage, fallback to description securely
            let problemBody = cleanContent.trim() ? cleanContent : cleanDesc;

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
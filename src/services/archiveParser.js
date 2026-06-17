function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_');
}

function cleanText(text) {
    if (!text) return '';
    
    return text
        // 1. Strip useless PTA default rich-text editor templates
        .replace(/这是.*?题模板。[\s\S]*?与评测代码对应的测试数据\*?（默认无）\*?\n?/g, '')
        
        // 2. Fix explicit PTA placeholders (@[] or @@[]) - Use raw underscores, NO escaping needed for code blocks
        .replace(/~?\s*@+\[.*?\]\([^)]*\)/g, '______')
        
        // 3. Heuristics for "invisible" blanks left by sloppy problem creation
        .replace(/\b(while|if|for)\s*\(\s*\)/g, '$1( ______ )') // Fix empty conditions: while () -> while ( ______ )
        .replace(/=\s*;/g, '= ______;')                        // Fix empty assignments: a = ; -> a = ______ ;
        .replace(/^(\s*);\s*$/gm, '$1______;')                 // Fix isolated semicolons: [space]; -> [space]______;
        
        // 4. Convert block math $$...$$ to inline math $...$
        .replace(/\$\$(.*?)\$\$/gs, '$$$1$$')
        
        // 5. Fix relative image URLs to absolute URLs (Specific to archiveParser, harmless in parser)
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
 * Generate a comprehensive Markdown archive including source code and results
 * @param {string} setName - Name of the problem set
 * @param {object} problemsByType - Dictionary of problems grouped by type
 * @param {object} submissionMap - Dictionary mapping problem IDs to their submission details
 * @returns {string} Formatted Markdown content
 */
function generateArchiveMarkdown(setName, problemsByType, submissionMap) {
    // 1. Calculate Global Scores
    let totalMaxScore = 0;
    let totalUserScore = 0;

    for (const [type, problems] of Object.entries(problemsByType)) {
        if (!problems) continue;
        problems.forEach(prob => {
            totalMaxScore += prob.score || 0;
            const sub = submissionMap[prob.id];
            if (sub && sub.score) {
                totalUserScore += sub.score;
            }
        });
    }

    // 2. Build Markdown Header
    let md = `# [ARCHIVE] ${setName}\n\n`;
    md += `**Total Score:** ${totalUserScore} / ${totalMaxScore}\n\n`;
    md += `---\n\n`;

    // 3. Build Problem Sections
    for (const [type, problems] of Object.entries(problemsByType)) {
        if (!problems || problems.length === 0) continue;

        md += `## ${type.replace(/_/g, ' ')}\n\n`;

        problems.forEach((prob, index) => {
            const label = prob.label ? `[${prob.label}] ` : '';
            const maxScore = prob.score ? `(${prob.score} pts)` : '';
            const author = prob.author ? ` - *Author: ${prob.author}*` : '';
            
            md += `### ${index + 1}. ${label}${cleanText(prob.title)} ${maxScore}${author}\n\n`;
            
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

            const sub = submissionMap[prob.id];

            if (!sub) {
                md += `> **Status:** NO SUBMISSION RECORD FOUND\n\n`;
                md += `---\n\n`;
                return; 
            }

            md += `**Submission Result:** ${sub.status}\n`;
            md += `**Score:** ${sub.score} / ${prob.score}\n\n`;

            if (type === 'MULTIPLE_CHOICE' || type === 'TRUE_OR_FALSE') {
                md += `> **Your Answer:** ${sub.answer || 'N/A'}\n\n`;
            } 
            else if (type === 'PROGRAMMING' || type === 'FILL_IN_THE_BLANK_FOR_PROGRAMMING' || type === 'CODE_COMPLETION') {
                md += `**Compiler:** ${sub.compiler} | **Max Time:** ${sub.time}s | **Max Memory:** ${Math.round(sub.memory / 1024)}KB\n\n`;
                
                md += `**Your Answer:**\n`;
                const codeLang = sub.compiler.toLowerCase().includes('gcc') || sub.compiler.toLowerCase().includes('clang') ? 'c' : 
                                 sub.compiler.toLowerCase().includes('gxx') ? 'cpp' : '';
                md += `\`\`\`${codeLang}\n${sub.program}\n\`\`\`\n\n`;

                // Both PROGRAMMING and CODE_COMPLETION share the same test case structure
                if ((type === 'PROGRAMMING' || type === 'CODE_COMPLETION') && sub.testcases && Object.keys(sub.testcases).length > 0) {
                    md += `**Test Case Breakdown:**\n`;
                    md += `| Case | Status | Score | Time (s) | Memory (KB) | Hint |\n`;
                    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
                    
                    for (const [caseId, caseData] of Object.entries(sub.testcases)) {
                        const hint = sub.hints && sub.hints[caseId] ? sub.hints[caseId] : '';
                        const caseScore = caseData.testcaseScore !== undefined ? caseData.testcaseScore : '-';
                        const caseTime = caseData.time !== undefined ? caseData.time : '-';
                        const caseMem = caseData.memory !== undefined ? Math.round(caseData.memory / 1024) : '-';
                        md += `| ${caseId} | ${caseData.result} | ${caseScore} | ${caseTime} | ${caseMem} | ${hint} |\n`;
                    }
                    md += `\n`;
                } 
                // Fill-in-the-blank programming uses an array structure for evaluating each blank
                else if (type === 'FILL_IN_THE_BLANK_FOR_PROGRAMMING' && Array.isArray(sub.testcases) && sub.testcases.length > 0) {
                    md += `**Blank Evaluation Breakdown:**\n`;
                    md += `| Blank | Status | Score |\n`;
                    md += `| :--- | :--- | :--- |\n`;
                    
                    sub.testcases.forEach((caseData, idx) => {
                        const caseScore = caseData.score !== undefined ? caseData.score : '-';
                        md += `| ${idx + 1} | ${caseData.status} | ${caseScore} |\n`;
                    });
                    md += `\n`;
                }
            }
            
            md += `---\n\n`;
        });
    }

    return md;
}

module.exports = {
    sanitizeFilename,
    generateArchiveMarkdown
};
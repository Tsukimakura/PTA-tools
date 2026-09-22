const fs = require('fs');
const path = require('path');

function writeFileAtomicSync(targetPath, data, options = {}) {
    const directory = path.dirname(targetPath);
    const basename = path.basename(targetPath);
    const temporaryPath = path.join(
        directory,
        `.${basename}.${process.pid}.${Date.now()}.tmp`
    );

    try {
        fs.writeFileSync(temporaryPath, data, {
            encoding: options.encoding || 'utf8',
            mode: options.mode
        });
        fs.renameSync(temporaryPath, targetPath);
        if (options.mode !== undefined) fs.chmodSync(targetPath, options.mode);
    } catch (error) {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        throw error;
    }
}

module.exports = {
    writeFileAtomicSync
};

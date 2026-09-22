#!/usr/bin/env node

function printHelp(writeLine = console.log) {
    writeLine(`PTA-Tools

Usage:
  pta [command]

Commands:
  cli, c       Open the interactive PTA console (default)
  todo, t      Send unfinished problem sets to DingTalk once
  monitor, m   Start the continuous status monitor
  help, h      Show this help message`);
}

async function runCommand(args = [], dependencies = {}) {
    const command = (args[0] || 'cli').toLowerCase();
    const writeLine = dependencies.writeLine || console.log;

    if (command === 'help' || command === 'h' || command === '--help' || command === '-h') {
        printHelp(writeLine);
        return;
    }

    if (command === 'cli' || command === 'c') {
        const startCli = dependencies.startCli || require('./pta-cli').initCLI;
        await startCli();
        return;
    }

    if (command === 'todo' || command === 't') {
        const sendTodo = dependencies.sendTodo
            || require('../src/services/todoNotifier').sendTodoNotification;
        const digest = await sendTodo();
        writeLine(`[SUCCESS] DingTalk todo digest sent (${digest.count} unfinished sets).`);
        return;
    }

    if (command === 'monitor' || command === 'm') {
        const startMonitor = dependencies.startMonitor || require('./pta-monitor').startMonitor;
        startMonitor();
        return;
    }

    throw new Error(`Unknown command: ${command}. Run "pta help" for usage.`);
}

if (require.main === module) {
    runCommand(process.argv.slice(2)).catch(error => {
        console.error(`[ERROR] ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    printHelp,
    runCommand
};

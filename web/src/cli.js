const fs = require('node:fs');
const path = require('node:path');
const { ensureDirectory } = require('./fs');
const { runtime } = require('./runtime');

const GREEN = '\x1b[92m';  // Green Text       ✓
const RED = '\x1b[91m';  // Red Text         ×
const RESET = '\x1b[0m';   // Reset to default 
const OK = '✓';
const FAIL = '×';
const NANO = '∙'; // ASCII Extended bullet operator
// const NANO  = '•';
// const NANO  = '·'; // ASCII Extended middle dot

function print(message, end = '\r') {
    const terminalWidth = process.stdout.columns || 120;
    if (message.length > terminalWidth) {
        const partLength = Math.floor((terminalWidth - 4) / 2); // 4 characters for " .. "
        message = message.substring(0, partLength) + " .. " + message.substring(message.length - partLength);
    }
    const paddingLength = terminalWidth - message.length;
    const padding = ' '.repeat(Math.max(paddingLength, 0));
    process.stdout.write(message + padding + end);
}

function progress(i, len, fixed = 1) {
    return (100 * i / len).toFixed(fixed);
}

function spent(checkpoint, fixed = 2) {
    return ((Date.now() - checkpoint) / 1000).toFixed(fixed);
}

function logError(err, file) {
    try {
        ensureDirectory(path.dirname(file));
        // Convert error to string in case it's an Error object
        let errorMessage = err instanceof Error ? err.stack || err.toString() : err;
        // Pad new lines with \t, except the first line
        errorMessage = errorMessage.replace(/\n/g, '\n\t');
        fs.appendFileSync(file, `${new Date().toISOString()} - ${errorMessage}\n`);
    } catch (err) {
        console.error('Unable to write to a log file:', err);
    }
}

// Debounce function to limit the rate at which a function is executed
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const formatMemoryUsage = (bytes) => {
    if (bytes > 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}Gb`;
    }
    if (bytes > 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(2)}Mb`;
    }
    if (bytes > 1024) {
        return `${(bytes / 1024).toFixed(2)}Kb`;
    }
    return `${bytes}b`;
};

const mem = () => formatMemoryUsage(process.memoryUsage().rss);

const getMemoryUsage = () => {
    const memoryUsage = process.memoryUsage();
    const info = [];
    for (const mem of [memoryUsage.rss, memoryUsage.heapTotal, memoryUsage.heapUsed]) {
        const color = mem > (runtime['MEMORY_DANGER_USE'] || 0) ? RED : RESET;
        info.push(`${color}${formatMemoryUsage(mem)}${RESET}`);
    }
    return info;
};

const state = {};

const setDebounced = debounce((key, value) => {
    state[key] = value;
}, state['RENDERING_DEBOUNCE'] || 108);

module.exports = {
    GREEN, RED, RESET, OK, FAIL, NANO,
    print,
    progress,
    spent,
    debounce,
    state,
    setDebounced,
    formatMemoryUsage,
    getMemoryUsage,
    logError,
    mem,
};
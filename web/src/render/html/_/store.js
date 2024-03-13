const fs = require('node:fs');
const { join, dirname } = require('node:path');
const { runtime } = require('../../../runtime');
const { ensureDirectory, loadTXT } = require('../../../fs');

const DIVIDER = "\n";

const targets = ['assets', 'emails', 'links', 'phones', 'broken'];
const outputFile = {};
const messages = {};
// if (!runtime['RENDER_HTML_STORES_FPS']) runtime['RENDER_HTML_STORES_FPS'] = {}
const fps = {};

for (const t of targets) {
    outputFile[t] = join(runtime['NANO_DIR'], t + '.txt');
    messages[t] = [];
    fps[t] = null;
}

function write(target, message, nonUnique = false) {
    if (Array.isArray(message)) {
        const result = [];
        message.forEach(m => result.push(write(target, m, nonUnique)));
        return result;
    } else {
        if (!nonUnique && messages[target].includes(message)) return false;
        messages[target].push(message);
        if (fps[target]) fs.writeSync(fps[target], message + DIVIDER);
    }
    return true;
}

function count(target) {
    return messages[target].length;
}

function read(target, fromFile = false) {
    if (fromFile) {
        return loadTXT(outputFile[target]);
    }
    return messages[target];
}

function start(target) {
    if (Array.isArray(target)) {
        const results = [];
        target.forEach(t => results.push(start(t)));
        return results;
    }
    messages[target] = [];
    if (!fps[target]) {
        ensureDirectory(dirname(outputFile[target]));
        // @todo reset the file content when open for writing
        fps[target] = fs.openSync(outputFile[target], 'w');
    }
    return true;
}

function commit(target) {
    if (Array.isArray(target)) {
        const results = [];
        target.forEach(t => results.push(commit(t)));
        return results;
    }
    if (fps[target]) {
        fs.closeSync(fps[target]);
        delete fps[target]; // Ensure to remove the entry from fps after closing
        return true;
    }
    return false;
}

module.exports = {
    write,
    start,
    commit,
    count,
    read,
    getStores: () => targets,
};
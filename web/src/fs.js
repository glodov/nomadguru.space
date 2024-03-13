const fs = require('node:fs');
const csv = require('csvtojson');
const path = require('node:path');
const crypto = require('crypto');
const yaml = require('yaml');

function removeDirectory(directoryPath, recursively = false) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file) => {
            const currentPath = path.join(directoryPath, file);
            if (fs.lstatSync(currentPath).isDirectory()) {
                // Recursively delete directory
                if (recursively) removeDirectory(currentPath, true);
            } else {
                // Delete file
                fs.unlinkSync(currentPath);
            }
        });
        fs.rmdirSync(directoryPath);
    }
}

function ensureDirectory(dir, removeBefore = false) {
    if (removeBefore && fs.existsSync(dir)) {
        removeDirectory(dir, true);
    }
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function findAllFiles(dir, acceptRegEx = null, skipRegEx = null) {
    let results = [];
    const list = fs.readdirSync(dir);

    for (const file of list) {
        const filePath = path.resolve(dir, file);
        if (skipRegEx && skipRegEx.test(filePath)) continue;

        const stat = fs.statSync(filePath);

        if (stat && stat.isDirectory()) {
            results = results.concat(findAllFiles(filePath, acceptRegEx, skipRegEx));
        } else if (!acceptRegEx || acceptRegEx.test(filePath)) {
            results.push(filePath);
        }
    }

    return results;
}

function calculateFileHash(filePath) {
    const data = fs.readFileSync(filePath);
    const hash = crypto.createHash('md5');
    hash.update(data);
    return hash.digest('hex');
}

function loadYAML(file) {
    const content = fs.readFileSync(file, { encoding: 'utf-8' });
    try {
        const data = yaml.parse(content);
        return data;
    } catch (err) {
        console.error('Cannot parse file', file, err);
        return null;
    }
}

function saveYAML(file, data) {
    return fs.writeFileSync(file, yaml.stringify(data));
}

function loadJSON(file) {
    const content = fs.readFileSync(file);
    return JSON.parse(content);
}

function saveJSON(file, data) {
    return fs.writeFileSync(file, JSON.stringify(data));
}

// Function to load CSV data
const loadCSV = async (csvFile) => {
    return csv().fromFile(csvFile);
};

const loadTXT = (txtFile, delimiter = "\n") => {
    const text = fs.readFileSync(txtFile);
    return text.toString().split(delimiter);
};

function completeYAML(file) {
    const newFile = file.replace(/\.yaml$/, '.done.yaml');
    fs.renameSync(file, newFile);
}

module.exports = {
    ensureDirectory,
    removeDirectory,
    findAllFiles,
    calculateFileHash,
    saveYAML,
    loadYAML,
    loadCSV,
    loadTXT,
    loadJSON,
    saveJSON,
    completeYAML,
};
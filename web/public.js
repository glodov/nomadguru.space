const fs = require('node:fs');
const path = require('node:path');
const { print, GREEN, RED, RESET, OK, FAIL, NANO } = require('./src/cli');
const { DIST_DIR, STATIC_DIR, GALLERY_THUMB_DIR, STATIC_ALLOWED } = require('./config');

const isFileAllowed = (file) => STATIC_ALLOWED.some(allowedPath => file.startsWith(allowedPath));

const hasFileChanged = (src, dest) => {
    if (!fs.existsSync(dest)) {
        return true; // File doesn't exist in dest, needs to be copied
    }

    const srcStats = fs.statSync(src);
    const destStats = fs.statSync(dest);

    return srcStats.mtimeMs !== destStats.mtimeMs; // Compare last modified times
};

require('dotenv').config();

const copyStaticFiles = (srcDir, destDir) => {
    const filesToCopy = [];
    let totalFiles = 0;
    let skipFiles = 0;

    // @todo function must handle proper walking through currentDir like ./thumb/*
    const exploreDirectory = (currentDir) => {
        const files = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(currentDir, file.name);
            if (file.isDirectory()) {
                exploreDirectory(fullPath);
            } else {
                ++totalFiles;
                if (isFileAllowed(fullPath.replace(srcDir, ''))) {
                    filesToCopy.push(fullPath);
                } else {
                    ++skipFiles;
                }
            }
            print(` ${NANO} ${GREEN}${filesToCopy.length}${RESET} of ${totalFiles} skipped ${skipFiles}`, "\r");
        }
    };

    exploreDirectory(srcDir);
    console.log('');

    let copied = 0;
    let failed = 0;
    let same = 0;
    for (const file of filesToCopy) {
        const destPath = path.join(destDir, file.replace(srcDir, ''));
        if (hasFileChanged(file, destPath)) {
            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.copyFileSync(file, destPath);
            if (fs.existsSync(destPath)) {
                ++copied;
            } else {
                ++failed;
            }
        } else {
            ++same;
        }
        print(` ${NANO} ${GREEN}${OK} ${copied}${RESET} ${RED}${FAIL} ${failed}${RESET} and ${same} unmodified`, "\r");
    }
    console.log('');
    return filesToCopy;
};

async function publish() {
    console.log(`\nCopying ${path.relative(__dirname, STATIC_DIR)} ${NANO} ${path.relative(__dirname, DIST_DIR)}`);
    copyStaticFiles(STATIC_DIR, DIST_DIR);
    if (GALLERY_THUMB_DIR) {
        if (fs.existsSync(GALLERY_THUMB_DIR)) {
            console.log(`\nCopying ${path.relative(__dirname, GALLERY_THUMB_DIR)} ${NANO} ${path.relative(__dirname, DIST_DIR)}`);
            copyStaticFiles(GALLERY_THUMB_DIR, DIST_DIR);
        } else {
            console.log(`\n ${RED}${FAIL}${RESET} Directory does not exist ${RED}${NANO} ${path.relative(__dirname, GALLERY_THUMB_DIR)}${RESET}`);
        }
    }
}

publish().catch(console.error);
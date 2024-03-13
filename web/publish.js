const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const Stream = require('node:stream').Stream;
const archiver = require('archiver');
const { calculateFileHash, saveYAML } = require('./src/fs');
const { print, GREEN, RED, RESET, OK, FAIL, NANO } = require('./src/cli');
const { DIST_DIR, STATIC_DIR, STATIC_ALLOWED } = require('./config');

require('dotenv').config();

const LOG_FILE = 'logs/publish.logs.yaml';
const MAX_CHUNK_SIZE = 100 * 1024 * 1024; // 100 MB in bytes
const FILES_TO_REMOVE = [
    '.env',
    'output.json'
];

const API_URL = new URL(process.env.API_URL);
const AUTH_KEY = process.env.AUTH_KEY;
const httpsProvider = API_URL.protocol === 'https:' ? https : http;

function httpsRequest(method, data, headers = {}, query = '', traceProgressOrCallbackFn = false) {
    const isStreaming = data instanceof Stream;
    const requiredHeaders = {
        'Authorization': 'Bearer ' + AUTH_KEY,
        'Content-Type': isStreaming ? 'application/octet-stream' : 'application/json'
    };
    if (!isStreaming && data) {
        requiredHeaders['Content-Length'] = Buffer.byteLength(data);
    }
    const options = {
        hostname: API_URL.hostname,
        port: API_URL.port,
        path: `${API_URL.pathname}${query}`,
        method,
        headers: Object.assign(requiredHeaders, headers)
    };
    return new Promise((resolve, reject) => {
        const req = httpsProvider.request(options, res => {
            let responseData = '';
            let rejected = null;
            if (res.statusCode >= 400) {
                rejected = { code: res.statusCode, message: res.statusMessage };
            }
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                if (null === rejected) {
                    try {
                        resolve(responseData ? JSON.parse(responseData) : '');
                    } catch (err) {
                        reject(Object.assign({}, { body: responseData }));
                    }
                } else {
                    reject(Object.assign(rejected, { body: responseData }));
                }
            });
        });

        req.on('error', reject);
        if (data) {
            if (data instanceof Stream) {
                let uploadedBytes = 0;
                const totalBytes = headers['Content-Length'];

                data.on('data', chunk => {
                    uploadedBytes += chunk.length;
                    if ('function' === typeof traceProgressOrCallbackFn) {
                        traceProgressOrCallbackFn((uploadedBytes / totalBytes) * 100, uploadedBytes, totalBytes);
                    } else if (traceProgressOrCallbackFn) {
                        console.log(`Uploaded ${uploadedBytes} of ${totalBytes} bytes (${Math.round((uploadedBytes / totalBytes) * 100)}%)`);
                    }
                });

                data.pipe(req);
                data.on('end', () => req.end());
            } else {
                if (null !== data) req.write(data);
                req.end();
            }
        } else {
            req.end();
        }
    });
}

function getVersionToUpdate() {
    return httpsRequest('GET', '');
}

function getFilesToUpdate() {
    const filesToUpdate = [];

    const processDirectory = (dir, ignoreExp) => {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const relPath = path.relative(DIST_DIR, filePath);
            if (ignoreExp.test(relPath)) {
                continue;
            }
            const stats = fs.statSync(filePath);

            if (stats.isDirectory()) {
                // If it's a directory, recursively process it
                processDirectory(filePath, ignoreExp);
            } else {
                // If it's a file, add it to the list
                filesToUpdate.push({
                    name: file,
                    path: relPath,
                    size: stats.size
                });
            }
        }
    };

    processDirectory(DIST_DIR, /dist\.zip$/);
    return filesToUpdate;
}

function postFilesToUpdate(files) {
    return httpsRequest('POST', JSON.stringify({ files }));
}

const isFileAllowed = (file) => STATIC_ALLOWED.some(allowedPath => file.startsWith(allowedPath));

const hasFileChanged = (src, dest) => {
    if (!fs.existsSync(dest)) {
        return true; // File doesn't exist in dest, needs to be copied
    }

    const srcStats = fs.statSync(src);
    const destStats = fs.statSync(dest);

    return srcStats.mtimeMs !== destStats.mtimeMs; // Compare last modified times
};

const copyStaticFiles = (srcDir, destDir) => {
    const filesToCopy = [];
    let totalFiles = 0;
    let skipFiles = 0;

    const exploreDirectory = (currentDir) => {
        const files = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const file of files) {
            ++totalFiles;
            const fullPath = path.join(currentDir, file.name);
            if (file.isDirectory()) {
                exploreDirectory(fullPath);
            } else {
                if (isFileAllowed(fullPath.replace(srcDir, ''))) {
                    filesToCopy.push(fullPath);
                } else {
                    ++skipFiles;
                }
            }
            process.stdout.write(` ${NANO} ${GREEN}${filesToCopy.length}${RESET} of ${totalFiles} skipped ${skipFiles}    \r`);
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
            fs.copyFileSync(file, destPath);
            if (fs.existsSync(destPath)) {
                ++copied;
            } else {
                ++failed;
            }
        } else {
            ++same;
        }
        process.stdout.write(` ${NANO} ${GREEN}${OK} ${copied}${RESET} ${RED}${FAIL} ${failed}${RESET} and ${same} unmodified    \r`);
    }
    console.log('');
    return filesToCopy;
};

// @todo improve the function to send files by chunks maximum 100Mb each. fix errors
async function sendFiles1(filesToUpdate) {
    return new Promise((resolve, reject) => {
        let currentChunkSize = 0;
        let archiveIndex = 0;
        let currentArchive;
        let output;

        const startNewArchive = () => {
            if (currentArchive) {
                currentArchive.finalize();
            }
            const zipPath = path.join(DIST_DIR, `dist_${archiveIndex}.zip`);
            output = fs.createWriteStream(zipPath);
            currentArchive = archiver('zip', { zlib: { level: 9 } });
            currentArchive.pipe(output);
            archiveIndex++;
            currentChunkSize = 0;
        };

        // Initialize the first archive
        startNewArchive();

        const zipPath = path.join(DIST_DIR, 'dist.zip');
        // const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        let totalBytes = 0;
        filesToUpdate.forEach(file => {
            const filePath = path.join(DIST_DIR, file.path);
            const fileSize = fs.statSync(filePath).size;

            // If adding this file exceeds the chunk size, start a new archive
            if (currentChunkSize + fileSize > MAX_CHUNK_SIZE) {
                startNewArchive();
            }

            currentArchive.file(filePath, { name: file.path });
            currentChunkSize += fileSize;
            // totalBytes += fs.statSync(path.join(DIST_DIR, file.path)).size;
        });

        if (currentArchive) {
            currentArchive.finalize();
        }

        let checkpoint = Date.now();

        archive.on('progress', data => {
            const percent = (data.fs.processedBytes / totalBytes * 100).toFixed(2);
            const progress = Date.now() - checkpoint;
            process.stdout.write(`\rCreating archive ${archiveIndex} .. ${percent}% in ${(progress / 1000).toFixed(2)}sec`);
        });

        let unpackingInterval, unpackingTime = 0;
        const traceUnpacking = () => {
            console.log('');
            unpackingInterval = setInterval(() => {
                unpackingTime += 10;
                process.stdout.write(`Unpacking ${(unpackingTime / 1000).toFixed(2)}sec\r`);
            }, 10);
        }

        const traceUpload = (percentage, uploaded, total) => {
            const progress = Date.now() - checkpoint;
            process.stdout.write(`${percentage.toFixed(1)}% uploaded ${(uploaded / 1024).toFixed(1)}Kb of ${(total / 1024).toFixed(1)}Kb in ${(progress / 1000).toFixed(2)}sec      \r`);
            if (uploaded >= total) {
                traceUnpacking();
            }
        };

        const clearIntervals = () => {
            if (unpackingInterval) unpackingInterval = clearInterval(unpackingInterval) || null;
        };

        output.on('close', function () {
            console.log(`\nCompressed with the size of ${(archive.pointer() / 1024).toFixed(1)}Kb into ${zipPath}`);
            const zipStats = fs.statSync(zipPath);

            const headers = {
                'Content-Type': 'application/octet-stream',
                'Content-Length': zipStats.size
            };

            console.log(`Sending to the ${API_URL.hostname}${API_URL.pathname}`);
            checkpoint = Date.now();
            httpsRequest('PUT', fs.createReadStream(zipPath), headers, '', traceUpload)
                .then(response => {
                    clearIntervals();
                    console.log(`\nFiles successfully sent!`);
                    resolve({ response, zipPath })
                })
                .catch(error => {
                    clearIntervals();
                    reject(error);
                });
        });

        archive.on('error', function (err) {
            reject(err);
        });

        archive.pipe(output);

        filesToUpdate.forEach(file => {
            archive.file(path.join(DIST_DIR, file.path), { name: file.path });
        });

        archive.finalize();
    });
}

async function sendFiles(filesToUpdate, sessionId) {
    return new Promise(async (resolve, reject) => {
        const prepareArchives = () => {
            let currentChunkSize = 0;
            let archiveIndex = 0;
            let archives = [];
    
            const startNewArchive = () => {
                const zipPath = path.join(DIST_DIR, `dist_${archiveIndex}.zip`);
                archives.push({ zipPath, size: 0, files: [] });
                archiveIndex++;
                currentChunkSize = 0;
            };
    
            startNewArchive();
            let currentArchive = archives[archives.length - 1];
            let total = 0;

            for (const file of filesToUpdate) {
                const filePath = path.join(DIST_DIR, file.path);
                const fileSize = fs.statSync(filePath).size;
                total += fileSize;
                print(` ${NANO} ${((currentChunkSize + fileSize) / 1024).toFixed(1)}Kb ${file.path}`);
    
                if (currentChunkSize + fileSize > MAX_CHUNK_SIZE) {
                    currentArchive.size = currentChunkSize;
                    print(` ${OK} ${(currentChunkSize / 1024).toFixed(1)}Kb ${path.basename(currentArchive.zipPath)}`);
                    console.log('');
                    startNewArchive();
                }
    
                currentArchive = archives[archives.length - 1];
                currentArchive.files.push({ file: filePath, name: file.path });
                currentChunkSize += fileSize;
            }
            if (currentArchive.files) {
                // files are already here prepared to pack.
            }
            console.log(`\r${archives.length} archives are prepared to pack ${(total / 1024 / 1024).toFixed(1)}Mb of data`);
            return archives;
        };

        const packArchive = async (archiveData) => {
            return new Promise((resolve, reject) => {
                fs.writeFileSync(archiveData.zipPath, '');
                const output = fs.createWriteStream(archiveData.zipPath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                for (const file of archiveData.files) {
                    archive.file(file.file, { name: file.name });
                }
                archive.pipe(output);

                // Listen to 'end' event of the output stream
                output.on('close', async () => {
                    resolve(archiveData);
                });

                // Handle errors in the archive creation
                archive.on('error', (err) => {
                    reject(err);
                });

                // Progress event for tracking the zipping process
                archive.on('progress', (progress) => {
                    print(` ${NANO} archiving ${(progress.fs.processedBytes / 1024).toFixed(1)} Kb`);
                });

                archive.finalize();
            });
        };

        const sendArchive = async (archiveData, chunks) => {
            return new Promise((resolve, reject) => {
                const zipStats = fs.statSync(archiveData.zipPath);
                const headers = {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': zipStats.size
                };
                const query = `?id=${encodeURIComponent(sessionId)}&chunks=${chunks}`;
                archiveData.size = zipStats.size;
                print(`${GREEN}${OK}${RESET} archive ${path.basename(archiveData.zipPath)} in ${(zipStats.size / 1024).toFixed(1)} bytes`, '\n');

                try {
                    const stream = fs.createReadStream(archiveData.zipPath);
                    httpsRequest('PUT', stream, headers, query).then((response) => {
                        resolve(response);
                    }, (error) => {
                        reject(error);
                    })
                } catch (error) {
                    reject(error);
                }
            });
        };

        const packAllArchives = async (archives) => {
            for (let archiveData of archives) {
                await packArchive(archiveData);
            }
        };

        const sendAllArchives = async (archives) => {
            for (let archiveData of archives) {
                await sendArchive(archiveData, archives.length);
            }
        };

        const archives = prepareArchives();
        fs.writeFileSync('publish.archives.json', JSON.stringify(archives));

        try {
            await packAllArchives(archives);
            await sendAllArchives(archives);
            resolve(archives);
        } catch (error) {
            reject(error);
        }
    });
}

async function deleteFiles(files) {
    const deleted = [];
    for (const file of files) {
        const res = await httpsRequest('DELETE', null, {}, `?file=${encodeURIComponent(file)}`);
        deleted.push(res['fileRemoved'] || null);
    };
    return deleted;
}

async function version() {
    return getVersionToUpdate();
}

function compareChanges(filesToUpdate) {
    const toUpdate = [];
    for (const i in filesToUpdate) {
        const file = filesToUpdate[i];
        const localFilePath = path.join(DIST_DIR, file.path);
        const localFileHash = calculateFileHash(localFilePath);
        if (localFileHash !== file.hash) {
            toUpdate.push(file);
        }
        process.stdout.write(` ${NANO} ${parseInt(i) + 1} of ${filesToUpdate.length} to update ${toUpdate.length}\r`);
    }
    return toUpdate;
}

function protectDistFiles() {
    const unwantedFiles = [];
    for (const file of FILES_TO_REMOVE) {
        const filePath = path.join(DIST_DIR, file);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        const state = fs.existsSync(filePath);
        if (state) {
            unwantedFiles.push(filePath);
        }
        process.stdout.write(` ${state ? RED : GREEN}${FAIL}${RESET} ${file}\n`);
    }
    console.log('');
    return unwantedFiles;
}

async function whatToUpdateAndRemove(files, errors) {
    const body = JSON.stringify(files);
    console.log(`\rPosting files to update ${files.length} files, GET ${(Buffer.byteLength(body, 'utf-8') / 1024).toFixed(1)}Kb`);
    let checkpoint = Date.now();
    let waitingInterval = setInterval(() => {
        process.stdout.write(`  checking website files ${((Date.now() - checkpoint) / 1000).toFixed(2)}sec   \r`);
    }, 10);
    try {
        const res = await postFilesToUpdate(files);
        clearInterval(waitingInterval);
        console.log('\n  + for files to add/update, - for files to remove');
        console.log(`  + ${GREEN}${res.filesToUpdate.length}${RESET}  - ${RED}${res.filesToRemove.length}${RESET}`);
        return res;
    } catch (err) {
        clearInterval(waitingInterval);
        errors.push(err);
        console.error(err);
        process.exit(1);
        return null;
    }
}

function generateSessionId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const formattedDate = `${year}${month}${day}`;

    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const microsecondsSinceMidnight = (now - midnight) * 1000;
    const base36Microseconds = microsecondsSinceMidnight.toString(36);

    return `${formattedDate}.${base36Microseconds}`;
}

async function publish() {
    const errors = [];
    const logFile = path.join(__dirname, LOG_FILE);
    const log = {};
    const sessionId = generateSessionId();
    console.log(`Session ID: ${sessionId}`);
    fs.writeFileSync(logFile, '');

    console.log(`\nCopying ${path.relative(__dirname, STATIC_DIR)} ${NANO} ${path.relative(__dirname, DIST_DIR)}`);
    copyStaticFiles(STATIC_DIR, DIST_DIR);

    console.log('\nProtecting from unwanted files to upload');
    log.unwantedFiles = protectDistFiles();
    saveYAML(logFile, log);

    console.log('Getting files to update ...');
    const files = getFilesToUpdate();
    log.files = files;
    saveYAML(logFile, log);

    const { filesToUpdate, filesToRemove } = await whatToUpdateAndRemove(files, errors);
    log.errors = errors;
    log.filesToUpdate = filesToUpdate;
    log.filesToRemove = filesToRemove;
    saveYAML(logFile, log);

    process.stdout.write('Comparing changes ...\n');
    log.toUpdate = compareChanges(log.filesToUpdate);
    process.stdout.write(`\n + ${log.toUpdate.length}\n`);
    saveYAML(logFile, log);

    if (log.toUpdate.length) {
        const response = await sendFiles(log.toUpdate, sessionId);
        let exitCode = 0;

        if (response['files']) {
            // for (let file of response['files']) {
            //     fs.unlinkSync(file.path);
            //     file.isDeleted = !fs.existsSync(file.path);
            // }
            // log.zip = response['files'];
        } else {
            // console.log(`${RED}${FAIL} ${RESET}Cannot pack and zip file(s)`);
            log.errors.push('Cannot pack and send zip file(s)');
            exitCode = 1;
        }
        saveYAML(logFile, log);
        if (exitCode) process.exit(exitCode);
    } else {
        console.log(`${GREEN}${OK}$ Nothing to publish${RESET}, you have the recent version online.`)
    }

    checkpoint = Date.now();
    waitingInterval = setInterval(() => {
        process.stdout.write(`  deleting files .. ${((Date.now() - checkpoint) / 1000).toFixed(2)}sec   \r`);
    }, 10);
    log.deleted = await deleteFiles(filesToRemove, sessionId);
    clearInterval(waitingInterval);
    if (log.deleted.length) {
        console.log(`${log.deleted.length} files removed`);
    }
    const color = errors.length ? RED : GREEN;
    console.log(` ${color}${NANO}${RESET} publishing complete`);
    saveYAML(logFile, log);
    process.exit(errors.length > 0 ? 1 : 0);
}

if (process.argv[2] && 'version' === process.argv[2]) {
    version().then(v => {
        console.log(JSON.stringify(v));
    }, err => console.error(err));
} else {
    publish().catch(console.error);
}

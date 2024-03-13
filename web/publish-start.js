const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const Stream = require('node:stream').Stream;
const archiver = require('archiver');
const { saveYAML, completeYAML } = require('./src/fs');
const { print, GREEN, RED, RESET, OK, FAIL, NANO } = require('./src/cli');
const { DIST_DIR, STATIC_DIR, STATIC_ALLOWED, GALLERY_THUMB_DIR, PUBLISH_ARCHIVE_META, ARCHIVE_DIR } = require('./config');

require('dotenv').config();

const LOG_FILE = 'logs/publish.logs.yaml';
const MAX_CHUNK_SIZE = 100 * 1024 * 1024; // 100 MB in bytes
const FILES_TO_REMOVE = [
    '.env',
    'output.json',
    'send.php',
    'config.php',
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
                    file: relPath,
                    time: Math.floor(stats.mtimeMs / 1000),
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

async function prepareFiles(filesToUpdate, sessionId) {
    return new Promise(async (resolve, reject) => {
        const prepareArchives = () => {
            let currentChunkSize = 0;
            let archiveIndex = 0;
            let archives = [];
    
            const startNewArchive = () => {
                ++archiveIndex;
                const zipPath = path.join(ARCHIVE_DIR, `dist_${archiveIndex}.zip`);
                archives.push({ zipPath, size: 0, files: [] });
                currentChunkSize = 0;
            };
    
            startNewArchive();
            let currentArchive = archives[archives.length - 1];
            let total = 0;

            let i = 0;
            let length = filesToUpdate.length;
            for (const file of filesToUpdate) {
                const filePath = path.join(DIST_DIR, file);
                const fileSize = fs.statSync(filePath).size;
                total += fileSize;
                ++i;
                print(` ${NANO} ${i} of ${length} prepared`);
                if (currentChunkSize + fileSize > MAX_CHUNK_SIZE) {
                    currentArchive.size = currentChunkSize;
                    startNewArchive();
                }
                currentArchive = archives[archives.length - 1];
                currentArchive.files.push(file);
                currentChunkSize += fileSize;
            }
            if (currentArchive.files) {
                currentArchive.size = currentChunkSize;
                // files are already here prepared to pack.
            }
            console.log(`\r${archives.length} archives are prepared for packing ${(total / 1024 / 1024).toFixed(1)}Mb of data`);
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
        resolve(archives);
    });
}

async function version() {
    return getVersionToUpdate();
}

function compareChanges(filesToUpdate) {
    const toUpdate = [];
    let i = 0;
    const updateLength = Object.keys(filesToUpdate).length;
    for (const file in filesToUpdate) {
        const info = filesToUpdate[file];
        const filePath = path.join(DIST_DIR, file);
        const stat = fs.statSync(filePath);
        if (stat.size !== info.size || Math.floor(stat.timeMs / 1000) > info.time) {
            toUpdate.push(file);
        }
        process.stdout.write(` ${NANO} ${++i} of ${updateLength} to update ${toUpdate.length}\r`);
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
        const updateLength = Object.keys(res.filesToUpdate).length;
        const removeLength = Object.keys(res.filesToRemove).length;
        clearInterval(waitingInterval);
        console.log('\n  + for files to add/update, - for files to remove');
        console.log(`  + ${GREEN}${updateLength}${RESET}  - ${RED}${removeLength}${RESET}`);
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
    const startedAt = Date.now();
    const errors = [];
    const logFile = path.join(__dirname, LOG_FILE);
    if (fs.existsSync(logFile)) {
        console.log(`Sync is ${RED}already${RESET} in process`);
        process.exit(1);
        return;
    }
    const log = {};
    const sessionId = generateSessionId();
    console.log(`Session ID: ${sessionId}`);
    fs.writeFileSync(logFile, '');

    console.log('\nProtecting from unwanted files to upload');
    log.startedAt = startedAt;
    log.unwantedFiles = protectDistFiles();
    saveYAML(logFile, log);

    console.log('Getting files to update ...');
    const files = getFilesToUpdate();
    log.files = files.length;
    saveYAML(logFile, log);

    const { filesToUpdate, filesToRemove } = await whatToUpdateAndRemove(files, errors);
    log.errors = errors;
    // log.filesToUpdate = filesToUpdate;
    log.filesToRemove = filesToRemove;
    saveYAML(logFile, log);

    process.stdout.write('Comparing changes ...\n');
    log.toUpdate = compareChanges(filesToUpdate);
    process.stdout.write(`\n + ${log.toUpdate.length}\n`);
    saveYAML(logFile, log);

    let archives = [];
    if (log.toUpdate.length) {
        archives = await prepareFiles(log.toUpdate, sessionId);
        log.archives = archives;
        saveYAML(logFile, log);
        console.log('Passing processessing to archive.py');
    } else {
        console.log(` ${GREEN}${OK} Nothing to publish${RESET}, you have the recent version online.`)
    }
    saveYAML(PUBLISH_ARCHIVE_META, { sessionId, archives, filesToRemove });
    process.exit(0);
}

if (process.argv[2] && 'version' === process.argv[2]) {
    version().then(v => {
        console.log(JSON.stringify(v));
    }, err => console.error(err));
} else {
    publish().catch(console.error);
}

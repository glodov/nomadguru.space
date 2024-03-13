const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const Stream = require('node:stream').Stream;
const { saveYAML, loadYAML, completeYAML } = require('./src/fs');
const { print, GREEN, RED, RESET, OK, FAIL, NANO } = require('./src/cli');
const { PUBLISH_ARCHIVE_META } = require('./config');

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
                        reject(Object.assign({}, { body: responseData, statusCode: res.statusCode, headers: res.headers }));
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

// @todo add progress to the uploading
async function sendFiles(archives, sessionId) {
    return new Promise(async (resolve, reject) => {
        const sendArchive = async (archiveData, chunks) => {
            return new Promise((resolve, reject) => {
                const zipStats = fs.statSync(archiveData.zipPath);
                const headers = {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': zipStats.size
                };
                const base = path.basename(archiveData.zipPath);
                const query = `?id=${sessionId}&chunks=${chunks}`;
                archiveData.size = zipStats.size;
                print(` ${GREEN}${OK}${RESET} archive ${base} of ${(zipStats.size / 1024 / 1024).toFixed(1)}Mb`, '\n');

                try {
                    const stream = fs.createReadStream(archiveData.zipPath);
                    let uploaded = 0; // Track uploaded data
                    const startedStreamAt = Date.now();
                    let streamIn;
                    stream.on('data', (chunk) => {
                        uploaded += chunk.length;
                        const progress = (uploaded / zipStats.size * 100).toFixed(1);
                        streamIn = ((Date.now() - startedStreamAt) / 1000).toFixed(2);
                        print(` ${NANO} Uploading ${base}: ${progress}% in ${streamIn}sec`);
                    });
                    let waitingInterval;
                    let startedUnpackingAt;
                    stream.on('close', () => {
                        startedUnpackingAt = Date.now();
                        waitingInterval = setInterval(() => {
                            const time = ((Date.now() - startedUnpackingAt) / 1000).toFixed(2);
                            print(` ${GREEN}${NANO}${RESET} Uploaded ${base}: 100% in ${streamIn}sec ${NANO} Unpacking on server in ${time}sec`);
                        }, 10);
                    })
                    httpsRequest('PUT', stream, headers, query).then((response) => {
                        const time = ((Date.now() - startedUnpackingAt) / 1000).toFixed(2);
                        const totalTime = ((Date.now() - startedStreamAt) / 1000).toFixed(2);
                        print(` ${GREEN}${NANO}${RESET} Uploaded ${base}: 100% in ${streamIn}sec ${NANO} Unpacked on server in ${time}sec ${NANO} ${totalTime}sec`);
                        clearInterval(waitingInterval);
                        console.log('');
                        resolve(response);
                    }, (error) => {
                        const time = ((Date.now() - startedUnpackingAt) / 1000).toFixed(2);
                        const totalTime = ((Date.now() - startedStreamAt) / 1000).toFixed(2);
                        clearInterval(waitingInterval);
                        print(` ${RED}${NANO}${RESET} Uploaded ${base}: 100% in ${streamIn}sec ${RED}${NANO}${RESET} Unpacked on server in ${time}sec ${RED}${NANO}${RESET} ${totalTime}sec`);
                        console.log('');
                        reject(error);
                    })
                } catch (error) {
                    reject(error);
                }
            });
        };

        try {
            for (let archive of archives) {
                await sendArchive(archive, archives.length);
                fs.unlinkSync(archive.zipPath);
            }
            resolve(archives);
        } catch (error) {
            reject(error);
        }
    });
}

async function deleteFiles(files) {
    const deleted = [];
    const corrupted = [];
    const length = Object.keys(files).length;
    let i = 0;
    for (const file in files) {
        ++i;
        try {
            const res = await httpsRequest('DELETE', null, {}, `?file=${encodeURIComponent(file)}`);
            const color = res['removed'] ? GREEN : RED;
            const symbol = `${color}${NANO}${RESET}`;
            print(` ${symbol} ${i} of ${length} ${symbol} ${file}`);
            if (res['removed']) {
                deleted.push(res['fileRemoved']);
            } else {
                corrupted.push(res['fileRemoved']);
            }
        } catch (err) {
            corrupted.push(file);
            x = 9;
        }
    };
    return { deleted, corrupted };
}

async function publish() {
    const logFile = path.join(__dirname, LOG_FILE);
    const log = fs.existsSync(logFile) ? loadYAML(logFile) : null;
    if (!log) {
        console.log(`Cannot load ${logFile}`);
        process.exit(1);
    }
    const meta = loadYAML(PUBLISH_ARCHIVE_META);
    const sessionId = meta.sessionId;
    if (meta.archives.length) {
        console.log(`Sending ${meta.archives.length} files with session ID: ${sessionId}`);
        await sendFiles(meta.archives, sessionId);
        // saveYAML(logFile, log);
    } else {
        console.log(` ${GREEN}${OK}${RESET} No data to send`);
    }

    if (Object.keys(meta.filesToRemove).length > 0) {
        print(`Removing files`, "\n");
        const res = await deleteFiles(meta.filesToRemove, sessionId);
        log.deleted = res.deleted;
        log.corrupted = res.corrupted;
        saveYAML(logFile, log);
        if (log.deleted.length) {
            print(` ${GREEN}${OK}${RESET} ${log.deleted.length} files removed`, "\n");
        }
        if (log.corrupted.length) {
            print(` ${RED}${FAIL}${RESET} ${log.deleted.length} files corrupted`, "\n");
        }
    } else {
        print(` ${GREEN}${OK}${RESET} No files to remove`, "\n");
    }

    const completedAt = Date.now();
    const time = (completedAt - log.startedAt) / 1000;
    print(` ${GREEN}${NANO}${RESET} publishing complete in ${time.toFixed(1)} seconds ${GREEN}${NANO}${NANO}${NANO}${RESET}`, "\n");
    log.completedAt = completedAt;
    log.spentTime = time;
    saveYAML(logFile, log);
    completeYAML(logFile);
    completeYAML(PUBLISH_ARCHIVE_META);
    process.exit(0);
}

publish().catch(console.error);

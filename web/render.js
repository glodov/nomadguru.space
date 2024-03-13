// const fs = require('node:fs');
const fs = require('fs-extra');
const path = require('node:path');
const { ensureDirectory, calculateFileHash, saveYAML, loadYAML } = require('./src/fs');
const { versionSlug, runtime } = require('./src/runtime');
const { GREEN, NANO, RESET, RED, OK, FAIL, print, progress, spent, mem } = require('./src/cli');
const { loadEverything, renderFile } = require('./src/render/core');

require('dotenv').config();

const {
    DIST_DIR, ROOT_DIR, DATA_DIR, THEMES_DIR, STATIC_DIR, GALLERY_THUMB_DIR,
    NANO_DIR, SEARCH_GALLERY, RENDER_PROCESS, HOST, ALLOWED_ENV, 
    STATIC_ALLOWED, SEARCH_INDEX_CATS
} = require('./config');

const LOG_FILE = 'logs/render.logs.yaml';
const PUBLIC_VERSION_FILES = [];

runtime.ROOT_DIR = ROOT_DIR;
runtime.DIST_DIR = DIST_DIR;
runtime.DATA_DIR = DATA_DIR;
runtime.VIEWS_DIR = THEMES_DIR;
runtime.STATIC_DIR = STATIC_DIR;
runtime.STATIC_ALLOWED = STATIC_ALLOWED;
runtime.SEARCH_GALLERY = SEARCH_GALLERY;
runtime.SEARCH_INDEX_CATS = SEARCH_INDEX_CATS;
runtime.GALLERY_THUMB_DIR = GALLERY_THUMB_DIR;
runtime.NANO_DIR = NANO_DIR;
runtime.RENDER_PROCESS = RENDER_PROCESS;
runtime.ALLOWED_ENV = ALLOWED_ENV['public'];
runtime.HOST = HOST;
runtime.versionSlug = versionSlug;

// only require after runtime.NANO_DIR is defined
const { read, getStores } = require('./src/render/html/_/store.js');

function writeVersion(version) {
    const data = { version, files: [] };
    PUBLIC_VERSION_FILES.forEach(f => {
        const file = path.join(STATIC_DIR, f);
        const stats = fs.statSync(file);
        data.files.push({
            path: f,
            size: stats.size,
            hash: calculateFileHash(file)
        });
    });
    const file = path.join(DIST_DIR, 'version.json');
    fs.writeFileSync(file, JSON.stringify(data));
    const stats = fs.statSync(file);
    return stats['size'] || 0;
}

function readVersion(input) {
    if (!input || !input['version'] || !input['files']) return versionSlug;
    let different = false;
    let found = 0;
    input.files.forEach(f => {
        if (PUBLIC_VERSION_FILES.includes(f.path)) found++;
        if (different) return;
        const file = path.resolve(STATIC_DIR, f.path);
        if (!fs.existsSync(file)) {
            different = true;
            return;
        }
        const stats = fs.statSync(file);
        if (stats.size !== f.size || calculateFileHash(file) !== f.hash) {
            different = true;
            return;
        }
    });
    if (found !== PUBLIC_VERSION_FILES.length) different = true;
    return different ? versionSlug : input['version'];
}

let renderModules = runtime['RENDER_PROCESS']?.['public'] || {};
if (process.argv.includes('--search')) {
    renderModules = runtime['RENDER_PROCESS']?.['search'];
}
if (process.argv.includes('--index')) {
    renderModules = runtime['RENDER_PROCESS']?.['index'];
}
const { errors, dataFiles, allSorted, all, refers, langs, cats, globalUris, addon } = loadEverything();

async function renderUri(args) {
    const { html } = await renderFile(args);
    if (html && html['cached']) {
        return { cached: true, html };
    }
    return { cached: false, html };
}

async function renderAllFiles(input = null, forced = []) {
    ensureDirectory(DIST_DIR, false);
    // loop through all the dataFiles and render every
    let files = allSorted.map(a => ({ current: a.file, file: path.join(DATA_DIR, a.file) }));
    files = files.filter(a => dataFiles.includes(a.file));
    const checkpoint = Date.now();
    const rendered = [];
    const options = { renderModules, all, refers, langs, cats, globalUris, addon };
    let cachedCount = 0;
    let dependencies = [];
    for (let i = 0; i < files.length; i++) {
        const { current, file } = files[i];
        let color = GREEN;
        try {
            const args = { current, file, filesIndex: i, filesLen: files.length, ...options };
            const res = await renderUri(args);
            dependencies = [...dependencies, ...(res['html']?.['extraDeps'] || [])];
            if (res.cached) {
                ++cachedCount;
            } else {
                rendered.push(current);
            }
        } catch (err) {
            color = RED;
            errors.push(Object.assign({}, { file, text: 'Unable to render' }, { err }));
        }
        let msg = ` ${color}${NANO}${RESET} Rendering files (${i + 1}/${files.length})`;
        print(`${msg} ${progress(i, files.length)}% in ${spent(checkpoint)}sec ${color}${NANO}${RESET} ${mem()}`);
    }
    const color = errors.length ? RED : GREEN;
    const dot = errors.length ? FAIL : OK;
    let msg = ` ${color}${dot}${RESET} Rendering files (${files.length})`;
    print(`${msg} ${progress(1, 1)}% in ${spent(checkpoint)}sec ${color}${NANO}${RESET} ${mem()}`, "\n");

    if (dependencies.length) {
        print(` ${NANO} ${dependencies.length} catalog dependencies to render:`, "\n");
        for (const file of dependencies) {
            const current = file.endsWith('.yaml') ? file.slice(0, file.length - '.yaml'.length) : file;
            if (rendered.includes(current)) continue;
            const args = {
                skipCache: true, current, filesIndex: 0, filesLen: 0, ...options,
                file: path.join(runtime['DATA_DIR'], file),
            };
            const res = await renderUri(args);
            if (res.cached) {
                throw new Error('Impossible to cache uri with the skipCache: true');
            } else {
                rendered.push(current);
            }
        }
    }
    return { errors, files, checkpoint, rendered, cachedCount, dependencies };
}

async function render(input = null) {
    let color = input ? GREEN : RED;
    console.log(` ${color}${NANO}${RESET}`, input);
    if ('string' === typeof input) {
        current = input.trim();
        print(` ${NANO} Rendering the specific file: ${GREEN}${current}${RESET}`, "\n");
        const options = { renderModules, all, refers, langs, cats, globalUris, addon };
        const file = path.join(DATA_DIR, current);
        renderFile({ current, file, filesIndex: 0, filesLen: 0, ...options }).then(res => {
            if (res['html']?.['cached']) {
                console.log(` ${GREEN}${OK}${RESET} Rendered without errors from cache`);
            } else {
                console.log(` ${GREEN}${OK}${RESET} Rendered without errors`, res['html']?.['meta']);
            }
            process.exit(0);
        }).catch(err => {
            console.error(err);
            process.exit(1);
        });
        return;
    }
    const logFile = path.join(__dirname, LOG_FILE);
    // load log
    const log = loadYAML(logFile);
    fs.writeFileSync(logFile, '');
    const forced = [];
    if (log && log['errors'] && log['errors'].length) {
        const entities = { ... (log['brokenLinks'] || {}), ... (log['brokenAssets'] || {}) };
        Object.entries(entities).forEach(([_, failed]) => {
            failed.forEach(f => {
                if (!forced.includes(f)) forced.push(f);
            });
        });
    }

    try {
        const {
            errors, files, checkpoint, rendered, cachedCount, dependencies
        } = await renderAllFiles(input, forced);
        // After rendering all files
        let state = OK;
        // if (brokenAssets.length) errors.push({ text: `${brokenAssets.length} assets not found` });
        // if (brokenLinks.length) errors.push({ text: `${brokenLinks.length} links not found` });
        if (errors.length > 0) {
            console.log(RED, FAIL, RESET, "Errors encountered:");
            errors.forEach((error, index) => {
                console.log(RED, FAIL, RESET, `${index + 1}. ${error.text} >> ${error.file}`);
                if (error.err) console.error(error.err);
            });
            state = FAIL;
        } else {
            console.log(GREEN, OK, RESET, "Rendering complete", cachedCount, NANO, files.length, "files in", spent(checkpoint), 'seconds');
            for (const store of getStores()) {
                const rows = read(store);
                console.log(GREEN, NANO, RESET, rows.length, `${store} found`);
            }
        }
        color = state === FAIL ? RED : GREEN;
        console.log(color, state, RESET, 'For more details check:');
        console.log('  ', color, NANO, RESET, path.relative(__dirname, logFile));
        saveYAML(logFile, { errors, cachedCount, catalogDeps: dependencies, rendered });
        process.exit(errors.length > 0 ? 1 : 0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

process.stdin.setEncoding('utf8');

let inputData = '';

process.stdin.on('readable', async function() {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {
        inputData += chunk;
    }
});

process.stdin.on('end', async function() {
    let json = null;
    if (inputData) {
        try {
            json = JSON.parse(inputData.trim());
        } catch (err) {
            // not a JSON
        }
    }
    await render(json || inputData);
});

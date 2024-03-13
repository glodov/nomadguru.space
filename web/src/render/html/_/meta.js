const fs = require('node:fs');
const { join, relative, dirname } = require('node:path');
const { runtime } = require('../../../runtime');
const { loadJSON, ensureDirectory } = require('../../../fs');

function getHtmlFile(dataFile) {
    if (!runtime['DIST_DIR']) return null;
    const htmlFile = dataFile.endsWith('.yaml') ? dataFile.slice(0, dataFile.length - '.yaml'.length) + '.html' : dataFile;
    return join(runtime['DIST_DIR'], relative(runtime['DATA_DIR'], htmlFile));
}

function makeMeta(deps, file) {
    const files = deps.map(f => {
        let n = f.endsWith('.html') ? f.slice(0, f.length - '.html'.length) : f;
        if (!n.endsWith('.yaml')) n = n.startsWith('/') ? `${n}.yaml` : `${n}/_.yaml`;
        return join(runtime['DATA_DIR'], n.startsWith('/') ? n.slice(1) : n);
    });
    files.push(file);
    const meta = {
        deps: {},
        html: {
            file: relative(runtime['DIST_DIR'], getHtmlFile(file)),
            ctimeMs: 0,
        }
    };
    for (const f of files) {
        let value = 0;
        if (fs.existsSync(f)) {
            const { ctimeMs } = fs.statSync(f);
            value = ctimeMs;
        }
        meta.deps[relative(runtime['DATA_DIR'], f)] = value;
    }
    return meta;
}

function isMetaUpdated(old, now) {
    if (now.html.ctimeMs > old.html.ctimeMs) return true;
    let c = 0;
    for (const f in old.deps) {
        ++c;
        if (!now.deps[f] || now.deps[f] && now.deps[f] > old.deps[f]) return true;
    }
    if (Object.keys(now.deps).length !== c) return true;
    return false;
}

function readMeta(file) {
    const metaFile = getMetaFile(file);
    if (!fs.existsSync(metaFile)) return false;
    return loadJSON(metaFile);
}

function saveMeta(file, meta) {
    const metaFile = getMetaFile(file)
    ensureDirectory(dirname(metaFile));
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    return fs.existsSync(metaFile);
}

function getMetaFile(dataFile) {
    const metaFile = join(runtime['NANO_DIR'], relative(runtime['DATA_DIR'], dataFile));
    return metaFile.slice(0, metaFile.length - '.yaml'.length) + '.json';
}

function isFileUpdated(deps, file) {
    const res = { is: true, old: null, now: null };
    if (!runtime['NANO_DIR']) return res;
    res.old = readMeta(file);
    if (!res.old) return res;
    res.now = makeMeta(deps, file);
    res.is = isMetaUpdated(res.old, res.now);
    return res;
}

module.exports = {
    isFileUpdated,
    getHtmlFile,
    getMetaFile,
    makeMeta,
    readMeta,
    saveMeta,
};
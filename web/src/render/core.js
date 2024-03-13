const fs = require('node:fs');
const path = require('node:path');
const { deepMerge, detectLang, getLang, extractOnly } = require('../data');
const ejsFunctions = require('../ejs/functions');
const { utils } = require('../ejs/utils');
const { decodeUri, fileToUri } = require('../url');
const { findAllFiles, loadYAML } = require('../fs');
const { GREEN, NANO, RESET, RED, OK, FAIL, print, progress, spent } = require('../cli');
const { runtime, versionSlug, timestampVersion } = require('../runtime');
const vars = require('./vars');

function loadRawFiles(files) {
    const all = {};
    const refers = {};
    const $extends = {};
    const errors = [];
    let checkpoint = Date.now();
    let i = 0;
    let msg = ` ${OK} Loading all the data files (${files.length})`;
    print(`${msg} ${progress(i, files.length)}% ${spent(checkpoint)}sec`);
    for (const file of files) {
        const stat = fs.statSync(file);
        const data = loadYAML(file);
        if ('object' !== typeof data || null === data) {
            errors.push({ message: `Cannot load file ${file}` });
            continue;
        }
        const uri = path.relative(runtime['DATA_DIR'], file);
        if ('string' === typeof data['$refer']) {
            refers[uri.replace(/\.(ht|ya)ml$/, '')] = data['$refer'].replace(/\.html$/, '');
        }
        if ('string' === typeof data['$extend']) {
            $extends[uri.replace(/\.(ht|ya)ml$/, '')] = data['$extend'].replace(/\.html$/, '');
        }
        all[uri] = {
            stat: { atimeMs: stat.atimeMs, ctimeMs: stat.ctimeMs, mtimeMs: stat.mtimeMs },
            data,
        };
        ++i;
        print(`${msg} ${progress(i, files.length)}% ${spent(checkpoint)}sec`);
    }
    print(` ${GREEN}${OK}${RESET} Loaded all the data files ${files.length} in ${spent(checkpoint)}sec`, "\n");
    return { all, refers, $extends, errors };
}

function sortFiles(files, field = 'mtimeMs', dir = 'desc') {
    const sorted = [];
    for (const file in files) sorted.push({ file, by: files[file].stat[field]});
    return sorted.sort((a, b) => dir === 'desc' ? b.by - a.by : a.by - b.by);
}

function getRaw(dataUri, allRaw) {
    let file = dataUri.endsWith('.html') ? dataUri.slice(0, dataUri.length - '.html'.length) : dataUri;
    if (!file.endsWith('.yaml')) file += '.yaml';
    if (file.startsWith('/')) file = file.slice(1);
    if ('undefined' === typeof allRaw[file]) {
        throw new Error(`Refering to non existent file ${file}`);
    }
    return allRaw[file].data;
}

function combine(uri, allRaw, withSelf = false) {
    const dataFile = vars.nwFileUri.to(uri);
    if (!allRaw[dataFile]) {
        throw new Error(`Data is not present by uri: ${dataFile} `);
    }
    const rawData = Object.assign({}, allRaw[dataFile].data);
    const words = dataFile.split('/');
    let data = {};
    const loaded = [];
    const root = '_.yaml';
    if (allRaw[root]) {
        loaded.push(vars.nwFileUri.to(root));
        data = deepMerge(data, allRaw[root].data);
    }
    for (let i = 1; i < words.length; i++) {
        const dir = words.slice(0, i).join('/');
        const dirFile = `${dir}/_.yaml`;
        if ('undefined' === typeof allRaw[dirFile]) continue;
        loaded.push(vars.nwFileUri.to(dirFile));
        data = deepMerge(data, allRaw[dirFile].data);
    }
    let extend = {};
    if (rawData['$extend']) {
        extend = deepMerge(extend, getRaw(rawData['$extend'], allRaw));
        loaded.push(vars.nwFileUri.to(rawData['$extend']));
    }
    if (rawData['$refer']) {
        extend = deepMerge(extend, getRaw(rawData['$refer'], allRaw));
        loaded.push(vars.nwFileUri.to(rawData['$refer']));
    }
    if (withSelf) {
        loaded.push(dataFile);
    }
    return {
        data: deepMerge(data, deepMerge(extend, rawData)),
        dependencies: loaded.slice(),
        loaded,
    };
}

function readGlobal(lang, allRaw, globalUris) {
    const main = [];
    const local = [];
    for (const uri of globalUris) {
        const words = uri.split('/');
        if (words[0]) {
            if (words[0] === '_') {
                main.push({ uri, slug: words.slice(1).join('/').replace(/\.yaml$/, '') });
            } else if (words[0] === lang) {
                local.push({ uri, slug: words.slice(2).join('/').replace(/\.yaml$/, '') });
            }
        }
    }
    let global = {};
    for (const f of main) global[f.slug] = allRaw[f.uri]?.['data'] || null;
    for (const f of local) {
        const data = allRaw[f.uri]?.['data'] || null;
        if (Array.isArray(data)) {
            global[f.slug] = data.slice();
        } else if (data) {
            global[f.slug] = Object.assign({}, data);
        }
    }
    return global;
}

function readCategories(allRaw, dataFiles) {
    return dataFiles.reduce((acc, f) => {
        const a = path.relative(runtime['DATA_DIR'], f).replace(/\.yaml$/, '');
        const words = a.split('/');
        if (words.length >= 3) {
            const lang = words[0];
            if (!acc[lang]) acc[lang] = {};
            for (let i = 2; i < words.length; i++) {
                const uri = words.slice(1, i).join('/');
                const fullUri = `${lang}/${uri}.yaml`;
                let category = allRaw[fullUri]?.['data']?.['category'] || false;
                if (!category && allRaw[fullUri]?.['data']?.['$catalog']) {
                    category = allRaw[fullUri]?.['data']?.['title'];
                    const catalogUri = allRaw[fullUri]?.['data']?.['$catalog'];
                    // in the most cases catalogUri === uri
                    acc[lang][catalogUri] = category;
                } else if (category) {
                    acc[lang][uri] = category
                }
            }
        }
        return acc;
    }, {});
}

function loadExtends(all, $extends) {
    for (const u in $extends) {
        const uri = `${u}.yaml`;
        const rel = `${$extends[u].slice(1)}.yaml`;
        const obj = Object.assign({}, all[rel]?.['data']);
        const orig = Object.assign(all[uri]?.['data']);
        delete orig['$extend'];
        all[uri]['data'] = deepMerge(obj, orig);
        all[uri]['stat']['atimeMs'] = Math.max(all[uri]['stat']['atimeMs'], all[rel]['stat']['atimeMs']);
        all[uri]['stat']['ctimeMs'] = Math.max(all[uri]['stat']['ctimeMs'], all[rel]['stat']['ctimeMs']);
        all[uri]['stat']['mtimeMs'] = Math.max(all[uri]['stat']['mtimeMs'], all[rel]['stat']['mtimeMs']);
    }
}

function loadAutoRefers(all, langs, refers) {
    if (langs.length < 2) return false;
    const defLang = langs[0].code;
    const candidates = langs.slice(1).map(l => l.code);
    Object.entries(all).forEach(([uri, item]) => {
        if (uri.startsWith(`${defLang}/`)) return;
        const slugs = uri.split('/');
        if (candidates.includes(slugs[0])) {
            const test = [defLang, ...slugs.slice(1)].join('/');
            if (all[test]) {
                // refers[uri.replace(/\.(ht|ya)ml$/, '')] = test.replace(/\.(ht|ya)ml$/, '');
                refers[test.replace(/\.(ht|ya)ml$/, '')] = uri.replace(/\.(ht|ya)ml$/, '');
            }
        }
    });
    return true;
}

function loadEverything() {
    // all settings files
    const dirFiles = findAllFiles(runtime['DATA_DIR'], /[\\\/]_\.yaml$/);
    // all global files
    const globalFiles = findAllFiles(runtime['DATA_DIR'], /[\\\/]_[\\\/].+\.yaml$/);
    // all data files
    const dataFiles = findAllFiles(runtime['DATA_DIR'], /\.yaml$/, /[\\\/]+_|[\\\/]+_\.yaml$/);
    const globalUris = globalFiles.map(f => path.relative(runtime['DATA_DIR'], f));
    // load all files raw
    const allFiles = [...dirFiles, ...globalFiles, ...dataFiles];
    const { all, refers, $extends, errors } = loadRawFiles(allFiles);
    // load all extends
    loadExtends(all, $extends);
    // the newest first
    const allSorted = sortFiles(all, 'ctimeMs', 'desc');
    const allUris = Object.keys(all).map(a => a.endsWith('.yaml') ? a.slice(0, a.length - '.yaml'.length) : a);
    const cats = readCategories(all, dataFiles);
    const langs = all['_/langs.yaml']?.['data'] || [];
    loadAutoRefers(all, langs, refers);
    const addon = {
        'env': extractOnly(process.env, runtime['ALLOWED_ENV']),
        'version': versionSlug || timestampVersion(),
        '$rendering': true,
    };
    return { 
        dirFiles, globalFiles, dataFiles, globalUris, allFiles, all, refers, errors, 
        allSorted, allUris, cats, langs, addon, $extends
    };
}

function guessReferer(data, langs, all) {
    if (!langs || !langs.length) return null;
    if (data['$lang'] === langs[0].code) return null;
    const referUri = data['$uri'].replace(/^(\w{2})\/(.+)/, `${langs[0].code}/$2`);
    return all[referUri] ? referUri : null;
}

const cacheGetDataAllIn = {};
function getAllDataIn(lang, all) {
    if (!cacheGetDataAllIn[lang]) {
        cacheGetDataAllIn[lang] = {};
        const uris = Object.keys(all);
        for (const uri in all) {
            if (uri.endsWith('/_.yaml') || uri === '_.yaml') continue; // avoid global and settings
            const words = uri.split('/');
            if (words[0] !== lang) continue;
            if (words[1] && words[1] == '_') continue; // avoid global in non default language
            const newUri = words.slice(1).join('/');
            const data = all[uri].data;
            if (!uri.includes('/_/')) {
                // no need to load $uri, $uid for global data
                if (!data['$uri']) data['$uri'] = '/' + (uri.endsWith('.yaml') ? uri.slice(0, uri.length - '.yaml'.length) : uri);
                if (!data['$uid']) data['$uid'] = data.$uri.slice(lang.length + '//'.length);
            }
            cacheGetDataAllIn[lang][newUri] = data;
        }
    }
    return cacheGetDataAllIn[lang];
}

function extractCategories(uid) {
    const words = uid.split('/');
    const result = [];
    for (let i = 1; i < words.length; i++) {
        result.push(words.slice(0, i).join('/'));
    }
    return result;
}

function readData(args, includeSelfInDeps = false) {
    const { current, all, refers, langs, cats, globalUris, addon } = args;
    // render the data file
    const combined = combine(current, all, includeSelfInDeps);
    let data       = Object.assign({}, addon || {}, combined.data);
    const uri      = decodeUri(fileToUri(current));
    data['env']    = extractOnly(process.env, runtime['ALLOWED_ENV'].public);
    data['$lang']  = detectLang(uri, langs);
    const currentAndDefaultUris = globalUris.filter(u => {
        const l = detectLang(u, langs);
        return data['$lang'] === l || l === langs[0]?.['code'];
    });
    const deps     = [...currentAndDefaultUris, ...combined.dependencies];
    data['$uri']   = '/' + uri;
    data['$uid']   = data.$uri.slice(data['$lang'].length + '//'.length);
    data['$refer'] = data['$refer'] || guessReferer(data, langs, all);
    data['all']    = getAllDataIn(data['$lang'], all);
    data['$alternates']  = {};
    if (refers[uri]) data['$alternates'][langs[0]?.['code']] = refers[uri] + '.html';
    data['$currentLang'] = getLang(data['$lang'], langs);
    data['global']       = readGlobal(data['$lang'], all, globalUris);
    data['categories']   = cats[data['$lang']];
    if (data['$redirect']) data['$layout'] = 'redirect';
    data = Object.assign({}, ejsFunctions, { u: utils, l: utils.translate, r: runtime }, data);
    const loaded = [];
    for (const u of combined.loaded) {
        loaded.push({ uri: u, data: all[u].data });
    }
    for (const cat of extractCategories(data['$uid'])) {
        if (data['categories'][cat]) deps.push(`${data['$lang']}/${cat}.yaml`);
    }
    return { data, deps, loaded, uri };
}

async function processModules(modules, args) {
    const mods = {};
    for (const renderMod of modules['item']) {
        const fn = require(`./item/${renderMod}`);
        const res = await fn.apply(this, [args, mods]);
        mods[res.key] = res;
    }
    for (const mod in mods) {
        const afterModules = modules[mod] || [];
        for (const renderMod of afterModules) {
            const fn = require(`./${mod}/${renderMod}`);
            const res = await fn.apply(this, [args, mods]);
            mods[res.key] = Object.assign({}, mods[res.key] || {}, res);
        }
    }
    return mods;
}

async function renderFile(args) {
    const { data, deps } = readData(args);
    return await processModules(args.renderModules, { ...args, data, deps, extraDeps: [] });
}

module.exports = {
    loadEverything,
    readData,
    processModules,
    renderFile,
    extractCategories,
};
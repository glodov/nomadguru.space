const fs = require('node:fs');
const path = require('node:path');
const {
    getDataFile,
    loadCatalog,
    readData,
    loadData,
    loadAllData,
    loadAllCatalogs,
    loadCatalogsToTop,
    loadAlternates,
    loadSettings,
    deepMerge,
    detectLang,
    isDefLang,
    getLang,
    guessReferer,
    loadAllFiles,
    resolveDataFile,
    resolveDataUri
} = require('./data');
const { getMemoryUsage, NANO } = require('./cli');
const { removeQueryParams, getQueryParams, decodeUri } = require('./url');
const ejsFunctions = require('./ejs/functions');
const { utils } = require('./ejs/utils');
const { runtime, versionSlug, timestampVersion } = require('./runtime');
require('dotenv').config();

// Get template file path based on URI
function getTemplateFile(uri, viewsDir, theme = '') {
    const decodedUri = decodeUri(uri);
    const parts = removeQueryParams(decodedUri).replace(/\.html$/, '').split('/');
    // why sliced?
    // let fileName = parts.slice(1).join('/');
    let fileName = parts.join('/');
    if ('' === fileName) {
        fileName = 'index';
    }
    return path.join(viewsDir, theme, `${fileName}.ejs`);
}

function getLayoutFile(layout, theme, viewsDir) {
    return path.join(getViewsRoot(theme, viewsDir), `layouts/${layout}.ejs`);
}

function getViewsRoot(theme, viewsDir) {
    return path.join(viewsDir, theme, 'views');
}

function extractLang(uri, langs) {
    const lang = detectLang(uri, langs);
    // Check if the URI starts with the detected language followed by a slash or is exactly the language code
    const langPrefix = '/' + lang + '/';
    const startsWithLang = uri.startsWith(langPrefix) || uri === '/' + lang;
    // Slice the URI to remove the language part if it starts with the detected language
    const url = startsWithLang ? uri.slice(langPrefix.length - 1) : uri;
    return { url, lang };
}

async function loadUri(uri, dataDir) {
    const global = await loadAllData(dataDir, '_');
    const { lang, url } = extractLang(decodeUri(uri), global['langs']);
    let uriToLoad = uri;
    const words = uriToLoad.split('/');
    const files = [];
    for (let i = 1; i <= words.length; i++) {
        let file = path.join(dataDir, words.slice(0, i).join('/'));
        if (file.endsWith('.html')) {
            file = file.slice(0, file.length - '.html'.length) + '.yaml';
        } else {
            file = path.join(file, '_.yaml');
        }
        const data = await readData(file);
        if (false === data.data) {
            continue;
        }
        if (data.data['$extend']) {
            const extendFile = resolveDataFile(data.data['$extend'], dataDir);
            if (extendFile && fs.existsSync(extendFile)) {
                const extendData = await readData(extendFile);
                if (extendData.data) {
                    files.push({ file: extendFile, uri: resolveDataUri(extendFile), ...extendData.data });
                } else {
                    throw new Error(`Unable to read ${extendFile}`);
                }
            } else {
                throw new Error(`Extend file not found ${extendFile}`);
            }
        }
        let relUri = resolveDataUri(file, dataDir);
        if (relUri === '_.yaml') {
            relUri = 'index.html';
        }
        if (relUri.endsWith('/_.yaml')) {
            relUri = relUri.slice(0, relUri.length - '/_.yaml'.length) + '/index.html';
        }
        if (relUri.endsWith('.yaml')) {
            relUri = relUri.slice(0, relUri.length - '.yaml'.length) + '.html';
        }
        files.push({ file, uri: '/' + relUri, ...data });
    }
    return { lang, url, files, global };
}

const getViewsDir = (data) => data['$theme'] ? (data['$theme'] + '/views') : '';

const getThemeDir = (data, themesDir) => path.join(themesDir, getViewsDir(data));

async function prepareUri(uri, dataDir, viewsDir, forceData = {}, debugging = false) {
    uri               = decodeUri(uri);
    const global      = await loadAllData(dataDir, '_');
    const catalogFile = dataDir + '/_.yaml';
    let catalogData   = await loadCatalog(catalogFile, dataDir);
    let settings      = await loadSettings(dataDir);
    const lang        = detectLang(uri, global['langs']);
    const currentLang = getLang(lang, global['langs']) || {};
    currentLang.isDefault = isDefLang(lang, global['langs']);
    const defLang     = global['langs'] && global['langs'].length ? global.langs[0] : null;
    const dataFile    = getDataFile(uri, dataDir, currentLang.isDefault ? currentLang : null);
    let pageData      = await loadData(dataFile);

    let hierarcy = [catalogFile];

    if (pageData && pageData['$extend']) {
        const extendFile = resolveDataFile(pageData['$extend'], dataDir);
        if (extendFile && fs.existsSync(extendFile)) {
            const extend = await readData(extendFile);
            if (extend.data) {
                const after = Object.assign({}, pageData);
                delete after['$extend'];
                pageData = deepMerge(extend.data, after);
                hierarcy.push(extendFile);
            } else {
                throw new Error(`Unable to read ${extendFile}`);
            }
        } else {
            throw new Error(`Extend file not found ${extendFile}`);
        }
    }

    // load settings _.yaml for every sub directory
    let { data: catalogNested, files } = await loadCatalogsToTop(dataFile, dataDir, settings);
    catalogData = deepMerge(catalogData, catalogNested);
    hierarcy = [...hierarcy, ...files];

    let globalLang;
    let langCatalogData = {};
    if (!currentLang.isDefault) {
        // not a default language, load global of the current language
        const langDataFile = path.join(dataDir, lang, '_.yaml');
        globalLang = await loadAllData(path.join(dataDir, lang), '_', false, false, true);
        langCatalogData = await loadCatalog(langDataFile, dataDir);
        catalogData = deepMerge(catalogData, langCatalogData);

        // load settings _.yaml for every sub directory in language directory
        let { data: catalogNested, files } = await loadCatalogsToTop(dataFile, dataDir);
        catalogData = deepMerge(catalogData, catalogNested);
        hierarcy = [...hierarcy, ...files];
    }

    let data         = deepMerge(catalogData, pageData);
    data.env         = process.env;
    data.global      = JSON.parse(JSON.stringify(global));
    data.global      = deepMerge(global, globalLang);
    data['$lang']    = currentLang['code'] || defLang['code'] || null;
    hierarcy.push(dataFile);

    let parent = null;
    if (data['$parent'] || data['$catalog']) {
        const parentUri = '/' + (data['$parent'] || data['$catalog']);
        const parentFile = getDataFile(parentUri, dataDir, currentLang);
        parent = await loadData(parentFile, true);
        if (parent) parent.$uri = parentUri.slice(1).replace(/\/index$/, '/').replace(/\.html$/, '') + '.html';
    }

    data.$uri        = uri.replace(/\/index$/, '/');
    data.$uid        = data.$uri.slice(currentLang['code'].length + 2).replace(/\.html$/, '');
    data.$alternates = loadAlternates(data.$uri, dataDir, global.langs);
    data.query       = getQueryParams(uri);
    data.parent      = parent;
    data.all         = await loadAllCatalogs(path.join(dataDir, currentLang['dir'] || lang), settings, dataDir);

    data.categories = {};
    for (const key in data.all) {
        const items = data.all[key];
        const cats = items.filter(item => item['page'] && item['page']['category']).map(item => item.page.category);
        for (const cat of cats) {
            const arr = cat.split('/');
            for (let i = arr.length; i > 0; i--) {
                const uri = arr.slice(0, i).join('/');
                if ('undefined' !== typeof data.categories[uri]) continue;
                const file = getDataFile('/' + uri, dataDir, currentLang);
                if (fs.existsSync(file)) {
                    const doc = await loadData(file);
                    data.categories[uri] = doc && doc['category'];
                } else {
                    throw new Error(`Cannot load category file ${file}`);
                }
            }
        }
    }

    if (data['$loadAllFiles']) {
        const options = Object.assign({
            langs: data.global.langs,
            currentLang,
            defLang
        }, data['$loadAllFiles']);
        data['$allFiles'] = await loadAllFiles(options);
    }

    data.version = forceData['version'] || versionSlug || timestampVersion();
    if (!data['$refer'] && !currentLang.isDefault) {
        data['$refer'] = guessReferer(uri, defLang, dataDir);
    }
    if (data['$refer']) {
        const dataFileOrig = getDataFile(data['$refer'], dataDir, defLang);
        const origData = await loadData(dataFileOrig);
        data = deepMerge(origData, data);
        hierarcy.push(dataFileOrig);
        // handle the missing page data from the original data instead of the catalog.
        // Object.entries(origData).forEach(([k, v]) => {
        //     if ('undefined' === typeof pageData[k]) {
        //         data[k] = v;
        //     }
        // });
    }
    data.$currentLang = currentLang;
    data = deepMerge(forceData, data);
    data = Object.assign({}, ejsFunctions, { u: utils, l: utils.translate }, data);
    data.r = runtime;
    if (data['$rendering']) {
        runtime['$rendering'] = data['$rendering'];
    }
    let template = '';
    if (data['$layout']) {
        template = 'layouts/' + data['$layout'];
    }
    if (data['$redirect']) {
        template = 'layouts/redirect';
    }
    const theme = getViewsDir(data);
    const templateFile = getTemplateFile(template || uri, viewsDir, theme);
    let verbose = [];
    if (debugging) {
        const dir = path.dirname(__dirname);
        const info = getMemoryUsage();
        info.push(`${path.relative(dir, dataFile)} >> ${path.relative(dir, templateFile)}`);
        verbose.push(info.join(` ${NANO} `));
    }
    return { templateFile, data, files: hierarcy, verbose, themeDir: `${viewsDir}/${theme}` || viewsDir };
}

module.exports = {
    getLayoutFile,
    getViewsRoot,
    getTemplateFile,
    getThemeDir,
    loadUri,
    prepareUri,
};
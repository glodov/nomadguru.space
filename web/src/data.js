const fs = require('node:fs');
const path = require('node:path');
const yaml = require('yaml');
const { loadCSV } = require('./fs');
const { decodeUri, removeQueryParams } = require('./url');
const { cache, runtime } = require('./runtime');
const { utils } = require('./ejs/utils');

let alternatesOriginal;

// Get data file path based on URI
function getDataFile(uri, dataDir, defLang = null) {
    const decodedUri = decodeUri(uri).replace(/.html$/, '');
    const parts = decodedUri.split('/');
    let fileName = parts.slice(1).join('/');
    if ('' === fileName) {
        fileName = 'index';
    }
    if ('/' === fileName.slice(-1)) {
        fileName += 'index';
    }
    let dataFile = path.join(dataDir, fileName + ".yaml");
    if (null !== defLang && defLang['dir'] && !fs.existsSync(dataFile) && !fileName.startsWith(`${defLang.dir}/`)) {
        dataFile = path.join(dataDir, defLang.dir, fileName + ".yaml");
    }
    return dataFile;
}

// Load data from YAML file
async function loadData(dataFile, ignoreErrors = false) {
    if (cache['data'] && cache['data'][dataFile]) {
        return Array.isArray(cache['data'][dataFile]) ? cache['data'][dataFile].slice() : Object.assign({}, cache['data'][dataFile]);
    }
    if (!fs.existsSync(dataFile)) {
        if (ignoreErrors) return null;
        throw new Error(`Data file not found: ${dataFile}`);
    }

    const data = yaml.parse(fs.readFileSync(dataFile, 'utf8'));

    if (data) {
        await processImports(data, dataFile);
    }

    if (!cache['data']) cache['data'] = {};
    cache['data'][dataFile] = data;
    return data;
}

// Function to process import statements in YAML data
const processImports = async (data, relatedFile, processedFiles = new Set()) => {
    // @todo handle import() in cache engine templates:prepareUri() -> hierarcy.
    for (const key in data) {
        if (typeof data[key] === 'string') {
            const value = data[key];
            if (!(value.startsWith("import(") && value.endsWith(")"))) {
                continue;
            }
            const specs = value.substring(7, value.length - 1); // Extract between "import(" and ")"
            const parts = specs.split('|'); // split into [plugin, functions, file, ...atrs]
            let pluginName = null;
            let pluginFunc = null;
            let sourceFile = null;
            let args = [];
            if (parts.length > 2) {
                pluginName = parts[0].trim();
                pluginFunc = parts[1].trim();
                sourceFile = parts[2].trim();
                args = parts.slice(3);
            } else if (parts.length === 1) {
                sourceFile = parts[0].trim();
            } else {
                console.error(`Cannot read ${value} from ${relatedFile}`);
                continue;
            }
            if (sourceFile.startsWith('/')) {
                sourceFile = path.join(runtime['DATA_DIR'], sourceFile);
            }
            if (sourceFile.startsWith('.')) {
                const dir = path.dirname(relatedFile);
                sourceFile = path.join(dir, sourceFile);
            }
            if (pluginName && pluginFunc) {
                try {
                    // Dynamically require the plugin
                    const pluginPath = path.join(__dirname, pluginName); // Adjust the path as necessary
                    const plugin = require(pluginPath);
            
                    // Ensure that the function exists in the plugin
                    if (typeof plugin[pluginFunc] === 'function') {
                        // Call the function with arguments
                        data[key] = plugin[pluginFunc].apply(null, [sourceFile, ...args]);
                    } else {
                        console.error(`Function ${pluginFunc} not found in plugin ${pluginName}`);
                    }
                } catch (error) {
                    console.error(`Error requiring plugin ${pluginName}:`, error);
                }
            } else {
                data[key] = await readData(sourceFile, processedFiles);
            }
        }
    }
};

/**
 * Reads data from file.
 *
 * @param {string} file 
 * @param {Set} processedFiles
 * @returns { data: []|{}, related: [], errors: [] }
 *          data = Array | Object ; loaded data from YAML, CSV, JSON, 
 *          related = Array ; files of imported files to store in hash/changes chain.
 */
async function readData(file, processedFiles = new Set()) {
    if (processedFiles.has(file)) {
        return { data: false, related: [], errors: [['Infinite recursion detected: $1', file]] };
    }
    processedFiles.add(file);

    if (cache['readData'] && cache['readData'][file]) {
        return Array.isArray(cache['readData'][file]) 
               ? cache['readData'][file].slice() 
               : Object.assign({}, cache['readData'][file]);
    }

    const data = { data: false, related: [], errors: [] };
    if (!fs.existsSync(file)) {
        data.errors.push([`File does not exist: $1`, file]);
        return data;
    }
    if (file.endsWith('.yaml')) {
        data.data = yaml.parse(fs.readFileSync(file, 'utf-8'));
    } else if (file.endsWith('.json')) {
        data.data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } else if (file.endsWith('.csv')) {
        data.data = await loadCSV(file);
    }
    if (data.data) {
        await processImports(data.data, file, processedFiles);
    }

    if (!cache['readData']) cache['readData'] = {};
    cache['readData'][file] = data;
    return data;
}

async function loadAllData(dataPath, subdir = '_', asArray = false, fullKeys = false, softError = false) {
    // Use findAllDataFiles to recursively find all data files
    const cacheKey = `${dataPath}.${subdir}.${asArray ? 1 : 0}.${fullKeys ? 1 : 0}.${softError ? 1 : 0}`;
    if (cache['all'] && cache['all'][cacheKey]) {
        return Array.isArray(cache['all'][cacheKey]) ? cache['all'][cacheKey].slice() : Object.assign({}, cache['all'][cacheKey]);
    }
    const allFiles = findAllDataFiles(dataPath, subdir, softError);
    const data = asArray ? [] : {};

    for (const file of allFiles) {
        // Load data for each file
        const filePath = path.join(dataPath, file);
        const fileData = await loadData(filePath);

        if (asArray) {
            data.push(fileData);
        } else {
            let key;
            if (fullKeys) {
                key = path.relative(dataPath, file).slice(0, - path.extname(file).length).replace(/^\.+/, '');
            } else {
                key = path.basename(file, path.extname(file));
            }
            data[key] = fileData;
        }
    }
    if (!cache['data']) cache['data'] = {};
    cache['data'][cacheKey] = data;
    return data;
}
const isDefLang  = (lang, langs) => langs && langs.length && lang === langs[0].code;
const getDefLang = (langs) => langs && langs.length ? langs[0].code : null;
const getLang    = (lang, langs) => {
    const found = langs.filter(l => l.code === lang);
    if (found.length) return found[0];
    if (langs.length) return langs[0];
    return null;
};

function getAlternatesOriginal(dataPath, langs) {
    if (alternatesOriginal) return alternatesOriginal;
    let orig = {};
    const defLang = getDefLang(langs);
    langs.slice(1).forEach(async l => {
        const pages = await loadAllData(dataPath, l.code, false, true);
        Object.entries(pages).forEach(([u, p]) => {
            if (/[\\\/]{1,}_[\\\/]{1,}/.test(u)) return;
            const fullUri = `${u}.html`;
            if (!p || !p['$refer']) {
                if (l !== langs[0]) {
                    const referUri = u.replace(/^\/(\w{2})\/(.+)/, `/${defLang}/$2`);
                    const referFile = getDataFile(referUri, dataPath, defLang);
                    if (fs.existsSync(referFile)) {
                        if (!p) p = {};
                        p['$refer'] = referUri + '.html';
                    } else {
                        return;
                    }
                } else {
                    return;
                }
            }

            let dataFile = getDataFile(p['$refer'], dataPath);
            if (!fs.existsSync(dataFile)) {
                dataFile = getDataFile(`/${defLang}${p['$refer']}`, dataPath);
            }
            try {
                fs.statSync(dataFile);
            } catch (err) {
                throw `Reference $refer ${p['$refer']} not found in data: ${u}`;
            }
            if ('undefined' === typeof orig[p['$refer']]) orig[p['$refer']] = {};
            orig[p['$refer']][l.code] = fullUri;
        });
    });
    alternatesOriginal = orig;
    return alternatesOriginal;
}

function loadAlternates(uri, dataPath, langs) {
    const url = decodeUri(uri);
    if (!langs.length) return {};
    const mainLang = langs[0].code;
    let alts = {};
    const orig = getAlternatesOriginal(dataPath, langs);
    let stop = false;
    let found = false;
    Object.entries(orig).forEach(([origUri, alt]) => {
        if (stop) return;
        if (origUri === url) {
            alts = alt;
            found = true;
            return;
        }
        Object.entries(alt).forEach(([l, u]) => {
            if (stop) return;
            if (u === url) {
                alts[mainLang] = origUri;
                stop = true;
            }
        })
    });
    if (!found && alts[mainLang]) Object.entries(orig[alts[mainLang]]).forEach(([l, u]) => {
        if (u !== url) {
            alts[l] = u;
        }
    });

    return alts;
}

/**
 * Finds all data files in the dataPath + subdir, ignores ** / _.yaml
 * @param {*} dataPath 
 * @param {*} subdir 
 * @returns files in array.
 */
function findAllDataFiles(dataPath, subdir = '_', softError = false) {
    const cacheKey = `${dataPath}.${subdir}`;
    if (cache['allData'] && cache['allData'][cacheKey]) {
        return Array.isArray(cache['allData'][cacheKey]) ? cache['allData'][cacheKey].slice() : Object.assign({}, cache['allData'][cacheKey]);
    }
    const directory = path.join(dataPath, subdir);
    let allFiles = [];

    const processDirectory = (dir) => {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
                processDirectory(fullPath); // Recursively process subdirectories
            } else if (path.extname(file) && file.endsWith('.yaml')) {
                // Add file to array, relative to dataPath
                if (file !== '_.yaml') {
                    allFiles.push(path.relative(dataPath, fullPath));
                }
            }
        }
    };

    if (softError && !fs.existsSync(directory)) return allFiles;
    processDirectory(directory);
    if (!cache['allData']) {
        cache['allData'] = {};
    }
    cache['allData'][cacheKey] = allFiles;
    return allFiles;
}

async function loadCatalog(dataFile, dataDir) {
    const cacheKey = path.relative(dataDir, dataFile);
    if (cache['cat'] && cache['cat'][cacheKey]) {
        return Array.isArray(cache['cat'][cacheKey]) ? cache['cat'][cacheKey].slice() : Object.assign({}, cache['cat'][cacheKey]);
    }
    let catalogData = {};
    let currentDir = path.dirname(dataFile);
    let files = [];

    while (currentDir.startsWith(dataDir)) {
        const catalogFilePath = path.join(currentDir, '_.yaml');

        if (fs.existsSync(catalogFilePath)) {
            files.push(catalogFilePath);
        }

        // Check if we have reached the dataDir
        if (currentDir === dataDir) {
            break;
        }

        // Move up a directory level
        currentDir = path.dirname(currentDir);
    }
    for (let i = files.length - 1; i >= 0; i--) {
        const data = await loadData(files[i]);
        catalogData = Object.assign({}, catalogData, data);
    }

    if (!cache['cat']) {
        cache['cat'] = {};
    }
    cache['cat'][cacheKey] = catalogData;
    return catalogData;
}

async function loadAllCatalogs(dataPath, settings = null, dataDir = null) {
    if (cache['allCats'] && cache['allCats'][dataPath]) {
        return Array.isArray(cache['allCats'][dataPath]) ? cache['allCats'][dataPath].slice() : Object.assign({}, cache['allCats'][dataPath]);
    }
    let catalogs = {};

    // Get all first-level directories
    const topLevelDirs = fs.readdirSync(dataPath).filter(file => {
        const fullPath = path.join(dataPath, file);
        return fs.statSync(fullPath).isDirectory() && !file.startsWith('_');
    });

    // Process each directory
    for (const dir of topLevelDirs) {
        const allFiles = findAllDataFiles(dataPath, dir);
        const dirData = [];
        for (const file of allFiles) {
            const filePath     = path.join(dataPath, file);
            const data         = await loadData(filePath);
            const rel          = path.relative(dataDir, filePath);
            const dirs         = getSettingsDirs(rel);
            const settingsData = await loadSettingsIntoData(dataDir, dirs, settings);

            const fileData     = deepMerge(settingsData.data, data);
            const fileBaseName = path.basename(file, path.extname(file));
            const $filePath    = path.relative(dataPath, filePath);

            // Extend the data with file properties
            const item = {
                ...fileData,
                $filePath,
                $fileName: fileBaseName,
                $uri: $filePath.replace(/\.yaml$/, '.html').replaceAll('\\', '/')
            };
            dirData.push(item);
        }

        // Assign the array of file data to the respective catalog key
        catalogs[dir] = dirData;
    }
    if (!cache['allCats']) {
        cache['allCats'] = {};
    }
    cache['allCats'][dataPath] = catalogs;
    return catalogs;
}

function getSettingsDirs(relativePath) {
    const rel = relativePath.endsWith('.yaml') ? relativePath.slice(0, -5) : relativePath;
    const words = rel.split('/');
    const dirs = words.reduce((acc, word) => {
        const arr = [];
        if (acc.length && acc[acc.length - 1] !== '.') arr.push(acc[acc.length - 1]);
        arr.push(word);
        acc.push(arr.join('/'));
        return acc;
    }, []);
    dirs.unshift('.');
    return dirs;
}

async function loadSettingsIntoData(topDir, dirs, settings = null) {
    const loaded = [];
    let catalogNested = {};
    for (const dir of dirs) {
        let data;
        if (settings && settings[dir]) {
            data = settings[dir];
        } else {
            const file = path.join(topDir, dir, '_.yaml');
            if (fs.existsSync(file)) {
                data = await loadData(file);
            }
        }
        if (!data) continue;
        catalogNested = deepMerge(catalogNested, data);
        loaded.push(dir + '/_.yaml');
    }
    return { data: catalogNested, loaded };
}

async function loadCatalogsToTop(dataFile, topDir, settings = null) {
    const rel = path.relative(topDir, dataFile).slice(0, -5);
    const cacheKey = rel;
    if (cache['catsToTop'] && cache['catsToTop'][cacheKey]) {
        return cache['catsToTop'][cacheKey];
    }
    const dirs = getSettingsDirs(rel);
    const { data, loaded } = await loadSettingsIntoData(topDir, dirs, settings);
    if (!cache['catsToTop']) {
        cache['catsToTop'] = {};
    }
    const finalData = Array.isArray(data) ? data.slice() : Object.assign({}, data);
    cache['catsToTop'][cacheKey] = { data: finalData, files: loaded };
    return cache['catsToTop'][cacheKey];
}

function guessReferer(uri, defLang, dataDir) {
    const referUri = uri.replace(/^\/(\w{2})\/(.+)/, `/${defLang.code}/$2`);
    const referFile = getDataFile(referUri, dataDir, defLang);
    return fs.existsSync(referFile) ? referUri : null;
}

async function loadAllFiles(options) {
    const ignorePatterns = options?.['ignore'] || [];
    const from = options?.['from'] || [path.join(runtime.DATA_DIR, 'uk')];
    const defLang = options?.['defLang'];
    const langs = options?.['langs'];
    const currentLang = options?.['currentLang'];
    let allFiles = [];
    for (const source of from) {
        let files = findAllDataFiles(source, '');
        files = files.filter(file => {
            const test_file = file.replaceAll('\\', '/');
            let ignoreList = [];
            if (Array.isArray(ignorePatterns)) {
                ignoreList = ignorePatterns;
            } else if (ignorePatterns['from'] && ignorePatterns['from'].includes(source)) {
                ignoreList = ignorePatterns['list'];
            }
            for (const pattern of ignoreList) {
                if (test_file.includes(pattern)) return false;
            }
            return true;
        }).map(item => source + "/" + item.replace('.yaml', '').replace(/\\/g, '/')).sort();
        allFiles = [...allFiles, ...files];
    }

    // Load all files only when this option is enabled.
    result = {};
    for (let file of allFiles) {
        file = path.relative(runtime['ROOT_DIR'], file);
        let uri, dataFile;
        if (file.startsWith('data/uk/')) {
            file = file.replace('data/uk/', '');
            uri = '/' + currentLang.code + '/' + file + '.html';
            dataFile = getDataFile(uri, runtime.DATA_DIR, currentLang.isDefault ? currentLang : null);
        }
        if (file.startsWith('public/')) {
            file = file.replace('public/', '');
            dataFile = path.join(runtime.STATIC_DIR, file + '.yaml');
        }
        const alternates = {};
        langs.forEach(lang => {
            if (lang.code === defLang.code) return;
            if (uri) {
                const possibleUrl = guessReferer(uri, lang, runtime.DATA_DIR);
                if (possibleUrl) alternates[lang.code] = possibleUrl;
            }
        });
        result[file] = await loadData(dataFile, true);
        if (result[file] && result[file]['$extend']) {
            const extendFile = resolveDataFile(result[file]['$extend'], runtime.DATA_DIR);
            if (extendFile && fs.existsSync(extendFile)) {
                const extendData = await readData(extendFile);
                if (extendData.data) {
                    result[file] = deepMerge(extendData.data, result[file]);
                    delete result[file]['$extend'];
                }
            }
        }
        if (uri && result[file]) {
            result[file].$uri = uri.replaceAll('\\', '/');
            result[file].$alternates = loadAlternates(uri, runtime.DATA_DIR, langs);
        }
    }
    return result;
}

async function loadSettings(dataDir, softError = false) {
    const cacheKey = dataDir;
    if (cache['dataSettings'] && cache['dataSettings'][cacheKey]) {
        return Array.isArray(cache['dataSettings'][cacheKey]) ? cache['dataSettings'][cacheKey].slice() : Object.assign({}, cache['dataSettings'][cacheKey]);
    }
    let settings = {};

    const processDirectory = async (dir) => {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
                await processDirectory(fullPath); // Recursively process subdirectories
            } else if (file === '_.yaml') {
                let rel = path.relative(dataDir, dir) || '.';
                settings[rel] = await loadData(path.resolve(dir, file));
            }
        }
    };

    if (softError && !fs.existsSync(dataDir)) return settings;
    await processDirectory(dataDir);
    if (!cache['dataSettings']) {
        cache['dataSettings'] = {};
    }
    cache['dataSettings'][cacheKey] = settings;
    return settings;
}

function deepMerge(target, source) {
    // Create a deep copy of the target
    let newTarget = JSON.parse(JSON.stringify(target));

    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (source[key] && typeof source[key] === 'object') {
                if (Array.isArray(source[key])) {
                    // Replace with a copy of the array
                    newTarget[key] = source[key].slice();
                } else {
                    // Perform a deep merge on a copy of the object
                    newTarget[key] = newTarget[key] || {};
                    newTarget[key] = deepMerge(newTarget[key], source[key]);
                }
            } else {
                newTarget[key] = source[key];
            }
        }
    }
    return newTarget;
}

function detectLang(uri, langs = []) {
    let lang;
    const slugs = uri.split('/');
    const candidate = slugs[0] === '' ? slugs[1] : slugs[0];
    if (candidate && langs && langs.map(l => l.code).indexOf(candidate) > -1) {
        lang = candidate;
    }
    if (!lang && langs && langs.length) {
        lang = langs[0].code; // the first language is the default one
    }
    return lang;
}

function resolveDataFile(uri, dataDir) {
    return path.join(dataDir, uri) + '.yaml';
}

function resolveDataUri(file, dataDir) {
    return path.relative(dataDir, file).replaceAll('\\', '/');
}

function extractOnly(data, onlyFields = []) {
    const result = {};
    for (const f of onlyFields) {
        if ('undefined' !== typeof data[f]) result[f] = data[f];
    }
    return result;
}

module.exports = {
    removeQueryParams,
    getDataFile,
    loadCatalog,
    readData,
    loadData,
    loadAllData,
    loadAllCatalogs,
    loadCatalogsToTop,
    loadAlternates,
    loadAllFiles,
    loadSettings,
    deepMerge,
    detectLang,
    isDefLang,
    getLang,
    findAllDataFiles,
    guessReferer,
    resolveDataFile,
    resolveDataUri,
    extractOnly
};

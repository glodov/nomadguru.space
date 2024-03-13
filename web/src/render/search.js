const fs = require('node:fs');
const path = require('node:path');
const { ensureDirectory, calculateFileHash } = require('../fs');
const { GREEN, RED, OK, FAIL, RESET } = require('../cli');

function writeSearch(search, searchDir) {
    let text = {};
    let missing = {};

    search.forEach(row => {
        const lang = row['lang'] || '';
        const entity = row['index'] || {};
        const title = entity['title'] || "";
        const body = (entity['text'] || "").replace(title, '');
        if (!text[lang]) {
            text[lang] = '';
        }
        if (!missing[lang]) {
            missing[lang] = { titles: [], descs: [] };
        }
        text[lang] += JSON.stringify(entity['uri']) + "\n";
        text[lang] += JSON.stringify(title) + "\n";
        text[lang] += JSON.stringify(entity['desc']) + "\n";
        text[lang] += JSON.stringify(entity['ogImage'] || entity['image'] || "") + "\n";
        text[lang] += JSON.stringify(body) + "\n\n";
        if ('string' !== typeof title) {
            throw new Error(`Incorrect search index data { title } at ${entity.uri}`);
        }
        if ('string' !== typeof body) {
            throw new Error(`Incorrect search index data { body } at ${entity.uri}`);
        }
        if ('string' !== typeof entity.uri) {
            throw new Error(`Incorrect search index data { entity.uri } at ${entity.uri}`);
        }
        if ('string' !== typeof entity.desc) {
            throw new Error(`Incorrect search index data { entity.desc } at ${entity.uri}`);
        }
        if ('string' !== typeof entity['ogImage'] && 'string' !== typeof entity['image']) {
            throw new Error(`Incorrect search index data { entity.image } at ${entity.uri}`);
        }
        if (!entity.title) missing[lang].titles.push(entity.uri);
        if (!entity.desc) missing[lang].descs.push(entity.uri);
    });
    const files = [];
    Object.entries(text).forEach(([lang, data]) => {
        if (!lang) return;
        const file = path.join(searchDir, `${lang}.txt`);
        ensureDirectory(path.dirname(file));
        fs.writeFileSync(file, data);
        const fileJson = path.join(searchDir, `${lang}.json`);
        const version = calculateFileHash(file);
        fs.writeFileSync(fileJson, JSON.stringify({ version }));
        files.push({ lang, size: fs.statSync(file)['size'] || 0, version, missing: missing[lang] });
    })
    return files;
}

function printSearchLog(index) {
    const { size, lang, version, missing } = index;
    if (size > 0) {
        console.log(GREEN, OK, RESET, `search/${lang}.txt ${(size / 1000).toFixed(1)}Kb. @${version}`);
    } else {
        console.log(RED, FAIL, RESET, 'could not generate search.txt');
    }
    if (missing.titles.length) {
        console.log(RED, FAIL, RESET, missing.titles.length, 'missing titles');
        // missing.titles.forEach(uri => console.log(`    ${uri}`));
    } else {
        console.log(GREEN, OK, RESET, 'All page titles are set');
    }
    if (missing.descs.length) {
        console.log(RED, FAIL, RESET, missing.descs.length, 'missing descriptions');
        // missing.descs.forEach(uri => console.log(`    ${uri}`));
    } else {
        console.log(GREEN, OK, RESET, 'All page descriptions are set');
    }
}

module.exports = {
    printSearchLog,
    writeSearch,
};
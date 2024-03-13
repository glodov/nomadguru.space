const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const { prepareUri, renderSearch } = require('./template');
const { ensureDirectory } = require('./fs');
const minify = require('html-minifier').minify;
const renderTemplate = require('./render/item/template');

async function renderFile(file, uris = [], links = [], errors = [], search = [], version = null, DATA_DIR = '.', VIEWS_DIR = '.') {
    const uri = file.replace(DATA_DIR, '').replace('.yaml', '.html').replace('\\', '/');
    uris.push(uri);
    try {
        const force = { $rendering: true, version };
        const { templateFile, data } = await prepareUri(uri, DATA_DIR, VIEWS_DIR, force);
        const html = await renderTemplate(templateFile, data, VIEWS_DIR);
        const index = await renderSearch(data);
        if (false !== index) search.push(index);
        const removedBase = html.replace(/<base href="[^"]+">/ig, '');
        links.push({
            uri,
            links: [...removedBase.matchAll(/href="\/[^"]+(\.html|\/)"/g)].map(match => match[0].slice(6, -1))
        });
        const minifiedHtml = minify(html, {
            removeAttributeQuotes: true,
            collapseWhitespace: true,
            removeComments: true,
            minifyJS: true,
            minifyCSS: true
        });
        const outputFilePath = path.join(DIST_DIR, uri);
        ensureDirectory(path.dirname(outputFilePath));
        fs.writeFileSync(outputFilePath, minifiedHtml);
    } catch (err) {
        errors.push({ text: 'Error rendering file', file: path.relative(DATA_DIR, file), err });
    }
    return 
}

renderFile(
    workerData.file,
    workerData.uris,
    workerData.links,
    workerData.errors,
    workerData.search,
    workerData.version,
    workerData.DATA_DIR,
    workerData.VIEWS_DIR
).then(result => {
    parentPort.postMessage(result);
});

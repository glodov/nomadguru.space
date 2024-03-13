const fs = require('node:fs');
const { join, relative } = require('node:path');
const { nwViewFile } = require('../render/vars');
const { runtime } = require('../runtime');
const { findAllFiles } = require('../fs');

const templates = {};

function loadView(viewName) {
    const viewFile = nwViewFile.to(viewName);
    if (!(templates[viewName] 
        && templates[viewName].mtimeMs >= fs.statSync(viewFile)['mtimeMs']))
    {
        templates[viewName] = {
            mtimeMs: fs.statSync(viewFile)['mtimeMs'],
            view: fs.readFileSync(viewFile, { encoding: 'utf-8' })
        };
    }
    return templates[viewName].view;
}

function loadViews() {
    const dir = join(runtime['NWE_DIR'], 'views');
    const files = findAllFiles(dir, /\.(ejs|html)$/);
    const result = [];
    for (const file of files) {
        const uri = relative(dir, file);
        result.push({ uri, view: loadView(uri) });
    }
    return result;
}

/**
 * @depend
 */
function editor(uri, moduleUri, data = {}, args = {}) {
    const optimizedData = Object.assign({}, data);
    if (optimizedData['all']) {
        delete optimizedData['all'];
    }
    const result = { data: optimizedData, uri, moduleUri };
    const viewName = args.url.searchParams.get('view');
    if (viewName) {
        result.view = loadView(viewName, data, args);
    } else {
        result.views = loadViews(data, args);
    }
    return result;
}

module.exports = {
    cronjob: false,
    editor
};
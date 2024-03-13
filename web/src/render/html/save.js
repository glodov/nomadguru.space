const fs = require('node:fs');
const { dirname } = require('node:path');
const { ensureDirectory } = require('../../fs');
const { saveMeta, getHtmlFile } = require('./_/meta');

function save(args, mods) {
    const { file } = args;
    if (mods['html']?.['cached']) return args;
    const meta = mods['html']['meta'];
    const html = mods['html']['out'];
    const htmlFile = getHtmlFile(file);
    ensureDirectory(dirname(htmlFile));
    fs.writeFileSync(htmlFile, html);
    const { ctimeMs } = fs.statSync(htmlFile);
    meta.html.ctimeMs = ctimeMs;
    saveMeta(file, meta);
    args.htmlFile = htmlFile;
    return args;
}

module.exports = save;
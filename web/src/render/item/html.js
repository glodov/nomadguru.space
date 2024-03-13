const ejs = require('ejs');
const fs = require('node:fs');
const { runtime } = require('../../runtime');
const { getLayoutFile, getViewsRoot } = require('../../template');
const { isFileUpdated, makeMeta, getHtmlFile } = require('../html/_/meta');
const { extractCategories } = require('../core');

function readHTML(file) {
    const htmlFile = getHtmlFile(file);
    if (!fs.existsSync(htmlFile)) return false;
    return fs.readFileSync(htmlFile, { encoding: 'utf-8' });
}

function checkCatalogs(data, cats, extraDeps) {
    let uid = data['page']?.['category'] || data['$uid'];
    const categories = extractCategories(uid);
    categories.push(uid);
    for (const cat of categories) {
        const uri = `${data['$lang']}/${cat}.yaml`;
        if (cats[cat] && !extraDeps.includes(uri)) extraDeps.push(uri);
    }
    return extraDeps;
}

async function renderHTML(args) {
    const { data, cats, deps, extraDeps, file, filesIndex, filesLen, skipCache, addon } = args;
    if (data['$rendering']) {
        const { is, now } = isFileUpdated(deps, file);
        if (!is && !skipCache) return { key: 'html', out: readHTML(file), meta: now, cached: true };
        checkCatalogs(data, cats[data['$lang']] || {}, extraDeps);
    }
    const theme = data['$theme'] || '';
    const layout = data['$layout'] || data['$uri'];
    const templateFile = getLayoutFile(layout, theme, runtime['VIEWS_DIR']);
    if (!fs.existsSync(templateFile)) {
        throw new Error(`Template file not found: ${templateFile}`);
    }
    const options = { root: getViewsRoot(theme, runtime['VIEWS_DIR']) };
    const renderer = runtime['ejs'] || ejs;
    const html = await renderer.renderFile(templateFile, Object.assign({}, data, addon), options);
    let meta = null;
    if (data['$rendering']) {
        meta = makeMeta(deps, file);
    }
    return { key: 'html', out: html, meta, extraDeps, templateFile, cached: false };
}

module.exports = renderHTML;
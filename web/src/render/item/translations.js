const path = require('node:path');
const { saveJSON } = require('../../fs');
const { runtime } = require('../../runtime');

const langs = [];
async function renderTranslations(args) {
    const { data } = args;
    const lang = data['$lang'];
    if (langs.includes(lang)) return args;

    const languageFile = path.join(runtime['STATIC_DIR'], `translation.${lang}.json`);
    saveJSON(languageFile, data['$l'] || {});
    langs.push(lang);
    return { key: 'sitemapXML', out: languageFile };
}

module.exports = renderTranslations;
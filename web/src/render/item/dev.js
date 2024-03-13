const { loadAllFiles } = require('../../data');

async function renderDev(args) {
    const { data, all, file, filesIndex, filesLen } = args;
    if (!data['$render']?.['$allFiles']) return { key: 'dev', out: null };

    const options = Object.assign({
        langs: data['global']?.['langs'],
        currentLang: data['$currentLang'],
        defLang: data['global']?.['langs'][0]
    }, data['$render']['$allFiles']);
    data['$allFiles'] = await loadAllFiles(options);
    return { key: 'dev', out: data['$allFiles'] };
}

module.exports = renderDev;

const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { runtime } = require('../../runtime');

function robotsTXT(args) {
    const { data, file, filesIndex, filesLen } = args;
    let out = null;
    if (filesIndex === filesLen - 1) {
        const rows = [
            'User-agent: *',
            'Allow: /images/about/mayno_na_prodazh',
            'Disallow: /images/about/',
            'Disallow: /images/corp-management',
            'Disallow: /images/fin-reports',
            'Disallow: /images/terms-and-conditions/',
            `Sitemap: ${runtime['HOST']}/sitemap.xml`,
        ];
        out = {
            file: join(runtime['STATIC_DIR'], 'robots.txt'),
            text: rows.join("\n")
        };
        writeFileSync(out.file, out.text);
    }
    return { key: 'robotsTXT', out };
}

module.exports = robotsTXT;
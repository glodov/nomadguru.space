const fs = require('node:fs');
const path = require('node:path');
const { start, commit, write, count, read } = require('./_/store');
const { runtime } = require('../../runtime');
const { loadTXT } = require('../../fs');

function urlNotFound(url) {
    let file = path.join(runtime['NANO_DIR'], url.slice(1));
    file = file.endsWith('.html') ? file.slice(0, file.length - '.html'.length) + '.json' : file;
    return !fs.existsSync(file);
}

function assetNotFound(url) {
    const file = path.join(runtime['STATIC_DIR'], url.slice(1));
    return !fs.existsSync(file);
}

function extractLinksAndPhones(args, mods) {
    const { filesIndex, filesLen } = args;
    if (mods['html']?.['cached']) return args;
    if (filesLen && !filesIndex) start(['phones', 'links', 'assets', 'broken']);
    if (!args.broken) {
        const txtFile = path.join(runtime['DATA_DIR'], 'legacy/broken.txt');
        try {
            args.broken = loadTXT(txtFile) || [];
        } catch {
            args.broken = [];
        }
    }
    const html = mods['html']['out'];
    const matches = html.match(/<base href="([^"]+)">/i);
    let baseUri = '/';
    if (matches) baseUri = matches[1];

    let links = [...html.matchAll(/href="([^"]+)"/g)].filter(matches => {
        const link = matches[1];
        if (link === baseUri) return false;
        if (args.broken.includes(link)) return false;
        if (link.startsWith('tel:')) {
            write('phones', link.substring(4));
            return false;
        }
        if (link.startsWith('viber://')) {
            write('phones', link);
            return false;
        }
        if (link.startsWith('skype:')) {
            write('phones', link);
            return false;
        }
        return !(link.startsWith('http://') || link.startsWith('https://'));
    }).map(match => match[1].startsWith('/') ? match[1] : `${baseUri}${match[1]}`);
    
    const assets = [...html.matchAll(/src="([^"]+)"/g)].filter(matches => {
        return matches[1].startsWith('/');
    }).map(match => match[1].split('?')[0].split('#')[0].split('&')[0]).filter(link => !args.broken.includes(link));

    links = links.filter(l => {
        for (const d of runtime['STATIC_ALLOWED']) {
            if (l.startsWith(d)) {
                assets.push(l);
                return false;
            }
        }
        return true;
    }).map(l => l.split('?')[0].split('#')[0]);
    write('links', links);
    write('assets', assets);

    if (filesIndex === filesLen -1) {
        commit(['phones', 'links', 'assets']);
        args.phonesCount = count('phones');
        args.linksCount = count('links');
        args.assetsCount = count('assets');
        args.brokenLinks = [];
        args.brokenAssets = [];
        for (const url of read('links')) {
            if (urlNotFound(url)) {
                write('broken', url);
                args.brokenLinks.push(url);
            }
        }
        for (const url of read('assets')) {
            if (assetNotFound(url)) {
                write('broken', url);
                args.brokenAssets.push(url);
            }
        }
    }
    return args;
}

module.exports = extractLinksAndPhones;
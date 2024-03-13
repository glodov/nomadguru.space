const fs = require('node:fs');
const path = require('node:path');
const { runtime } = require('../../runtime');
const { detectLang } = require('../../data');
const { thumbSrc } = require('../../ejs/functions');
const { ensureDirectory } = require('../../fs');

const blockRowsLimit     = runtime['SEARCH_BLOCK_ROWS'] || 0;
const blockSizeLimit     = runtime['SEARCH_BLOCK_SIZE'] || 0;
const searchIndexGallery = runtime['SEARCH_INDEX_GALLERY'] || null;
const searchIndexDivider = runtime['SEARCH_INDEX_DIVIDER'] || "\n\n";
const searchImageKeys    = runtime['SEARCH_IMAGE_KEYS'] || ['ogImage', 'image', 'thumb'];
const SEARCH_INDEX_CATS  = runtime['SEARCH_INDEX_CATS'] || [];
const SEARCH_DIR         = path.join(runtime['STATIC_DIR'], 'search');
/**
 * @schema { file: { fp, rows: [int], size: [int], block: int } }
 */
const fps = {};

function close() {
    Object.keys(fps).forEach(file => {
        fs.closeSync(fps[file].fp);
        delete fps[file];
    });
}

function fromNano(nano, divider = ' ') {
    if (!nano) return '';
    const result = [];
    if (typeof nano === 'string') {
        result.push(nano);
    } else if (Array.isArray(nano)) {
        nano.forEach(element => result.push(fromNano(element, divider)));
    } else if (typeof nano === 'object') {
        Object.keys(nano).forEach(key => {
            if (!key.startsWith('$')) {
                result.push(fromNano(nano[key], divider));
            }
        });
    }
    return result.join(divider);
}

function extractDesc(text) {
    if (text.length <= 160) return text;
    let end = text.substring(0, 160).lastIndexOf(' ');
    if (end === -1) return text.substring(0, 160);
    return text.substring(0, end) + '..';
}

function extract(item) {
    let image = '';
    for (const key of searchImageKeys) {
        if (item[key]) {
            image = searchIndexGallery ? thumbSrc(item[key], searchIndexGallery) : item[key];
            break;
        }
    }
    const text = [
        fromNano(item['page']?.['content']),
        fromNano(item['page']?.['excerpt']),
    ].join(' ');
    let desc = item['desc'] || '';
    if (item['$extractDesc'] && '' === desc) {
        desc = extractDesc(item);
    }
    const date = item['page']?.['date'] || '';
    const json = {
        '$': item['$uri'],
        't': item['title'],
    };
    if (image) json['i'] = image;
    if (desc) json['d'] = desc;
    if (text) json['c'] = text;
    if (date) json['a'] = date;
    return JSON.stringify(json);
}

function extractPost(data) {
    let image = '';
    for (const key of searchImageKeys) {
        if (data[key]) {
            if (data['gallery']) {
                image = thumbSrc(data[key], data['gallery']);
                break;
            }
            if (searchIndexGallery) {
                image = thumbSrc(data[key], searchIndexGallery);
                break;
            }
            image = data[key];
            break;
        }
    }
    return JSON.stringify({
        '$uri': data['$uri'],
        'title': data['title'],
        'image': image,
        'date': data['page']?.['date'] || '',
        'cats': data['cats'] || [],
        'tags': data['tags'] || [],
    });
}

function blockFile(file, block = 0) {
    if (!block) return file;
    return file.replace(/\.txt$/, `-${block}.txt`);
}

function saveMeta() {
    // write index in /public/search/index.json
    const meta = {};
    for (const file in fps) {
        const rows = fps[file].rows;
        const size = fps[file].size;
        const fileUri = path.relative(runtime['STATIC_DIR'], file);
        meta[fileUri] = [];
        for (const i in rows) {
            meta[fileUri].push({
                block: path.relative(runtime['STATIC_DIR'], blockFile(file, i)),
                rows: rows[i],
                size: size[i]
            });
        }
    }
    const file = path.join(SEARCH_DIR, 'index.json');
    fs.writeFileSync(file, JSON.stringify(meta));
}

function openFileIfNeeded(file) {
    ensureDirectory(path.dirname(file));
    if (typeof fps[file] === 'undefined') {
        const fp = fs.openSync(blockFile(file), 'w'); // Open file
        fps[file] = { fp, rows: [0], size: [0], block: 0 };
    }
    return fps[file];
}

function extractIntoFile(index, info, file) {
    const size = Buffer.byteLength(index, 'utf8');
    const overLong = blockRowsLimit > 0 && info.rows[info.block] === blockRowsLimit;
    const overSize = blockSizeLimit > 0 && size + info.size[info.block] > blockSizeLimit;
    if (overLong || overSize) {
        fs.closeSync(info.fp);
        info.block++;
        const fp = fs.openSync(blockFile(file, info.block), 'w');
        info.fp = fp;
        info.rows[info.block] = 0;
        info.size[info.block] = 0;
    }
    fs.writeSync(info.fp, index + searchIndexDivider); // Append newline for each entry
    info.rows[info.block]++;
    info.size[info.block] += size;
}

function decodeFilesInfo() {
    const files = {};
    for (const f in fps) {
        files[f] = Object.assign({}, fps[f]);
        delete files[f].fp;
    }
    return files;
}

function extractEvery(data, file) {
    const info = openFileIfNeeded(file);
    const index = extract(data);
    extractIntoFile(index, info, file);
    return index;
}

function extractCatalog(data, lang) {
    const uri = data['page']?.['category'];
    if (!uri) return false;
    const url = `${lang}/${uri}.txt`;
    if (!SEARCH_INDEX_CATS.includes(url)) return false;
    const file = path.join(SEARCH_DIR, url);
    const info = openFileIfNeeded(file);
    const index = extractPost(data);
    extractIntoFile(index, info, file);
    return true;
}

function search(args) {
    const { data, filesIndex, filesLen } = args;
    const lang = detectLang(data['$uri'], data['global']?.['langs']);
    const file = path.join(SEARCH_DIR, `${lang}.txt`);
    // write index in /public/search/{lang}.txt
    const index = extractEvery(data, file);
    // write catalog index in /public/search/{lang}.txt
    extractCatalog(data, lang);

    if (filesLen - 1 === filesIndex) {
        saveMeta();
        close(); // Close all file descriptors
    }
    // image is required for gallery
    const rows = index.split("\n");
    const image = rows[2] ? JSON.parse(rows[2]) : '';
    const files = decodeFilesInfo();
    return { key: 'search', out: { index, files, image } };
}

module.exports = search;
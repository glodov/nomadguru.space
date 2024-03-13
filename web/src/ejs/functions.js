const path = require('node:path');
const moment = require('moment');
const momentDurationFormatSetup = require("moment-duration-format");
const { runtime } = require('../runtime');
const { findAllFiles } = require('../fs');

momentDurationFormatSetup(moment);

const CLOSED_TAGS = ['img', 'hr', 'br', 'input', 'link', 'meta', 'area', 'base', 'col', 'command', 'embed', 'keygen', 'param', 'source', 'track', 'wbr'];
const DEFAULT_ATTR = {
    'img': '$src',
    'iframe': '$src',
    'link': '$href',
};
const DEFINED_TAGS = [
    { child: 'span', tags: [
                        'span', 'small', 'em', 'u', 's', 'a', 'b', 'strong', 
                        'i', 'li', 'p', 'cite', 'h1', 'h2', 'h3', 'h4', 'h5', 
                        'td', 'text'
                    ] },
    { child: 'p', tags: ['blockquote', 'address'] },
    { child: 'article', tags: ['section'] },
    { child: 'li', tags: ['ol', 'ul'] },
    { child: 'img', tags: ['figure'] },
    { child: 'div', tags: ['article', 'div', 'form', 'content', 'header', 'footer', 'main', 'nav'] },
    { child: 'td', tags: ['tr'] },
    { child: 'tr', tags: ['tbody', 'thead'] },
    { child: 'tbody', tags: ['table'] },
    { child: 'span', tags: ['button', 'label'] },
    { child: 'source', tags: ['picture', 'video', 'audio']},
    { child: '', tags: ['code', 'iframe'] },
    { child: '', tags: ['nwclone'] },
    { child: false, tags: CLOSED_TAGS },
];
const THEME_TAGS = {};
function getThemeTags(theme) {
    if (!THEME_TAGS[theme]) {
        const tagsDir = path.join(runtime['THEMES_DIR'] || runtime['VIEWS_DIR'], theme, 'views/tags');
        const tags = {};
        for (const file of findAllFiles(tagsDir, /\.js$/)) {
            const tag = path.basename(file, '.js');
            tags[tag] = require(file);
        }
        THEME_TAGS[theme] = tags;
    }
    return THEME_TAGS[theme];
}
/**
 * Renders content for EJS based on a structured data object.
 * @param {Mixed} content - Any type of the content.
 * @returns {String} - HTML string representation of the content.
 */
function renderEJSContent(content, nextTag = null, searchOnly = false) {
    let html = '';
    if (runtime['$rendering'] && 'object' === typeof content && content && content['$public']) {
        return renderEJSContent(content['$public'], nextTag, searchOnly);
    }

    if (['string', 'number', 'bigint', 'boolean'].includes(typeof content)) {
        if (searchOnly) {
            html += content + "\n";
        } else if (nextTag) {
            if (CLOSED_TAGS.includes(nextTag)) {
                const attrs = {};
                if (DEFAULT_ATTR[nextTag]) attrs[DEFAULT_ATTR[nextTag]] = content;
                html += `<${nextTag}${getAttributes(attrs)}>`;
            } else {
                html += `<${nextTag}>${escapeHtml(content, ['&'])}</${nextTag}>`;
            }
        } else {
            html += escapeHtml(content, ['&']);
        }
    } else if ('object' === typeof content) {
        if (Array.isArray(content)) {
            content.forEach(item => html += renderEJSContent(item, nextTag, searchOnly));
        } else if (content instanceof Buffer) {
            html += content.toString();
        } else if (content) {
            let found = false;
            let child = '';
            if (runtime['$theme']) {
                const themeTags = getThemeTags(runtime['$theme'])
                for (const tag in themeTags) {
                    if ('undefined' !== typeof content[tag]) {
                        const converted = themeTags[tag].apply(this, [content]);
                        return renderEJSContent(converted, nextTag, searchOnly);
                    }
                }
            }
            for (const rule of DEFINED_TAGS) {
                for (const tag of rule.tags) {
                    if (content[tag] || '' === content[tag]) {
                        nextTag = rule.child;
                        content['$tag'] = content['$tag'] || tag;
                        child = content[tag];
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
            const tag = content['$tag'] || nextTag;
            const attrs = Object.assign({}, content);
            if (DEFAULT_ATTR[tag] && 'boolean' !== typeof content[tag] && content[tag]) {
                attrs[DEFAULT_ATTR[tag]] = content[tag];
            }
            if (CLOSED_TAGS.includes(tag)) {
                if (searchOnly) {
                    html += (content['$alt'] || content['$title'] || '') + "\n";
                } else {
                    html += `<${tag}${getAttributes(attrs)}>`;
                }
            } else {
                if (searchOnly) {
                    html += (content['$alt'] || content['$title'] || '') + "\n";
                    html += renderEJSContent(child, nextTag || tag, searchOnly);
                } else {
                    let childTag = nextTag
                    if (!childTag && '' !== childTag) childTag = tag;
                    html += `<${tag}${getAttributes(attrs)}>${renderEJSContent(child, childTag, searchOnly)}</${tag}>`;
                }
            }
        }
    }

    return html;
}

function escapeHtml(unsafe, ignore = []) {
    if (!['string', 'number', 'bigint', 'boolean'].includes(typeof unsafe)) {
        return unsafe;
    }
    let result = '' + unsafe;
    if (!ignore.includes('&')) result = result.replace(/&/g, "&amp;");
    if (!ignore.includes('<')) result = result.replace(/</g, "&lt;");
    if (!ignore.includes('>')) result = result.replace(/>/g, "&gt;");
    if (!ignore.includes('"')) result = result.replace(/"/g, "&quot;");
    if (!ignore.includes("'")) result = result.replace(/'/g, "&#039;");
    return result;
}

function getAttributes(item, allowedAttributes = null) {
    return Object.keys(item)
        .filter(key => 
            (allowedAttributes === null || allowedAttributes.includes(key)) &&
            key.startsWith('$') && // Ensure the key starts with '$'
            !['$tag', '$public', '$private'].includes(key) // Exclude specific keys
        )
        .map(key => {
            const attrValue = item[key];
            // Check if the value is of an allowed type before escaping and including
            return ` ${key.substring(1)}="${['string', 'number', 'bigint'].includes(typeof attrValue) ? escapeHtml(attrValue) : ''}"`;
        })
        .join('');
}

function onPage(href, uri, lang, langs) {
    return href === uri ||
            lang && langs && langs.length && langs[0].code == lang.code && href === `/${lang.code}${uri}`;
}

function sortCatalog(arr, field, direction = 'asc', type = 'string') {
    function getValue(obj, fieldPath) {
        return fieldPath.split('.').reduce((current, nextField) => {
            return current ? current[nextField] : undefined;
        }, obj);
    }
    // Helper function to handle the different sort types
    const sortFunction = (a, b) => {
        let valA, valB;
        
        // Convert the values based on type for comparison
        switch (type) {
            case 'date':
                valA = new Date(getValue(a, field));
                valB = new Date(getValue(b, field));
                break;
            case 'number':
                valA = Number(getValue(a, field));
                valB = Number(getValue(b, field));
                break;
            case 'boolean':
                valA = getValue(a, field) ? 1 : 0;
                valB = getValue(b, field) ? 1 : 0;
                break;
            default:
                // Assume string as default
                valA = getValue(a, field).toString().toLowerCase(); // to handle case-insensitive sorting
                valB = getValue(b, field).toString().toLowerCase();
                break;
        }

        // Compare for sorting
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    };

    const items = [...arr];
    items.sort(sortFunction);
    return items;
}

function extractDescription1stVerse(content) {
    const desc = renderEJSContent(content, 'div', true);
    return desc.split('&nbsp;')[0];
}

function renderDate(date, format, lang = 'en') {
    moment.locale(lang);
    return moment(date).format(format);
}

function renderTime(startDate, endDate, format, lang = 'en') {
    moment.locale(lang);
    const duration = moment.duration(moment(endDate).diff(moment(startDate)));
    return duration.format(format);
}

function renderLink(link, attrs = {}) {
    let html = '';
    if ('object' === typeof link && link) {
        if (Array.isArray(link)) {
            for (const l of link) {
                html += renderLink(l, attrs);
            }
        } else {
            const a = Object.assign({}, attrs, link);
            html += renderEJSContent(a, 'a');
        }
    } else if ('string' === typeof link && link) {
        let a;
        if (link.endsWith('>') && link.includes('<')) {
            const words = link.substring(0, link.length - 1).split('<');
            if (words.length === 2) {
                a = Object.assign({}, attrs, { '$href': words[1], 'a': words[0] });
            } else {
                a = Object.assign({}, attrs, { '$href': link, 'a': link });
            }
        } else {
            a = Object.assign({}, attrs, { '$href': link, 'a': link });
        }
        html += renderEJSContent(a, 'a');
    }
    return html;
}

function thumbSrc(image, gallery = null, alwaysWEBP = false) {
    if (!image) return image;
    if (!gallery || 'object' !== typeof gallery || !gallery['thumb']) return image;
    let file = image.replace(/(\.[^\.]+)$/, `@${gallery['thumb']}$1`);
    if (alwaysWEBP) {
        file = file.replace(/\.(png|gif|bmp|jpeg|tiff|avif|jpg)$/i, '.webp');
    }
    return file;
}

function readPosts(all, $catalog, $categoriesEnabled, $categoriesNested, sort = null, direction = 'desc', type = 'string') {
    if (!$catalog) return [];
    let catPosts = [];
    for (const uri in all) {
        const data = all[uri];
        if (data['$hidden']) continue;
        if (data['category']) continue; // category page is not a post
        if (!$categoriesEnabled) {
            catPosts.push(data);
            continue;
        }
        let category = data['page']?.['category'] || null;
        if (null === category) {
            const words = data['$uid'].split('/');
            category = words.slice(0, words.length - 1).join('/');
        }
        if (category === $catalog || $categoriesNested && category.startsWith($catalog + '/')) {
            catPosts.push(data);
        }
    }
    if (!sort) return catPosts;
    return sortCatalog(catPosts, sort, direction, type);
}

function readDirectory(directory) {
    const dir = {
        divider: '.',
        items: [],
        idKey: 'id'
    };
    if (Array.isArray(directory)) {
        dir.items = directory.slice();
    } else {
        Object.keys(dir).forEach(key => {
            dir[key] = typeof directory[key] === 'undefined' ? dir[key] : Object.assign({}, directory[key]);
        });
    }
    const result = [];
    const items = Object.assign([], dir.items);
    const ref = {};
    for (const i in dir.items) {
        const item = dir.items[i];
        if (!item['children']) item['children'] = [];
        let id = ('' + item[dir['idKey'] || 'id']);
        if (!id.endsWith(dir.divider)) {
            id += dir.divider;
        }
        const words = id.split(dir.divider);
        ref[id] = i;
        const parentIndex = words.slice(0, words.length - 2).join(dir.divider) + dir.divider;
        const parent = parentIndex === dir.divider ? -1 : ref[parentIndex];
        if (parent >= 0) {
            if (!items[parent].children.includes(item)) {
                items[parent].children.push(item);
            }
        } else {
            result.push(item);
        }
    }
    return result;
}

function escapeId(id) {
    return ('' + id).replace(/[^\w\d\-\_]+/ig, '-');
}

function escapeClass(name) {
    const words = name.split(' ');
    const result = [];
    for (const word of words) {
        if ('' === word) continue;
        let str = escapeId(word);
        if (/^[\d]+/.test(str)) str = '-' + str;
        result.push(str);
    }
    return result.join(' ');
}

function uri2class(uri) {
    const words = uri.split('/');
    if (words[0] === '') words.shift();
    if (words[0] && words[0].length == 2) words.shift();
    const last = words.pop();
    if (last) {
        words.push(last.endsWith('.html') ? last.slice(0, last.length - 5) : last);
    }
    const all = [];
    for (let i = 1; i <= words.length; i++) {
        all.push(words.slice(0, i).join('/'));
    }
    return escapeClass(all.join(' '));
}

function getDictLinks(dict, uriPrefix = '?link=') {
    const res = [];
    Object.entries(dict).forEach(([id, title]) => res.push({ title, url: `${uriPrefix}${id}` }));
    return res;
}

module.exports = {
    renderEJSContent,
    nano2html: renderEJSContent,
    renderEJSAttrs: getAttributes,
    onPage,
    sortCatalog,
    extractDescription1stVerse,
    escapeHtml,
    escapeId,
    escapeClass,
    uri2class,
    renderDate,
    renderTime,
    thumbSrc,
    readPosts,
    renderLink,
    getDictLinks,
    readDirectory,
};

const { escapeHtml, renderEJSAttrs } = require("./functions");

const SOCIAL_NETWORKS = {
    'instagram.com': {
        icon: 'instagram',
        title: 'Instagram'
    },
    'twitter.com': {
        icon: 'x',
        title: 'Twitter'
    },
    'x.com': {
        icon: 'x',
        title: 'X'
    },
    'facebook.com': {
        icon: 'facebook',
        title: 'Facebook'
    },
    'linkedin.com': {
        icon: 'linkedin',
        title: 'LinkedIn'
    },
    'reddit.com': {
        icon: 'reddit',
        title: 'Reddit'
    },
    'pinterest.com': {
        icon: 'pinterest',
        title: 'Pinterest'
    },
    'pin.it': {
        icon: 'pinterest',
        title: 'Pinterest'
    },
    'whatsapp.com': {
        icon: 'whatsapp',
        title: 'WhatsApp'
    },
    'telegram.org': {
        icon: 'telegram',
        title: 'Telegram'
    },
    'youtube.com': {
        icon: 'youtube',
        title: 'YouTube'
    },
    'youtu.be': {
        icon: 'youtube',
        title: 'YouTube'
    },
    'tiktok.com': {
        icon: 'tiktok',
        title: 'TikTok'
    },
    'medium.com': {
        icon: 'medium',
        title: 'Medium'
    }
};

const tel = (phoneNumber) => {
    return phoneNumber.replace(/[^\+\d]/g, '');
};

function extension(file, prefix = '') {
    // file.slice(((filePath.lastIndexOf(".") - 1) >>> 0) + 2)
    const parts = file.split('.');
    let ext = parts.length > 1 ? parts[parts.length - 1] : '';
    if (ext.length > 5) ext = '';
    if ('html' === ext && parts.length > 2 && parts[parts.length - 2] === 'embed') {
        ext = parts.slice(parts.length - 2).join('.');
    }
    return ext === '' ? '' : (prefix + ext);
}

function extractDate(possibleDate) {
    const dateRegex = /[^\d]*(\d{2})\.?(\d{2})\.?(\d{4})[^\d]*/;
    return possibleDate.match(dateRegex);
}

function uDate(fileSrc, format) {
    // Regular expression to extract the date
    // It matches DD.MM.YYYY or DDMMYYYY at the beginning of the string
    const ext = extension(fileSrc);
    if (!ext) return false;
    const uri = fileSrc.slice(0, fileSrc.length - ext.length - 1);
    const words = uri.split('/');
    let possibleDate = uri.slice(uri.length - 10);
    let match = extractDate(possibleDate);
    if (!match) {
        possibleDate = words[words.length - 1];
        match = extractDate(possibleDate);
    }
    if (!match) return false;
    const day   = match[1];
    const month = match[2];
    const year  = match[3];
    switch (format) {
        case 'YYYY':
        case 'year':
            return year;
        case 'YYYY-MM':
        case 'month':
            return `${year}-${month}`;
        case 'YYYY-MM-DD':
        case 'day':
        case 'date':
            return `${year}-${month}-${day}`;
    }
    return `${day}.${month}.${year}`; // Default format
}

const utils = {
    filename: (file, removeExtension = false) => {
        const name = file.split('/').slice(-1).join('');
        if (!removeExtension) return name;
        const words = name.split('.');
        words.pop();
        return words.join('.');
    },
    extension,
    tel,
    phone: (phoneNumber) => {
        let digits = phoneNumber.match(/\d+/g).join('');
        if (digits.startsWith('0')) {
            digits = '38' + digits;
        }
        return `+${digits.slice(0, 3)} (${digits.slice(3, 5)}) ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10, 12)}`;
    },
    /**
     * Translate the text
     * @param {string|array} what         Original string or array with string and arguments.
     * @param {object}       from         The language dictionary.
     * @param {string|null}  defaultValue The default value if no translations found.
     * @returns string                    The translated string.
     * @example
     *   $l:
     *     'All terms': Всі терміни
     *     'Enter interest rate': Введіть ставку
     *     '$1 months':
     *       1: '1 місяць'
     *       2: '2 місяці'
     *       3: '3 місяці'
     *  translate('All terms', $l)                         => simple translation
     *  translate(['$1 months', 3], $l)                    => translate with the object
     *  translate('Enter interest rate', $l, 'Enter rate') => with default value
     */
    translate: (what, from, defaultValue = null) => {
        if (Array.isArray(what)) {
            let newFrom = from[what[0]] || what[0];
            if ('string' !== typeof newFrom && 'object' !== typeof newFrom) {
                console.error('Impossible to translate', what);
                return 'Impossible to translate []';
            }
            const replacements = [];
            what.slice(1).forEach((repl, i) => {
                if ('object' === typeof repl) {
                    Object.entries(repl).forEach(([key, value]) => replacements.push([`{${key}}`, value]));
                } else {
                    replacements.push([`\$${i + 1}`, repl]);
                }
            });
            let result = '';
            if ('object' === typeof newFrom) {
                if (replacements[0]?.[1] && newFrom[replacements[0]?.[1]]) {
                    result = newFrom[replacements[0][1]];
                } else {
                    result = defaultValue;
                }
            } else {
                result = newFrom;
                replacements.forEach(([from, to]) => {
                    result = result.replaceAll(from, to);
                });
            }
            return result;
        }
        if (undefined === from[what]) {
            return null === defaultValue ? what : defaultValue;
        }
        return from[what];
    },
    /**
     * EncodeToLanguage: Converts Object[key] value to the translation.
     * @example EJS:
     *   subject: <%= l(['Email subject related {title}', u.encode2l(post, ['title', 'requirements'])], $l) %>
     */
    encode2l: (element, keys = null) => {
        const res = {};
        Object.entries(element).forEach(([key, value]) => {
            if (keys && Array.isArray(keys) && !keys.includes(key)) return;
            res[key] = Array.isArray(value) ? ('- ' + value.join("\n- ")) : value;
        });
        return res;
    },
    getSocialNetwork: (url) => {
        for (const domain in SOCIAL_NETWORKS) {
            if (url.includes(domain)) {
                return { ...SOCIAL_NETWORKS[domain], url };
            }
        }
        return null;
    },
    parseContact: (input, type = 'html', attrs = {}) => {
        let name = '', contact = '';
        const validated = input.trim();
        const phoneExp = /([\s\+\(\)\-\.\d]{6,})/i; 
        const isEmail = validated.includes('@');
        if (validated.endsWith('>') && validated.includes('<')) {
            const words = validated.slice(0, validated.length - 1).split('<');
            name = words[0].trim();
            contact = words[1].trim();
        } else if (isEmail) {
            contact = validated;
        } else {
            const matches = validated.match(phoneExp);
            if (matches) {
                contact = matches[1];
            }
        }
        if ('name' === type) return name;
        if ('contact' === type) return contact;
        if (!name) name = contact;
        if ('full' === type) name += ` <${contact}>`;
        const href = `${isEmail ? 'mailto' : 'tel'}:${isEmail ? contact : tel(contact)}`;
        if ('nan•' === type) {
            return {
                '$href': href,
                isEmail,
                a: name
            };
        }
        return `<a href="${escapeHtml(href)}" ${renderEJSAttrs(attrs)}><span>${escapeHtml(name)}</span></a>`;
    },
    href: (uri) => {
        if (!uri.endsWith('.html')) {
            return uri + '.html';
        }
        return uri;
    },
    date: uDate
};

module.exports = {
    utils
};

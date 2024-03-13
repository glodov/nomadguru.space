/**
 * @return
 *  - window.nwFindAllParents = (element, selector = '*', limit = 0) => [Element]
 *  - window.nwFindParent = (element, selector = '*') => Element|null
 *  - window.nwScrollTo = (element) => true
 *  - window.nwSupportsES2018 = () => true|false
 *  - window.nwTruncateText = (text, maxLen = 255) => string
 *  - window.nwEscapeHTML = (str) => string
 *  - window.nwBreakpoint = (name) => int
 *  - window.nwSetDebugMode = (mode) => localStorage.setItem(NW_LS_DEBUG_MODE, !!mode ? '1' : '0');
 *  - window.nwIsDebugMode = () => !!parseInt(localStorage.getItem(NW_LS_DEBUG_MODE) || '0', 10);
 *  - window.nwReadOpts = function(str, types = { foo: '' }, defaultOptions = { foo: ':)' }) => {}
 */
NW_LS_DEBUG_MODE = 'nwDebugMode';
window.nwCHECK = '✓';
window.nwTIMES = '✗'; // ×
(() => {
    // find all parent elements that matches provided selector, limit by count or element
    window.nwFindAllParents = (element, selector = '*', limit = 0) => {
        const parents = [];
        let parent = element.parentElement;
        while (parent && parent !== document.body) {
            if (limit instanceof HTMLElement && parent === limit) {
                break;
            }
            if (parent.matches(selector)) {
                parents.push(parent);
                if (limit > 0 && limit == parents.length) {
                    break;
                }
            }
            parent = parent.parentElement;
        }
        return parents;
    };
    // find first parent element that matches provided selector
    window.nwFindParent = (element, selector = '*', limit = 0) => {
        const parents = window.nwFindAllParents(element, selector, limit || 1);
        return parents.length ? parents[0] : null;
    };
    // scroll to the element including the offset of the .sticky-top elements
    window.nwScrollTo = (element) => {
        const $sticks = document.querySelectorAll('.sticky-top');
        let stickyHeight = 0;
        let stickyMargin = 0;
        $sticks.forEach(el => {
            stickyHeight += el ? el.offsetHeight : 0;
            stickyMargin += el ? parseInt(window.getComputedStyle(el).marginTop) + parseInt(window.getComputedStyle(el).marginBottom) : 0;
        });
        const targetPosition = element.getBoundingClientRect().top + window.scrollY;
    
        // console.log(`Scrolling to `, targetPosition - stickyHeight - stickyMargin, element);
        window.scrollTo({
            top: targetPosition - stickyHeight - stickyMargin,
            behavior: 'smooth'
        });
        return true;
    };
    window.nwSupportsES2018 = () => {
        try {
            new RegExp('\\p{L}', 'u');
            return true;
        } catch (e) {
            return false;
        }
    };
    window.nwTruncateText = (text, maxLen = 255) => {
        let res = text;
        if (text.length > maxLen) {
            res = text.substring(0, maxLen);
            let lastSpace = res.lastIndexOf(' ');
            if (lastSpace > 0) {
                res = res.substring(0, lastSpace);
            }
            res += '...';
        }
        return res;
    };
    window.nwEscapeHTML = (str) => {
        return str.replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    };
    window.nwBreakpoint = (name) => {
        const style = getComputedStyle(document.documentElement);
        const breakpointValue = style.getPropertyValue(`--bs-breakpoint-${name}`).trim();
        return parseInt(breakpointValue, 10);
    };
    window.nwSetDebugMode = (mode) => {
        localStorage.setItem(NW_LS_DEBUG_MODE, !!mode ? '1' : '0');
        console.log(`Debug mode is ${!!mode ? '%cEnabled ' + window.nwCHECK: '%cDisabled ' + window.nwTIMES}`, `color: ${!!mode ? 'green' : 'red'}; font-size: 144%`);
    };
    window.nwIsDebugMode = () => !!parseInt(localStorage.getItem(NW_LS_DEBUG_MODE) || '0', 10);
    window.nwCreateHTML = (element, attrs = {}, content = null, isRawHTML = false) => {
        const $el = document.createElement(element);
        for (const key in attrs) $el.setAttribute(key, attrs[key]);

        function append(item) {
            if (item instanceof HTMLElement) {
                $el.appendChild(item);
            } else if (typeof item === 'string') {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = item;
                while (tempDiv.firstChild) $el.appendChild(tempDiv.firstChild);
            } else if (Array.isArray(item)) {
                item.forEach(i => append(i));
            } else {
                if (window.nwIsDebugMode()) console.error('Cannot append item', item);
            }
        }
        
        if (isRawHTML) {
            if (Array.isArray(content)) {
                content.forEach(i => append(i));
            } else {
                append(content);
            }
        } else if (content) {
            $el.innerText = content; // Use textContent for better performance and consistency
        }
        return $el;
    };
    window.nwL = (what, from, defaultValue = null) => {
        if (Array.isArray(what)) {
            let newFrom = from[what[0]] || what[0];
            if ('string' !== typeof newFrom) {
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
            replacements.forEach(([from, to]) => newFrom = newFrom.replaceAll(from, to));
            return newFrom;
        }
        if (undefined === from[what]) {
            return null === defaultValue ? what : defaultValue;
        }
        return from[what];
    };
    window.nwCopy = function(element) {
        if (Array.isArray(element)) {
            return element.slice();
        }
        if ('object' === typeof element) {
            return element === null ? null : Object.assign({}, element);
        }
        return element;
    };
    window.nwRender = function($item, post) {
        for (const field in post) {
            if (field.startsWith('$')) continue;
            const nw = `nw-${field}`;
            $item.querySelectorAll(`[${nw}]`).forEach($nw => {
                const value = $nw.getAttribute(nw);
                if ('text' === value) {
                    $nw.textContent = post[field];
                } else if ('html' === value) {
                    $nw.innerHTML = post[field];
                } else {
                    const attr = value || field;
                    const old = $nw.getAttribute(attr);
                    if ('' === post[field] && old !== '') {
                        // skip, leave a default value/
                    } else {
                        $nw.setAttribute(attr, post[field]);
                    }
                }
            });
        }
        return $item;
    };
    /**
     * @param {string} str            String with the defined options,
     *                                separated by ";",
     * @param {object} types          Predefined types for the possible options.
     *                                Type is just an any value of that kind.
     * @param {object} defaultOptions Default values for the options.
     * @returns {object}              The parsed options.
     * @example Of the input string
     *          filter:cats,tags,date; values:cat=main&tag=food; first:5; perPage:12; lazy:1; url:/search/uk/news.txt
     *          That returns:
     *          {
     *              filter: ['cats', 'tags', 'date'],
     *              values: { 'cat': 'main', 'tag': 'food' },
     *              first: 5,
     *              perPage: 12,
     *              lazy: true
     *              url: '/search/uk/news.txt'
     *          }
     *          if types argument:
     *          {
     *              filter: [],
     *              values: {},
     *              first: 1,
     *              perPage: 1,
     *              lazy: false,
     *              url: ''
     *          }
     */
    window.nwReadOpts = function(str, types = { foo: '' }, defaultOptions = { foo: ':)' }) {
        const parsed = {};
        str.split(';').forEach(line => {
            const words = line.trim().split(':');
            const key = words[0].trim();
            if ('' === key) return;
            const value = words.slice(1).join(':').trim();
            if ('undefined' === typeof types[key]) return;
            parsed[key] = value;
            if (Array.isArray(types[key])) {
                parsed[key] = value.split(',');
            } else if ('number' === typeof types[key]) {
                parsed[key] = Number.isInteger(types[key]) ? parseInt(value, 10) : parseFloat(value);
            } else if ('boolean' === typeof types[key]) {
                parsed[key] = ['true', 'on', '1', 1, true].includes(value);
            } else if ('object' === typeof types[key] && null !== typeof types[key]) {
                parsed[key] = new URLSearchParams(value);
            }
        });
        return Object.assign({}, defaultOptions, parsed);
    };
})();
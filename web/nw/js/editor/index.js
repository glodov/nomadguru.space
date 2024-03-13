/**
 * Editor API
 * @depends
 *  - window.nwFindParent
 *  - window.isDebugMode
 *  - window.nwHotkeyAttach = (element = document, selector = NW_SELECTOR_HOTKEY, attribute = NW_ATTRIBUTE_HOTKEY) => [];
 * @return:
 *  - window.nwSearchTextValue 'string'
 *  - window.nwSearchResults   [ { uri, title, desc, image, body } ]
 *  - window.nwSearchMap       { uri: title }
 *  - window.nwSearch          function(str) => { results: [ { uri, title, desc, image, body } ], total }
 *      search ignores the tokens (words) with the length less than 3 characters.
 */
const NW_LS_AUTH_TOKEN = 'nwJWTtoken';
window.nwEJS = {
    tel: (phoneNumber) => phoneNumber.replace(/[^\+\d]/g, ''),
    extension: (file, prefix = '') => {
        // file.slice(((filePath.lastIndexOf(".") - 1) >>> 0) + 2)
        const parts = file.split('.');
        let ext = parts.length > 1 ? parts[parts.length - 1] : '';
        if (ext.length > 5) ext = '';
        if ('html' === ext && parts.length > 2 && parts[parts.length - 2] === 'embed') {
            ext = parts.slice(parts.length - 2).join('.');
        }
        return ext === '' ? '' : (prefix + ext);
    }, 
    extractDate: (possibleDate) =>  {
        const dateRegex = /[^\d]*(\d{2})\.?(\d{2})\.?(\d{4})[^\d]*/;
        return possibleDate.match(dateRegex);
    },
    date: (fileSrc, format) => {
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
    },
    filename: (file, removeExtension = false) => {
        const name = file.split('/').slice(-1).join('');
        if (!removeExtension) return name;
        const words = name.split('.');
        words.pop();
        return words.join('.');
    },
    phone: (phoneNumber) => phoneNumber,
    l: (what, from, defaultValue = null) => {
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
};
(async () => {
    const html = window.nwCreateHTML;
    window.nwAPI = async function(uri, args = {}) {
        const jwtToken = localStorage.getItem(NW_LS_AUTH_TOKEN);
        try {
            // Construct query string from args
            const queryParams = new URLSearchParams(args);
            queryParams.append('uri', window.location.pathname);
            const urlWithParams = `/nw/${uri}?${queryParams}`;
            const res = await fetch(urlWithParams, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${jwtToken}`
                }
            });
            const body = await res.json();
            const headers = res.headers;
        
            const headersObject = {};
            headers.forEach((value, key) => headersObject[key] = value);
            return { body, headers: headersObject, status: res.status };
        } catch (error) {
            throw new Error(`Error processing module ${uri} for data ${window.location.pathname}`);
        }
    };
    window.nwe

    const nwView = {};
    async function loadPanel() {
        const res = await window.nwAPI('views');
        if (res['body']?.['views']) {
            for (const { uri, view } of res.body.views) {
                const name = uri.endsWith('.ejs') ? uri.slice(0, '.ejs'.length) : uri;
                if (uri.startsWith('_/')) {
                    const $div = document.createElement('div');
                    $div.innerHTML = render(view, renderData(res['body']?.['data']));
                    while ($div.firstChild) document.body.append($div.firstChild);
                } else {
                    nwView[name] = view;
                }
            }
            window.nwHotkeysAttach();
        }
    }
    await loadPanel();

    const $panel = document.getElementById('nwEditorPanel');
    const $modal = document.getElementById('nwEditorModal');
    const $body = document.getElementById('nwEditorModalBody');
    const $footer = document.getElementById('nwEditorFooter');
    let onModuleChange = () => {};
    if (!$panel) {
        if (window.nwIsDebugMode()) console.error('Editor navigation panel not defined');
        return false;
    }
    if (!$modal) {
        if (window.nwIsDebugMode()) console.error('Editor modal dialog not defined');
        return false;
    }
    if (!$body) {
        if (window.nwIsDebugMode()) console.error('Body section in modal dialog not defined');
        return false;
    }
    function render(templateHtml, data) {
        return ejs.render(templateHtml, data);
    }
    function renderData(data) {
        return Object.assign({}, data || {}, window.nwEJS);
    }

    $modal.addEventListener('hide.bs.modal', () => {
        if (history.pushState) {
            history.pushState("", document.title, window.location.pathname + window.location.search);
        } else {
            window.location.href = window.location.href.split('#')[0];
        }
    });
    // Initialize your app or bind initial event listeners here
    document.addEventListener('DOMContentLoaded', () => {
        handleRouting(); // Handle initial route
    });
    $panel.querySelectorAll('[href^="#"]').forEach(a => {
        a.addEventListener('click', (event) => {
            event.preventDefault();
            window.location.hash = a.getAttribute('href');
        });
    });
    // Listen for hash changes
    window.addEventListener('hashchange', handleRouting);

    function openModal() {
        const modal = new bootstrap.Modal($modal, {});
        modal.show();
    }
    const routing = {
        mkdir: () => { },
        add: () => { },
        edit: async () => {},
        content: async () => {
            openModal();
        },
        options: async () => {
            const res = window.nwEditor.options.init({ $body, $footer, $modal, $panel });
            if (res) {
                onModuleChange = res['onChange'] || (() => true);
                openModal();
            } else {
                console.error('Cannot open options module');
            }
        },
        write: () => { },
        ls: () => { },
        sources: async () => {
            const res = await window.nwAPI('sources');
            openModal(res);
        },
        users: () => { },
        me: () => { }
    };
    function handleRouting() {
        // Extract the current hash value
        if (!location.hash.startsWith('#/nw/')) return false;
        const hash = location.hash.replace(/^\#\/nw\//i, ''); // Remove the '#' character
        const fn = routing[hash] || (() => { });
        fn.call(this);
    }
    /**
     * Move cursor in body list of value items.
     * @param {int|bool} move 0    to the first element,
     *                       -1    to the previous,
     *                        1    to the next,
     *                        true to the last
     */
    function moveCursor(move = 1) {
        const items = document.querySelectorAll('.list-group-item-action');
        const activeItem = document.activeElement;
        let index = Array.from(items).indexOf(activeItem);
        if (index === -1) {
            return;
        }
    
        if (move === 0) { // Move to the first element
            items[0].focus();
        } else if (move === true) { // Move to the last element
            items[items.length - 1].focus();
        } else {
            // Calculate the new index based on the move direction
            let newIndex = index + move;
            newIndex = Math.max(0, Math.min(newIndex, items.length - 1));
            items[newIndex].focus();
        }
    }
    document.addEventListener('keydown', (event) => {
        const key = event.key;
        if (key >= '1' && key <= '9') {
            if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
            const activeDropdown = getActiveDropdown();
            handleDropdownHotkey(activeDropdown, key);
        }
        if (event.key === 'ArrowDown') {
            moveCursor(1);
        }
        if (event.key === 'ArrowUp') {
            moveCursor(-1);
        }
        if (event.key === 'ArrowLeft') {
            moveCursor(0);
        }
        if (event.key === 'ArrowRight') {
            moveCursor(true);
        }
        // Handling the Enter key to dispatch a click event
        if (event.key === 'Enter') {
            const focusedElement = document.activeElement;
            if (focusedElement && focusedElement.getAttribute('nwe')) {
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                focusedElement.dispatchEvent(clickEvent);
                event.preventDefault();
            }
        }
    });
    function getActiveDropdown() {
        if (!$panel) return null;
        return $panel.querySelector('[aria-expanded="true"].dropdown-toggle');
    }
    function handleDropdownHotkey(dropdown, key) {
        if (!dropdown || !key) return false;
        const li = dropdown.matches('li') ? dropdown : window.nwFindParent(dropdown, 'li');
        if (!li) return false;
        const no = parseInt(key);
        const links = Array.from(li.querySelectorAll(`ul.dropdown-menu li a`));
        if (links[no - 1]) links[no - 1].click();
    }
    
    if (!window.nwEditor) window.nwEditor = {};
    window.nwEditor.index = {
        change: (value, args, $el) => {
            if ('function' === typeof onModuleChange) {
                const res = onModuleChange.apply(null, [value, args, $el]);
                if (!res) return;
            }
            args.data[args.field] = value;
            const arr = (args.input['loaded'] || ['*']);
            const uri = arr[arr.length - 1];
            if (!args['input']) args['input'] = { '$changes': {} };
            if (!args.input['$changes']) args.input['$changes'] = {};
            if (!args.input['$changes'][uri]) args.input['$changes'][uri] = {};
            args.input['$changes'][uri][args.field] = value;
            window.nweData = args;
            const $p = window.nwFindParent($el, '[nwe]');
            if ($p) $p.classList.add('has-change');
        }
    };
})();

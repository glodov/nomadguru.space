// Hotkeys
// Any element that has a click action is available to use for the hotkey.
// Just add the attribute nw-hotkey="cmd+k" to add a hotkey for this element.
// It is possible to set more than one hotkey for the same element by using a | separator:
// nw-hotkey="cmd+k|alt+shift+f"
// all the hotkeys are registered in window.nwHotkeys variable.
const NW_SELECTOR_HOTKEY = '[nw-hotkey]';
const NW_ATTRIBUTE_HOTKEY = 'nw-hotkey';
window.nwHotkeys = [];
window.nwHotkeysAttach = (element = document, selector = NW_SELECTOR_HOTKEY, attribute = NW_ATTRIBUTE_HOTKEY) => [];
(() => {
    window.nwHotkeysAttach = (element = document, selector = NW_SELECTOR_HOTKEY, attribute = NW_ATTRIBUTE_HOTKEY) => {
        const hotkeys = [];
        element.querySelectorAll(selector).forEach($el => {
            const values = $el.getAttribute(attribute).split('|');
            values.forEach(value => {
                const required = { key: [] };
                const keys = value.split('+');
                for (let key of keys) {
                    key = key.toLowerCase();
                    if (['cmd', 'meta', 'win'].includes(key)) {
                        required['metaKey'] = true;
                    } else if (['shift'].includes(key)) {
                        required['shiftKey'] = true;
                    } else if (['ctrl'].includes(key)) {
                        required['ctrlKey'] = true;
                    } else if (['alt'].includes(key)) {
                        required['altKey'] = true;
                    } else if (!required.key.includes(key)) {
                        required['key'].push(key);
                    }
                }
                let found = false;
                for (const hk of window.nwHotkeys) {
                    if (hk.$el.outerHTML === $el.outerHTML) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    hotkeys.push({ required, $el });
                }
            });
        });
        window.nwHotkeys = [...window.nwHotkeys, ...hotkeys];
        return hotkeys;
    };
    const onKeyDown = (event) => {
        // Check if the event target is an input or textarea
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            // Optional: Allow hotkeys with meta, alt, or ctrl keys in input/textarea
            if (!event.metaKey && !event.altKey && !event.ctrlKey) {
                return; // Skip hotkey execution
            }
        }
        window.nwHotkeys.forEach(hotkey => {
            let matched = true;
            // @todo improve the function
            // hotkeys are not available when typing in input, textarea, so they do not block typing.
            // what is the best solution to block all the hotkeys, or those that do not have meta, alt or ctrl key involved?
            ['metaKey', 'shiftKey', 'ctrlKey', 'altKey'].forEach(modKey => {
                if (Boolean(hotkey.required[modKey]) !== event[modKey]) {
                    matched = false;
                    return;
                }
            });
            if (!hotkey.required.key.includes(event.key.toLowerCase())) {
                matched = false;
                return;
            }
            if (matched) {
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(hotkey.$el.tagName)) {
                    if (['RADIO', 'CHECKBOX'].includes(hotkey.$el.getAttribute('type').toUpperCase())) {
                        hotkey.$el.click();
                    } else {
                        hotkey.$el.focus();
                    }
                } else {
                    hotkey.$el.click();
                }
                event.preventDefault();
            }
        });
    };
    document.addEventListener('keydown', onKeyDown);

    window.nwHotkeysAttach();
})();
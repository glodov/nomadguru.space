/**
 * @depends [nw="langs"]?[nwopts="wait:-1"] [nw-lang]
 *          window.nwReadOpts = (str, types, types) => {}
 */
const NW_LANG_SWITCH_TIMEOUT = 3333;
const NW_LANG_BLINK_INTERVAL = 333;
(() => {
    function readOptions(str) {
        const types = {
            blink: NW_LANG_BLINK_INTERVAL,
            switch: NW_LANG_SWITCH_TIMEOUT,
        };
        return window.nwReadOpts(str, types, types);
    }
    function detectLang($nav) {
        const userLanguage = navigator.language || navigator.userLanguage;
        if (!userLanguage) return;
        const lang = userLanguage.split('-');
        let found = false;
        const opts = readOptions($nav.getAttribute('nwopts') || '');

        function selectLang($lang) {
            found = true;
            $lang.classList.add('active');
            let blinking;
            if (opts['blink']) {
                blinking = setInterval(() => { $lang.classList.toggle('active') }, opts['blink']);
            }
            if (opts['switch'] >= 0) setTimeout(() => {
                if (blinking) clearInterval(blinking);
                $lang.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }, opts['switch']);
        }

        $nav.querySelectorAll('[nw-lang]').forEach($lang => {
            if (found) return;
            const current = $lang.getAttribute('nw-lang');
            if (userLanguage.length === current.length) {
                if (userLanguage === current) selectLang($lang);
            } else if (lang[0].length === current.length ) {
                if (lang[0] === current) selectLang($lang);
            }
        });
    }

    document.querySelectorAll('[nw="langs"]').forEach(detectLang);
})();
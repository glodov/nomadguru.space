/**
 * Dark Mode API
 * @return
 *    window.nwDetectDarkMode = () => 0;
 *    window.nwEnableDarkMode = (mode) => undefined;
 *    window.nwIsDarkMode = () => false;
 */
const NW_LS_SETTINGS_DARKMODE = 'nw.DarkMode';
const NW_SELECTOR_DARKMODE_SWITCH = '[nw="DarkMode"]';
const NW_DARKMODE = 1;
const NW_DARKMODE_OFF = 0;
window.NW_DARKMODE = NW_DARKMODE;
window.NW_DARKMODE_OFF = 0;
window.nwDetectDarkMode = () => 0;
window.nwEnableDarkMode = (mode) => false;
window.nwIsDarkMode = () => false;
(() => {
    window.nwEnableDarkMode = (mode) => {
        console.log('Dark mode is', mode ? 'enabled' : 'disabled');
        localStorage.setItem(NW_LS_SETTINGS_DARKMODE, mode);
        document.dispatchEvent(new Event('darkModeChange'));
    
        const isDark = null === mode ? window.matchMedia('(prefers-color-scheme: dark)').matches : parseInt(mode);
        document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
    };
    window.nwDetectDarkMode = () => {
        let darkMode = localStorage.getItem(NW_LS_SETTINGS_DARKMODE) || NW_DARKMODE_OFF;
        if (null === darkMode && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            darkMode = NW_DARKMODE;
        }
        if (null === darkMode && 'dark' === document.documentElement.getAttribute('data-bs-theme')) {
            darkMode = NW_DARKMODE;
        }
        return parseInt(darkMode);
    };
    const renderAll = (checked) => {
        document.querySelectorAll(NW_SELECTOR_DARKMODE_SWITCH).forEach(s => s.checked = checked);
    };
    const handleDarkMode = () => {
        let clicked = false;
        document.querySelectorAll(NW_SELECTOR_DARKMODE_SWITCH).forEach($switch => {
            $switch.checked = NW_DARKMODE === window.nwDetectDarkMode();
            $switch.addEventListener('change', e => {
                window.nwEnableDarkMode(e.currentTarget.checked ? NW_DARKMODE : NW_DARKMODE_OFF);
                renderAll($switch.checked);
            });
            // $switch.addEventListener('click', e => {
            //     e.preventDefault();
            // });
            document.addEventListener('darkModeChange', () => $switch.checked = NW_DARKMODE === window.nwDetectDarkMode());
            if (!clicked) {
                window.nwEnableDarkMode($switch.checked ? NW_DARKMODE : NW_DARKMODE_OFF);
                renderAll($switch.checked);
                clicked = true;
            }
        });
    };

    window.nwEnableDarkMode(localStorage.getItem(NW_LS_SETTINGS_DARKMODE) || NW_DARKMODE_OFF);

    window.nwIsDarkMode = () => parseInt(localStorage.getItem(NW_LS_SETTINGS_DARKMODE)) === NW_DARKMODE;

    document.addEventListener('DOMContentLoaded', handleDarkMode);
})();
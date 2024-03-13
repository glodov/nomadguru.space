/**
 * @depends
 *  - window.nwScrollTo(element)
 *  - window.nwIsDebugMode()
 */
const NW_SELECTOR_SCROLL_TO = '[nw-scrollto]';
const NW_ATTRIBUTE_SCROLL_TO = 'nw-scrollto';
(() => {
    const scrollTo = (hash) => {
        if (!hash || '#' === hash || hash.startsWith('#/nw/')) return false;
        let element = null;
        try {
            element = document.querySelector(hash);
        } catch (err) {
            if (window.nwIsDebugMode()) console.error('Error selecting hash element:', err);
            return false;
        }
        if (!element) return false;

        return window.nwScrollTo(element);
    };

    const onHashChange = (event) => {
        event.preventDefault();
        scrollTo(window.location.hash);
    };

    const follow = (href, event) => {
        if (href && href.startsWith('#')) {
            event.preventDefault();
            window.location.hash = href;
            scrollTo(href);
            return true;
        }
        return false;
    };

    const onClick = (event) => {
        if (follow(event.currentTarget.getAttribute(NW_ATTRIBUTE_SCROLL_TO), event)) {
            return true;
        }
        follow(event.target.closest('[href]').getAttribute('href'), event);
    };

    // Initialize scrolling if there's a hash in the URL on load
    if (window.location.hash) {
        setTimeout(() => {
            scrollTo(window.location.hash);
        }, 108);
    }

    // Listen for hash changes to apply custom scrolling
    window.addEventListener('hashchange', onHashChange);

    // Attach click event listener to all anchor tags that have a hash href
    document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', onClick));
    document.querySelectorAll(NW_SELECTOR_SCROLL_TO).forEach(a => a.addEventListener('click', onClick));
})();

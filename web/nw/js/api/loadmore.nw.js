const NW_SELECTOR_POSTS_MORE = '[nw="LoadMore"]';
const NW_DATA_PREFIX = 'nw-';
(() => {
    const dataPrefix = NW_DATA_PREFIX;
    const postsLoader = () => {
        function complete($more) {
            $more.closest('article').classList.add('disabled');
        }
        function loadMore($more) {
            const $parent = window.nwFindParent($more, `[${dataPrefix}per-page]`);
            if (!$parent || !$parent.getAttribute(`${dataPrefix}per-page`)) return;
            const count   = $parent.getAttribute(`${dataPrefix}count`);
            const perPage = parseInt($parent.getAttribute(`${dataPrefix}per-page`));
            const all     = Array.from($parent.querySelectorAll(`[${dataPrefix}id]:not([${dataPrefix}hidden])`));
            const hidden  = $parent.querySelectorAll(`.d-none[${dataPrefix}id]:not([${dataPrefix}hidden])`);
            const visible = $parent.querySelectorAll(`[${dataPrefix}id]:not(.d-none)`);
            if (!hidden.length && visible.length >= count) complete($more);

            function onClick() {
                const firstHidden = $parent.querySelector(`.d-none[${dataPrefix}id]:not([${dataPrefix}hidden])`);
                if (!firstHidden) {
                    $more.classList.add('d-none');
                    return;
                }
                const index = all.indexOf(firstHidden);
                all.slice(index, index + perPage).forEach(el => {
                    el.querySelectorAll(`[${dataPrefix}src]`).forEach(img => img.setAttribute('src', img.getAttribute(`${dataPrefix}src`)));
                    el.classList.remove('d-none');
                });
                location.hash = `loaded=${index + perPage}`;
                if (index + perPage >= count) complete($more);
            }
    
            $more.addEventListener('click', onClick);
            if (!visible.length) $more.dispatchEvent(new Event('click'));
    
            // check the location.hash for #loaded=33 to load 33 items.
            const loadedMatch = location.hash.match(/loaded=(\d+)/);
            const loaded = loadedMatch ? parseInt(loadedMatch[1], 10) : 0;
            if (loaded > 0) {
                const timesToClick = Math.ceil(loaded / perPage) - 1;
                for (let i = 0; i < timesToClick; i++) $more.dispatchEvent(new Event('click'));
            }
        }
        document.querySelectorAll(NW_SELECTOR_POSTS_MORE).forEach(loadMore);
    };
    document.addEventListener('DOMContentLoaded', postsLoader);
})();

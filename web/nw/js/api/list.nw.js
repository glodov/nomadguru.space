/**
 * A simple filter of list items.
 * @formula (
 *          [nw=list]
 *          ?[nwopts="filter:cats,tags,date; values:cat=main&tag=food; first:5; perPage:12; lazy:1; url:/search/uk/news.txt"]
 *              > [nw=item]
 *          )
 *          + (window.location.query + [nw=filter])
 * @depends [nw=list], [nw=item], [nw=more]
 *          window.nwRender = ($item, post) => $item
 *          window.nwScrollTo = ($element) => undefined
 *          window.nwReadOpts = (str, types, defaultOptions) => {}
 */
const NW_ATTRIBUTE_LAZY_SRC = 'nwlazy-src';
(() => {
    const urlSearchParams = new URLSearchParams(window.location.search);

    function readOptions(str = '') {
        const types = {
            filter: [],
            values: {},
            perPage: 1,
            lazy: 0,
            template: '',
            url: '',
        };
        const defaultOptions = {
            filter: ['date', 'cats'],
            values: {},
            lazy: null,
            perPage: null,
            template: null,
            url: null
        };
        return window.nwReadOpts(str, types, defaultOptions);
    }

    function getValue(key, opts) {
        if (opts['values'] && opts['values'] instanceof URLSearchParams) {
            const res = opts['values'].get(key);
            if (null !== res) return res;
        }
        return urlSearchParams.get(key);
    }

    function filterList($list, opts) {
        $list.querySelectorAll('[nw=item]').forEach($item => {
            const visibility = [];
            (opts['filter'] || []).forEach(field => {
                if (field.endsWith('s')) {
                    // plural, so one of
                    const a = `nw-${field}`;
                    const value = $item.hasAttribute(a) ? $item.getAttribute(a).split('|') : [];
                    const tag = getValue(field.slice(0, field.length - 1), opts);
                    if (null !== tag) visibility.push(value.includes(tag));
                } else {
                    let value = null;
                    $item.querySelectorAll(`[nw-${field}]`).forEach($f => value = $f.getAttribute(`nw-${field}`));
                    if (null !== value) {
                        const tag = getValue(field);
                        if (null !== tag) visibility.push('date' === field ? value.startsWith(tag) : value === tag);
                    }
                }
            });
            if (visibility.every(v => !!v)) $item.classList.add('on');
        });
    }

    function filterArray(arr, opts) {
        return arr.filter(item => {
            const visibility = [];
            (opts['filter'] || []).forEach(field => {
                if (field.endsWith('s')) {
                    // plural, so one of
                    const value = item[field] || [];
                    const tag = getValue(field.slice(0, field.length - 1), opts);
                    if (null !== tag) visibility.push(value.includes(tag));
                } else {
                    let value = item[field] || null;
                    if (null !== value) {
                        const tag = getValue(field, opts)
                        if (null !== tag) visibility.push('date' === field ? value.startsWith(tag) : value === tag);
                    }
                }
            });
            return visibility.every(v => !!v);
        });
    }

    function checkMore($more, $list) {
        const next = Array.from($list.querySelectorAll('[nw=item]:not(.on)'));
        if (next.length) {
            $more.classList.remove('disabled');
        } else {
            $more.classList.add('disabled');
        }
    }

    function onMore(event, $list, perPage, opts) {
        const next = Array.from($list.querySelectorAll('[nw=item]:not(.on)')).slice(0, perPage);
        next.forEach($el => {
            $el.classList.add('on');
            if (opts['lazy']) $el.querySelectorAll(`img[${NW_ATTRIBUTE_LAZY_SRC}]`).forEach($img => {
                $img.setAttribute('src', $img.getAttribute(NW_ATTRIBUTE_LAZY_SRC));
            });
        });
        if (next.length) window.nwScrollTo(next[0]);
        checkMore(this, $list);
    }

    function renderPosts(posts, $list, opts) {
        if (!opts['template']) return;
        const $tmpl = document.querySelector(opts['template']);
        if (!$tmpl) return;
        const fragment = document.createDocumentFragment();
        const $more = $list.querySelector('[nw=more]');
        const perPage = opts['perPage']
        const firstCount = opts['first'] || perPage;

        posts.forEach((post, i) => {
            const data = Object.assign({}, post, { href: post['$uri'] + '.html' });
            const $fragment = window.nwRender($tmpl.content.cloneNode(true), data);
            const $post = $fragment.querySelector('[nw=item]');
            if ((i < firstCount) && $post) {
                $post.classList.add('on');
            } else if (opts['lazy']) {
                $post.querySelectorAll('img[src]').forEach($img => {
                    $img.setAttribute(NW_ATTRIBUTE_LAZY_SRC, $img.getAttribute('src'));
                    $img.setAttribute('src', '');
                });
            }
            fragment.appendChild($fragment);
        });
        if ($more) {
            $list.insertBefore(fragment, $more);
            $more.addEventListener('click', function (event) {
                onMore.apply(this, [event, $list, perPage, opts]);
            });
            checkMore($more, $list);
        } else {
            $list.appendChild(fragment);
        }
    }

    async function loadList($list, opts) {
        const url = opts['url'].startsWith('/search/') ? opts['url'].slice('/search'.length) : opts['url'];
        try {
            let { posts } = await window.nwSearchIndexFile(url);
            posts = filterArray(posts, opts);
            renderPosts(posts, $list, opts);
        } catch (error) {
            if (window.nwIsDebugMode()) console.error(error);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[nw=list]').forEach($list => {
            const opts = readOptions($list.getAttribute('nwopts') || '');
            if (opts['url']) {
                loadList($list, opts);
            } else {
                filterList($list, opts);
            }
        });
    });
})();
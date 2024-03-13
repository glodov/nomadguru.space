/**
 * { lang-btn: true, $href, $class, item: { title, code, url, dir, locale } }
 *
<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false" title="<%= $l['changeLanguage'] %>">
    <img src="/img/lang/<%= $currentLang.code %>.svg" alt="<%= $currentLang.title %>">
    <span class="d-xl-none"><%= $currentLang.title %></span>
</a>

 */
module.exports = function(content) {
    const attrs = {};
    Object.entries(content).forEach(([key, value]) => {
        if (key.startsWith('$')) attrs[key] = value;
    });
    const tag = Object.assign({}, attrs);
    tag['$href'] = content['$href'] || content['item']?.['url'];
    tag['$nw-lang'] = content['item']?.['code'] || '';
    tag['a'] = [
        {
            $src: `/img/lang/${content['item']?.['code']}.svg`,
            $alt: content['item']?.['title'] || '',
            $style: 'max-height: 3rem',
            img: true,
        },
        {
            span: content['item']?.['title'] || ''
        }
    ];
    return tag;
}
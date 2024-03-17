/**
 * { promo: { height: 'max', background: { img | iframe }, block: {} } }
 */
module.exports = function(content) {
    const tag = {
        '$class': 'promo',
        'div': [
        ]
    };
    const promo = content['promo'];
    Object.entries(promo).forEach(([key, value]) => {
        if (key.startsWith('$')) tag[key] = value;
    });
    if (promo['background']) {
        tag.div.push({ $class: 'bg', div: promo['background'] });
    }
    if (promo['height']) {
        if ('max' === promo['height']) {
            tag['$class'] += ' h-max';
        }
    }
    if (promo['block']) {
        const div = promo['block']?.['content'] ? promo['block']['content'] : promo['block'];
        const block = { $class: 'block', div };
        if (promo['block']?.['content']) Object.entries(promo['block']).forEach(([key, value]) => {
            if (key.startsWith('$')) block[key] = value;
        });
        tag.div.push(block);
    }
    if (promo['arrow']) {
        const $href = 'string' === typeof promo['arrow'] ? promo['arrow'] : '#next';
        tag.div.push(
            {
                $class: 'arrow',
                div: [
                    { $href, a: { $class: 'icon-down', span: '' } }
                ]
            }
        );
    }
    return tag;
}
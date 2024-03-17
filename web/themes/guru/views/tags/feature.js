/**
 * { icon, text, title }
 */
module.exports = function (content) {
    const feature = content['feature'];
    if (!feature) return null;
    return {
        $class: 'd-flex flex-column gap-3 col-6 col-lg-3 p-2 p-md-3 p-lg-4',
        div: [
            { $style: 'flex:1;max-height:6rem;', icon: feature['icon'] },
            { $class: 'flex-grow-1 d-flex align-items-center', p: feature['text'] },
            { h3: feature['title'] },
        ]
    };
}
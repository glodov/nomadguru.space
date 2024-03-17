/**
 * { gallery: { id, thumb, items | directory } }
 */
module.exports = function (content) {
    const gallery = content['gallery'];
    const tag = {
        $class: 'gallery',
        div: []
    };
    const id = gallery['id'] || '';
    const thumb = gallery['thumb'] || null;
    Object.entries(gallery).forEach(([key, value]) => {
        if (key.startsWith('$')) tag[key] = value;
    });
    if (gallery['items']) {
        gallery['items'].forEach(item => {
            let $src = item['image'];
            let $href = item['image'];
            if (thumb) {
                let repl = `@${thumb}`;
                if (!thumb.includes('.')) repl += '.$1';
                $src = item['image'].replace(/\.([^\.]+)$/, repl);
            }
            let $img = { $src, img: true, '$nw-gallery': id };
            if ($href !== $src) $img['$href'] = $href;
            tag.div.push($img);
        });
    }
    return tag;
};
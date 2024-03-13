const { processGallery, cropImage } = require('../../static');
const { runtime } = require('../../runtime');

async function renderGallery(args, mods) {
    const { data, file, filesIndex, filesLen } = args;
    let out = [];
    if (data['gallery']?.['directory']) {
        data.gallery = await processGallery(data.gallery);
        out.push(data.gallery);
    }
    if (data['ogImage'] && !data['ogImage'].includes('://')) {
        out.push(await cropImage(data.ogImage, data));
    }
    if (data['page']?.['image']) {
        if (Array.isArray(data.page.image)) {
            data.page.image.forEach(async img => {
                const item = await cropImage(img, data);
                out.push(item);
            });
        } else {
            out.push(await cropImage(data.page.image, data));
        }
    }
    if (runtime['SEARCH_GALLERY']) {
        const image = mods['search']?.['out']?.['image'] || '';
        if (image) {
            out.push(await cropImage(image, { gallery: runtime['SEARCH_GALLERY'] }));
        }
    }
    return { key: 'gallery', out };
}

module.exports = renderGallery;

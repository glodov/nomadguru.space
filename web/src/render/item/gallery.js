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
    const images = [];

    if (runtime['SEARCH_GALLERY']) {
        const image = mods['search']?.['out']?.['image'] || '';
        if (image) {
            out.push(await cropImage(image, { gallery: runtime['SEARCH_GALLERY'] }));
        }
    }

    async function findImagesRecursive(obj) {
        for (const key in obj) {
            if (key === 'image') {
                if (Array.isArray(obj[key])) {
                    obj[key].forEach(async img => {
                        const item = await cropImage(img, data);
                        out.push(item);
                    });
                } else {
                    const item = await cropImage(obj[key], data);
                    out.push(item);
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                findImagesRecursive(obj[key]);
            }
        }
    }

    await findImagesRecursive(data['page']);
    return { key: 'gallery', out };
}

module.exports = renderGallery;

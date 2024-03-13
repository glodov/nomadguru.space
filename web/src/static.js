const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const zlib = require('zlib');
const { removeQueryParams } = require('./data');
const { decodeUri } = require('./url');
const { utils } = require('./ejs/utils');
const { runtime } = require('./runtime');
const { findAllFiles, ensureDirectory } = require('./fs');

const ALLOWED_GALLERY_EXTENSIONS = ['png', 'avif', 'webp', 'jpg', 'jpeg', 'gif', 'svg', 'embed.html'];
const ALLOWED_ORIGINAL_IMAGE_EXTENSIONS = ['png', 'bmp', 'jpg', 'jpeg', 'webp'];
const ALLOWED_IMAGES_TO_CROP = ['jpg', 'jpeg', 'avif', 'webp', 'png', 'gif', 'svg'];
const SHARP_JPEG_EXTENSIONS = ['jpg', 'jpeg'];
const SHARP_WEBP_EXTENSIONS = ['webp'];

function findOriginalFilePath(filePath, possibleExtensions) {
    const ext = utils.extension(filePath);
    const baseFilePath = filePath.slice(0, filePath.length - ext.length - 1);
    // const baseFilePath = filePath.replace(/\.[^/.]+$/, ""); // Remove the extension
    for (let ext of possibleExtensions) {
        const testPath = `${baseFilePath}.${ext}`;
        if (fs.existsSync(testPath)) {
            return testPath;
        }
    }
    return null; // Or handle it as you see fit
}

// Serve static files from `./css/**`, `./js/**`, `./img/**`
async function serveStaticFile(req, res, staticSlugs = [], staticPath = './public/') {
    // Regex pattern to match the special image URL format
    // Windows invalid characters: <, >, :, ", /, \, |, ?, *.
    // MacOS: :, /
    // Linux: \0, /
    const filePath = removeQueryParams(decodeUri(req.url));
    let found = false;
    for (const slug of staticSlugs) {
        if (filePath.startsWith(slug)) {
            found = true;
            break;
        }
    }
    if (!found) return false;

    const staticFilePath = path.join(staticPath, filePath);
    const ext = utils.extension(filePath);
    const isImage = 'image' === getMimeType(ext, true);
    // Check if the file exists and if it matches the image pattern
    if (fs.existsSync(staticFilePath)) {
        if (!isImage && /\.(txt|json)$/.test(staticFilePath)) {
            fs.readFile(staticFilePath, (err, data) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                    return;
                }

                zlib.gzip(data, (err, compressed) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('Internal Server Error');
                        return;
                    }

                    const type = staticFilePath.endsWith('.json') ? 'application/json' : 'text/plain';
                    res.writeHead(200, {
                        'Content-Encoding': 'gzip',
                        'Content-Type': `${type}; charset=utf-8`,
                        'Content-Length': compressed.length
                    });
                    res.end(compressed);
                });
            });
        } else {
            serveFile(res, staticFilePath);
        }
    } else if (isImage) {
        await cropFileResponse(req, res, staticFilePath);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
    return true;
}

function decodeImagePattern(imagePattern) {
    let aspectRatioWidth, aspectRatioHeight;
    let position;
    let maxWidth, maxHeight;
    let quality;
    const matches = imagePattern.split('-');
    matches.forEach(m => {
        if (['center', 'start', 'end'].includes(m)) {
            return position = m;
        }
        if (Number.isInteger(parseInt(m))) {
            if (aspectRatioWidth) return aspectRatioHeight = parseInt(m);
            return aspectRatioWidth = parseInt(m);
        }
        const qualityPattern = /^q(\d+)$/;
        let found = m.match(qualityPattern);
        if (found) return quality = parseInt(found[1]);
        const maxPattern = /^(w|h)(\d+)(px)$/;
        found = m.match(maxPattern);
        if (found) {
            if ('w' === found[1]) return maxWidth = parseInt(found[2]);
            return maxHeight = parseInt(found[2]);
        }
    });
    return { aspectRatioWidth, aspectRatioHeight, position, maxWidth, maxHeight, quality };
}

async function cropFile(staticFilePath, imagePattern = '') {
    return new Promise(async (resolve, reject) => {
        let origFilePath;
        const imageExtension = utils.extension(staticFilePath);
        const isResized = staticFilePath.includes('@');
        const properPattern = isResized ? staticFilePath.split('@')[1].replace(/\.([^\.]+)$/, '') : imagePattern;
        if (!properPattern && !isResized) {
            if (!fs.existsSync(staticFilePath)) {
                // try to convert from original image
                origFilePath = findOriginalFilePath(staticFilePath, ALLOWED_ORIGINAL_IMAGE_EXTENSIONS);
            } else {
                // nothing to do
                return resolve({ orig: staticFilePath, file: null, cached: false });
            }
        }
        let {
            aspectRatioWidth, aspectRatioHeight, position,
            maxWidth, maxHeight, quality
        } = decodeImagePattern(properPattern);
        if (isResized) {
            try {
                origFilePath = origFilePath || staticFilePath.replace('@' + properPattern, '');
                if (runtime['GALLERY_THUMB_DIR']) {
                    const relPath = path.relative(runtime['STATIC_DIR'], staticFilePath);
                    staticFilePath = path.join(runtime['GALLERY_THUMB_DIR'], relPath);
                }
                if (!fs.existsSync(origFilePath)) {
                    origFilePath = findOriginalFilePath(origFilePath, ALLOWED_ORIGINAL_IMAGE_EXTENSIONS);
                }
                if (fs.existsSync(staticFilePath)) {
                    return resolve({ orig: origFilePath, file: staticFilePath, cached: true });
                }
            } catch (error) {
                return reject(`Incorrect image suffix ${error}`);
            }
        } else {
            origFilePath = origFilePath || staticFilePath;
            if (!fs.existsSync(origFilePath)) {
                origFilePath = findOriginalFilePath(origFilePath, ALLOWED_ORIGINAL_IMAGE_EXTENSIONS);
            }
            staticFilePath = staticFilePath.slice(0, staticFilePath.length - imageExtension.length - 1);
            staticFilePath += (imagePattern ? ('@' + imagePattern) : '') + '.' + imageExtension;
            if (imagePattern && runtime['GALLERY_THUMB_DIR']) {
                const relPath = path.relative(runtime['STATIC_DIR'], staticFilePath);
                staticFilePath = path.join(runtime['GALLERY_THUMB_DIR'], relPath);
            }
            if (fs.existsSync(staticFilePath)) {
                return resolve({ orig: origFilePath, file: staticFilePath, cached: true });
            }
        }
        if (!ALLOWED_IMAGES_TO_CROP.includes(imageExtension.toLowerCase())) {
            return reject(`${imageExtension} is not supported by cropFile() function`);
        }
        if (!origFilePath && staticFilePath && fs.existsSync(staticFilePath)) {
            return resolve({ orig: staticFilePath, file: staticFilePath, cached: true });
        }
        if (!origFilePath) {
            return reject(`Cannot find orig for ${staticFilePath}`);
        }
        if (!fs.existsSync(origFilePath)) {
            return reject(`File does not exist ${origFilePath}`);
        }
        let res;
        try {
            res = await getOriginalDimensions(origFilePath);
        } catch (error) {
            return reject(`Cannot read dimensions of ${origFilePath}`);
        }
        const { width, height } = res;
        let aspectRatio;
        if (aspectRatioHeight && aspectRatioWidth) {
            aspectRatio = aspectRatioWidth / aspectRatioHeight;
        } else {
            if (maxHeight && maxWidth) {
                aspectRatio = maxWidth / maxHeight;
            } else {
                aspectRatio = width / height;
            }
        }
        let $img = sharp(origFilePath);
        if (!maxWidth && !maxHeight) {
            maxWidth = width;
            maxHeight = Math.floor(width / aspectRatio);
        } else if (!maxWidth) {
            maxWidth = Math.floor(maxHeight * aspectRatio);
        } else if (!maxHeight) {
            maxHeight = Math.floor(maxWidth / aspectRatio);
        }

        let resizeOptions = {
            width: maxWidth,
            height: maxHeight,
            fit: sharp.fit.cover,
            position: position,
            withoutEnlargement: true
        };
        $img.resize(resizeOptions);

        if (SHARP_JPEG_EXTENSIONS.includes(imageExtension) && quality) {
            $img = $img.jpeg({ quality });
        }
        if (SHARP_WEBP_EXTENSIONS.includes(imageExtension)) {
            $img = $img.webp({ quality: quality || 72, alphaQuality: 81, lossless: false, effort: 6 });
        }
        ensureDirectory(path.dirname(staticFilePath));
        $img.toFile(staticFilePath, (err, info) => {
            if (err) {
                reject(err);
            } else {
                resolve({ orig: origFilePath, file: staticFilePath, cached: false });
            }
        });
    });
}

async function cropImage(img, data) {
    let file = path.join(runtime.STATIC_DIR, 'string' === typeof img ? img : img['$src']);
    if (data['gallery']?.['alwaysWEBP']) {
        file = file.replace(/\.([^\.]+)$/, '.webp');
    }
    try {
        let res = await cropFile(file);
        if (data['gallery'] && data['gallery']['thumb'] && res && res['orig']) {
            let orig = res.orig;
            if (data['gallery']?.['alwaysWEBP']) {
                orig = orig.replace(/\.([^\.]+)$/, '.webp');
            }
            res = await cropFile(orig, data.gallery.thumb);
        }
        return res;
    } catch (err) {
        console.error(`Cannot crop file ${file}\n > ${err}\n`);
    }
    return false;
}

async function cropFileResponse(req, res, staticFilePath, imagePattern) {
    try {
        const { orig, file } = await cropFile(staticFilePath, imagePattern);
        const filePath = file || orig;
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        serveFile(res, filePath);
    } catch (error) {
        console.error("Error processing image:", error);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error: ' + error);
    }
}

function serveFile(res, filePath) {
    const contentType = getMimeType(filePath.split('.').pop());
    res.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
    fs.createReadStream(filePath).pipe(res);
}

function getOriginalDimensions(filePath) {
    // Return a promise that resolves with the dimensions of the image
    return new Promise((resolve, reject) => {
        sharp(filePath)
            .metadata()
            .then(metadata => {
                resolve({
                    width: metadata.width,
                    height: metadata.height
                });
            })
            .catch(error => {
                reject(error);
            });
    });
}

// Function to get mime type based on file extension
function getMimeType(fileExtension, onlyGroup = false) {
    const mimeTypes = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'avif': 'image/avif',
        'webp': 'image/webp',
        'eot': 'application/vnd.ms-fontobject',
        'svg': 'image/svg+xml',
        'ttf': 'font/ttf',
        'woff': 'font/woff',
        'mp4': 'video/mp4',
        'embed.html': 'video/youtube'
        // Add more mime types as needed
    };

    const mime = mimeTypes[fileExtension.toLowerCase()] || 'application/octet-stream';
    return onlyGroup ? mime.split('/')[0] : mime;
}

/*
gallery = {
    items: [ { src, alt? } ],
    mode?: "slider",
    resolution?: "{aspectRatioWidth}-{aspectRatioHeight}-{position:center|start|end}-{max:(w|h)([0-9]+)(px)}-{quality:(q)([0-9]+)}",
    thumb?: "{aspectRatioWidth}-{aspectRatioHeight}-{position:center|start|end}-{max:(w|h)([0-9]+)(px)}-{quality:(q)([0-9]+)}",
    // Example: 19-10-start-h900px-q60
    // aspectRatioWidth : 19
    // aspectRatioHeight: 10
    // position: start
    // max height: 900px
    // quality for jpeg: 60
    // Possible values
    // position: north, northeast, east, southeast, south, southwest, west, northwest, center or centre
}
*/
async function processGallery(gallery) {
    if (Array.isArray(gallery)) {
        return gallery;
    }
    if (gallery['directory'] && runtime['STATIC_DIR']) {
        const dir = path.join(runtime.STATIC_DIR, gallery.directory);
        const images = findAllFiles(dir, /\.(png|avif|webp|jpg|jpeg|svg|mp4|embed\.html)$/i, /\@/);
        const result = [];
        for (const img of images) {
            const ext = utils.extension(img);
            const mime = getMimeType(ext);
            const type = mime.split('/')[0];
            if (!ALLOWED_GALLERY_EXTENSIONS.includes(ext)) {
                result.push({ src: '/' + path.relative(runtime.STATIC_DIR, img), type, mime });
                continue;
            }
            if ('embed.html' === ext) {
                const html = fs.readFileSync(img).toString();
                const matches = html.match(/src="([^\"]+)"/);
                const src = matches && matches[1] ? matches[1] : null;
                result.push({ src, html, type, mime });
                continue;
            }
            const { file, orig, cached } = await cropFile(img, gallery['resolution'] || 'h300px');
            let thumb;
            if (gallery['thumb']) {
                const res = await cropFile(img, gallery['thumb']);
                thumb = res.file;
            }
            if (!cached) {
                console.log(
                    'Converted image from',
                    path.relative(runtime.STATIC_DIR, orig),
                    '>>',
                    path.relative(runtime.STATIC_DIR, file)
                );
                if (thumb) console.log('>>>', path.relative(runtime.STATIC_DIR, thumb));
            }
            result.push({
                src: '/' + path.relative(runtime.STATIC_DIR, file),
                thumb: thumb ? ('/' + path.relative(runtime.STATIC_DIR, thumb)) : null,
                orig: orig ? ('/' + path.relative(runtime.STATIC_DIR, orig)) : null,
                type,
                mime
            });
        }
        gallery.items = result;
    }
    return gallery;
}

module.exports = {
    serveStaticFile,
    getMimeType,
    cropFile,
    cropImage,
    processGallery
};

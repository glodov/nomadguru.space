const minify = require('html-minifier').minify;

function minifyHTML(args, mods) {
    if (mods['html']?.['cached']) return args;
    const html = mods['html']['out'];
    args.out = minify(html, {
        removeAttributeQuotes: true,
        collapseWhitespace: true,
        removeComments: true,
        minifyJS: true,
        minifyCSS: true
    });
    return args;
}

module.exports = minifyHTML;
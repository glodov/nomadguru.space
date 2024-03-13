const path = require('node:path');

const STATIC_ALLOWED = [
    '/favicon/',
    '/search/',
    '/css/',
    '/js/',
    '/img/',
    '/images/',
];

const NW_MODULES = [
    'nw/edit',
];

const RENDER_PROCESS = {
    public: {
        item: [
            'search',
            'gallery', // gallery after search to render search thumbs
            'htaccess',
            'robotsTXT',
            'sitemapXML',
            'translations',
            'html',
        ],
        html: [
            'scripts',
            'styles',
            'emails',
            'links',
            'minify',
            'save',
        ],
        final: [
            'broken'
        ],
    },
    private: {
        item: [
            'gallery',
            'html',
        ],
        html: [],
        final: [],
    },
    search: { item: ['search'] },
    index: { item: ['sitemapXML'] },
};

const ALLOWED_ENV = {
    public: [
        'GOOGLE_API_KEY',
    ],
    private: [
        'GOOGLE_API_KEY',
    ]
}

const isStatic = (file) => {
    for (let rule of STATIC_ALLOWED) {
        if (rule.endsWith('/') && file.startsWith(rule)) {
            return true;
        } else if (rule === file) {
            return true;
        }
    }
    return false;
};

module.exports = {
    HOST: 'https://nomadguru.yaro.page',
    SERVER_PORT: 3033,
    ROOT_DIR: path.resolve(__dirname, '.'),
    DATA_DIR: path.resolve(__dirname, '../data/'),
    VIEWS_DIR: path.resolve(__dirname, './views/'),
    THEMES_DIR: path.resolve(__dirname, './themes/'),
    STATIC_DIR: path.resolve(__dirname, './public/'),
    GALLERY_THUMB_DIR: path.resolve(__dirname, './public/thumb/'),
    LOGS_DIR: path.resolve(__dirname, './logs/'),
    MODULES_PUBLIC_DIR: path.resolve(__dirname, './public/modules/'),
    STATIC_ALLOWED,
    DIST_DIR: path.resolve(__dirname, './dist/'),
    NANO_DIR: path.resolve(__dirname, './.nw/'),
    NWE_DIR: path.resolve(__dirname, './nw/'),
    ARCHIVE_DIR: path.resolve(__dirname, './.nw/'),
    SEARCH_GALLERY: {
        thumb: '4-3-h300px-q90',
        alwaysWEBP: false
    },
    SEARCH_INDEX_CATS: [
    ],
    PUBLISH_ARCHIVE_META: path.resolve(__dirname, './.nw/publish.archive.meta.yaml'),
    TICKER_INTERVAL: 100,
    RENDERING_DEBOUNCE: 100,
    MEMORY_DANGER_USE: 256 * 1024 * 1024,
    NW_MODULES,
    RENDER_PROCESS,
    ALLOWED_ENV,
    isStatic
}

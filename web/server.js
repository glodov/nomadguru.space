const path = require('node:path');
const http = require('node:http');
const cron = require('node-cron');
const { loadAllData, detectLang } = require('./src/data');
const { decodeUri } = require('./src/url');
const { serveStaticFile } = require('./src/static');
const { runtime } = require('./src/runtime');
const { state, setDebounced, getMemoryUsage, print, logError, NANO } = require('./src/cli');
const { loadEverything, renderFile, readData, processModules } = require('./src/render/core');
const { handleAction } = require('./src/server/action');
const { handleEditor } = require('./src/server/editor');
const {
    SERVER_PORT, ROOT_DIR, DATA_DIR, THEMES_DIR, LOGS_DIR, MODULES_PUBLIC_DIR,
    STATIC_DIR, STATIC_ALLOWED, GALLERY_THUMB_DIR, TICKER_INTERVAL, 
    RENDERING_DEBOUNCE, MEMORY_DANGER_USE, NW_MODULES, NANO_DIR, RENDER_PROCESS,
    ALLOWED_ENV, HOST, NWE_DIR
} = require('./config');

require('dotenv').config();

runtime.ROOT_DIR = ROOT_DIR;
runtime.DATA_DIR = DATA_DIR;
// runtime.VIEWS_DIR = VIEWS_DIR;
runtime.STATIC_DIR = STATIC_DIR;
runtime.GALLERY_THUMB_DIR = GALLERY_THUMB_DIR;
runtime.LOGS_DIR = LOGS_DIR;
runtime.MODULES_PUBLIC_DIR = MODULES_PUBLIC_DIR;
runtime.MEMORY_DANGER_USE = MEMORY_DANGER_USE;
runtime.VIEWS_DIR = THEMES_DIR;
runtime.NANO_DIR = NANO_DIR;
runtime.RENDER_PROCESS = RENDER_PROCESS;
runtime.ALLOWED_ENV = ALLOWED_ENV['private'];
runtime.NWE_DIR = NWE_DIR;
runtime.HOST = HOST;

const { errors, dataFiles, allSorted, all, refers, $extends, langs, cats, globalUris, addon } = loadEverything();
addon['$rendering'] = false;
const renderModules = runtime['RENDER_PROCESS']?.['private'] || {};
const renderOptions = { all, refers, $extends, langs, cats, globalUris, addon, renderModules, filesIndex: 0, filesLen: 0 };

const processInputs = [];
let processInput;
process.stdin.setEncoding('utf8');
process.stdin.on('readable', async function() {
    let chunk;
    processInput = '';
    while ((chunk = process.stdin.read()) !== null) processInput += chunk;
    processInputs.push(input);
});

// Handle different routes of request URI and render templates
const handleRequest = async (req, res) => {
    ticker();
    console.log('');
    let firstError;
    let secondError;
    if (req.url && req.url.startsWith('/nw/')) {
        return handleEditor(req, res, renderOptions);
    }
    if (req.url && req.url.endsWith('.php')) {
        return handleAction(req, res, renderOptions);
    }
    try {
        const current = decodeUri(req.url).slice(1).replace(/\.html$/, '.yaml') || 'index';
        const file = path.join(DATA_DIR, current);

        const args = { current, file, ...renderOptions };
        const { data, deps } = readData({ ...args, current, ...addon });
        if (processInput) {
            console.log(`${processInput}:`, data[processInput]);
        }
        if (data['$theme']) {
            runtime['$theme'] = data['$theme'];
        }
        const mod = await processModules(args.renderModules, { ...args, data, deps });
        print(`${current} ${NANO} ${path.relative(runtime['ROOT_DIR'], mod['html']?.['templateFile'])}`, "\n");
        if (!mod['html']?.['out']) {
            throw new Error(`Nothing is rendered for ${current}`);
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(mod.html.out);
        return;
    } catch (err) {
        firstError = err;
    }
    try {
        const global = loadAllData(DATA_DIR);
        const lang = detectLang(req.url, global['langs']);
        let uri = '/404.html';
        if (lang && global['langs'] && global['langs'][0].code !== lang) {
            uri = `/${lang}${uri}`;
        }
        console.log(firstError.stack);
        const error = firstError.toString().replaceAll(ROOT_DIR, '').trim();
        const current = uri.slice(1).replace(/\.html$/, '.yaml');
        const file = path.join(DATA_DIR, current);
        const options = { ...renderOptions, addon: { ...renderOptions.addon, error } };
        const mod = await renderFile({ current, file, ...options });
        // const { output, verbose } = await renderUri(uri, DATA_DIR, THEMES_DIR, data, true);
        // if (verbose.length) {
        //     print(verbose.join("\n"), '\n');
        // }
        if (!mod['html']?.['out']) {
            throw new Error(`Nothing is rendered for ${current}`);
        }
        res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(mod.html.out);
        return;
    } catch (err) {
        secondError = err;
    }
    console.error('Error 1st:', firstError);
    console.error('Error 2nd:', secondError);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not Found\n${firstError}\n\n${secondError}`);
};

let isTickerLast = false;
state.rendering = false;
state.RENDERING_DEBOUNCE = RENDERING_DEBOUNCE;
const server = http.createServer(async (req, res) => {
    if (isTickerLast) print('', '\n');
    state.rendering = true;
    try {
        if (await serveStaticFile(req, res, STATIC_ALLOWED, STATIC_DIR)) {
            setDebounced('rendering', false);
            isTickerLast = false;
            return;
        }
    } catch (err) {
        console.error(err);
        setDebounced('rendering', false);
        isTickerLast = false;
        return;
    }
    handleRequest(req, res);
    setDebounced('rendering', false);
    isTickerLast = false;
});

NW_MODULES.forEach(moduleFile => {
    try {
        const module = require('./src/' + moduleFile);
        if (!module['cronjob']) return;
        const job = module.cronjob;
        const expression = job['expression'];
        const fn = job['fn'];
        const options = job['options'] || {};
        const task = cron.schedule(expression, fn, options);
        if (job['task']) job.task.apply(this, [task]);
        if (job['runtime']) job.runtime.apply(this, [runtime]);
    } catch (err) {
        logError(err, path.join(runtime.LOGS_DIR, 'server.log'));
        console.error(err);
    }
});

const ticker = async () => {
    if (state['rendering']) return;
    if (isTickerLast) process.stdout.write('\r');
    const time = new Date(Date.now());
    const formattedTime = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')} ${time.getFullYear()}-${(time.getMonth() + 1).toString().padStart(2, '0')}-${time.getDate().toString().padStart(2, '0')}`;
    const info = getMemoryUsage();
    info.unshift(formattedTime);
    print(info.join(` ${NANO} `), '');
    isTickerLast = true;
};

// Start the server
const port= process.env.PORT || SERVER_PORT;
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

// const tickerInterval = setInterval(ticker, TICKER_INTERVAL);
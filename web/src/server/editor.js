const { readData } = require('../render/core');
const { formatMemoryUsage, print, spent, mem, NANO } = require('../cli');
const { runtime } = require('../runtime');

const handleEditor = async (req, res, renderOptions) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const uri = url.searchParams.get('uri');
    if (!url.pathname.startsWith('/nw/')) {
        throw new Error(`Incorrect editor path: ${url.pathname}`);
    }
    const checkpoint = Date.now();
    try {
        const name = url.pathname.startsWith('/') ? url.pathname.slice(1)
                   : url.pathname;
        const module = require('../' + name);
        const current = uri.replace(/\.html$/, '.yaml').replace(/^\/+/g, '');
        const file = path.join(runtime['DATA_DIR'], current);

        const args = { current, file, ...renderOptions };
        const { data, loaded, deps } = readData(args, true);

        const editorArgs = { ...args, loaded, deps, url };
        const output = await module.editor.apply(
            this, [uri, url.pathname, data, editorArgs]
        );
        const json = JSON.stringify(output);
        const size = formatMemoryUsage(Buffer.byteLength(json, 'utf-8'));
        print(`${uri} [${name}] ${NANO} ${spent(checkpoint)}sec ${NANO} ${mem()} >> ${size}`, "\n");
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(json);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify(err));
    }
};

module.exports = {
    handleEditor
};
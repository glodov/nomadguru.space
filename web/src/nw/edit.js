const { join } = require('node:path');
const { runtime } = require('../runtime');
const { nwFileUri } = require('../render/vars');
const { loadYAML } = require('../fs');

const schema = loadYAML(join(runtime['NWE_DIR'], 'nanoweb.schema.yaml'));

/**
 * @depend
 */
function editor(uri, moduleUri, data = {}, args = {}) {
    return {
        data,
        deps: args.deps,
        loaded: args.loaded,
        schema,
    };
}

module.exports = {
    cronjob: false,
    editor
};
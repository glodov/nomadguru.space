function references(args) {
    const { data, all, deps } = args;
    const res = { key: 'references', out: null };
    if (!data['files'] || !Array.isArray(data['files'])) return res;
    let files = [];
    let changed = false;
    for (let file of data['files']) {
        if (file['$ref']) {
            const [ uri, ids ] = file['$ref'].split(':');
            const yamlUri = uri.slice(1) + '.yaml';
            if (!deps.includes(yamlUri)) deps.push(yamlUri);
            const p = all[yamlUri]?.['data'];
            if (p && p['directory']) {
                for (const f of p['directory']) {
                    if (!f['files']) continue;
                    for (const id of ids.split(';')) {
                        if (f.id.startsWith(id)) {
                            if (file['name']) {
                                files = [...files, ...f.files.map(el => ({ ...el, name: file.name }))];
                            } else {
                                files = [...files, ...f.files];
                            }
                        }
                    }
                }
            } 
            changed = true;
        } else {
            files.push(file);
        }
    }
    if (changed) data['files'] = files;
    let out = null;
    return { key: 'references', out };
}

module.exports = references;
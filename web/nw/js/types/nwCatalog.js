(() => {
    const HOME_IN_PATH = false;
    const paths = {};
    const html = window.nwCreateHTML;
    const l = window.nwL;
    let isOpen = false;
    let $path; // path element in read section. required here to update on edit.
    const $events = {
        onChange: () => {},
        onCancel: () => {}
    };

    function buildTree(obj, currentValue) {
        const root = {};
        Object.keys(obj).forEach(path => {
            let currentLevel = root;
            path.split('/').forEach((part, index, parts) => {
                if (!currentLevel[part]) {
                    const value = parts.join('/');
                    currentLevel[part] = {
                        label: index === parts.length - 1 ? obj[path] : undefined,
                        active: value === currentValue,
                        value,
                        children: {}
                    };
                }
                currentLevel = currentLevel[part].children;
            });
        });
        return root;
    }

    function generateList(tree) {
        const $ul = html('ul', { class: 'nwe-tree list-group' });
        Object.entries(tree).forEach(([key, value]) => {
            const $li = html('li', {
                class: `list-group-item list-group-item-action ${value.active ? 'active' : ''}`,
                value: key,
                nwe: value.value,
                tabindex: 0
            }, value['label'] || key);
            $ul.appendChild($li);
            if (Object.keys(value.children).length) {
                $li.appendChild(generateList(value.children));
            }
        });
        return $ul;
    }
    
    function path(value, all, divider = ' / ') {
        if (!paths[value]) {
            const result = [];
            const words = value.split('/');
            if (HOME_IN_PATH) words.unshift('');
            for (let i = 1; i <= words.length; i++) {
                let slug = words.slice(0, i).join('/');
                if ('' === slug) slug = 'index';
                const uri = slug.replace(/^\/+/, '') + '.yaml';
                if (all[uri]) {
                    const str = all[uri]['category'] || all[uri]['title'] || uri
                    const url = uri.replace(/\.yaml$/, '.html');
                    result.push(window.nwTypes['a'].read({ field: 'url', item: { url, text: str } }));
                }
            }
            paths[value] = result;
        }
        return paths[value];
    }

    function renderPath(value, args) {
        const { data } = args;
        const all = data['all'] || {};
        const $l = data['$l'] || {};
        const valuePath = path(value, all);
        let $html = '';
        if (valuePath) {
            $html = html('span', {
                class: 'btn-group', role: 'group', 'aria-label': l('Catalog path', $l)
            }, valuePath, true)
        } else {
            $html = html('i', {}, 'empty');
        }
        if ($path instanceof HTMLElement) {
            $path.parentElement.replaceChild($html, $path);
        }
        $path = $html;
        return $path;
    }

    function read(args) {
        const { item, field, data, rule } = args;
        const value = item[field];
        const $div = html('div', { class: 'value' });
        const $label = html('label', { class: 'form-label' }, rule['title']);
        $div.appendChild($label);
        renderPath(value, args);
        $div.appendChild($path);
        $div.addEventListener('click', window.nwTypes.nwComponent.allowLinksOnClick);
        return $div;
    }

    function onLeafClick(event, args) {
        event.preventDefault();
        event.stopPropagation();
        const path = [this.getAttribute('value')];
        window.nwFindAllParents(this, '[value]', args['$aside'] || document.body).forEach($li => {
            path.unshift($li.getAttribute('value'));
        });
        const uri = path.join('/');
        args['item'] = uri;
        renderPath(uri, args);
        window.nwEditor.index.change(uri, args, $path);
        isOpen = false;
        $events['onChange'].apply(this, [uri]);
    }

    function edit(args, event, onChange, onCancel) {
        $events['onChange'] = onChange;
        $events['onCancel'] = onCancel;
        isOpen = !isOpen;
        if (!isOpen) {
            return false;
        }
        const $element = generateList(buildTree(args.data['categories'] || {}, args['item']));
        $element.querySelectorAll('[value]').forEach($li => $li.addEventListener('click', function (event) {
            onLeafClick.apply(this, [event, args]);
        }));
        return { $element, onAttach: () => {} };
    }

    if (!window.nwTypes) window.nwTypes = {};
    window.nwTypes.nwCatalog = {
        $name: 'nwCatalog',
        read,
        path,
        edit,
    };
})();
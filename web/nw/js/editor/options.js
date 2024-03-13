(() => {
    const html = window.nwCreateHTML;
    const copy = window.nwCopy;
    const context = {};
    function getChanges(args) {
        const result = [];
        const changes = (args.input['$changes'] || {});
        for (const uri in changes) {
            const found = (args['loaded'] || []).filter(l => l.uri === uri);
            if (found.length) {
                for (const name in changes[uri]) {
                    if (found[0]['data'][name] !== changes[uri][name]) {
                        result.push({ uri, name, value: changes[uri][name] });
                    }
                }
            }
        }
        return result;
    }
    function renderFooter(args, $footer) {
        if (!$footer) {
            if (window.nwIsDebugMode()) console.error('Footer not found');
            return false;
        }
        const changes = getChanges(args);
        if (changes.length) {
            $footer.classList.add('has-changes');
        } else {
            $footer.classList.remove('has-changes');
        }
        $footer.querySelectorAll('[nwe="changes.length"]').forEach(c => {
            const $btn = window.nwFindParent(c, '.btn');
            if ($btn) {
                if (changes.length) $btn.classList.remove('disabled'); else $btn.classList.add('disabled');
            }
            c.innerText = changes.length;
        });
    }

    function renderChanges(changes, data) {
        console.log(changes);
    }
    function renderMain(args) {
        const { input, loaded, schema, data } = args;
        const $ul = html('ul', { class: 'list-group' });
        (input['loaded'] || []).forEach(inputUri => {
            const vars = loaded.filter(({ uri }) => inputUri === uri);
            let definedVars = [];
            const missing = [];
            (schema || []).forEach(rule => {
                definedVars = vars.filter(({ data: item }) => 'undefined' !== typeof item[rule['name']]);
                definedVars.forEach(({ uri, data: item }) => {
                    const changeClass = hasChange(uri, { ...args, field: rule['name'] }) ? 'has-change' : '';
                    const nwType = window.nwTypes[rule['type']] || window.nwTypes['nwComponent'] || null;
                    if (!nwType) {
                        missing.push({ uri, item });
                        console.error('Cannot find a nan•web type in rule', rule);
                        return;
                    }
                    const nwElement = {
                        field: rule['name'],
                        item: Object.assign({}, item, input['$changes']?.[uri] || {}),
                        data,
                        rule,
                        input
                    };
                    const $el = nwType.read.apply(this, [nwElement, true]);
                    const $div = html('div', {}, $el, true);
                    const $li = html('li', {
                        class: `list-group-item list-group-item-action ${rule['type']} ${changeClass}`,
                        nwe: rule['name'],
                        uri,
                        tabindex: 0
                    }, $div, true);
                    $ul.appendChild($li);
                });
            });
            missing.forEach(({ uri, item }) => {
                Object.entries(item).forEach(([field, value]) => {
                    const $em = html('em', {}, `${field}: ${value}`);
                    const $li = html('li', { class: 'list-group-item disabled', 'aria-disabled': 'true' }, $em, true);
                    $ul.appendChild($li);
                });
            });
            console.log(missing);
        });
        return html('main', {}, $ul, true);
    }
    function attachMainEvents($main, args) {
        const { data } = args;
        $main.querySelectorAll('[nwe]').forEach($li => {
            const field = $li.getAttribute('nwe');
            if ('undefined' === typeof data[field]) {
                console.error(`Field ${field} not found`);
                return;
            }
            $li.addEventListener('click', (event) => onOptionClick(event, { ...args, field }));
        });
        $main.addEventListener('keydown', function(event) {
            if (event.key === '2' && context['$editor']) {
                context['$editor'].focus();
            }
            if (event.key === '3' && context['$loaded']) {
                context['$loaded'].focus();
            }
        });
    }
    function renderAside(args) {
        const { loaded, input } = args;
        const $editor = html('section', { class: 'nw-editor', nwe: 'options.editor' });
        context['$editor'] = $editor;
        const $loaded = html('select', { class: 'form-select', nwe: 'options.loaded', multiple: 'true' });
        context['$loaded'] = $loaded;
        loaded.forEach(({ uri }, i) => { 
            let selected = loaded.length - 1 === i;
            if (input['loaded']) selected = input.loaded.includes(uri);
            const $option = html('option', { value: uri }, uri.slice(0, uri.length - '.yaml'.length));
            if (selected) $option.setAttribute('selected', true);
            $loaded.appendChild($option);
        });
        return html('aside', { class: 'nw-loaded' }, [$editor, $loaded], true);
    }
    function attachAsideEvents($aside, args) {
        $aside.querySelectorAll('[nwe]').forEach(el => {
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
                el.addEventListener('change', (event) => onAsideChange(event, args));
            }
        });
        $aside.querySelectorAll('[nwe="options.loaded"]').forEach($l => $l.addEventListener('keydown', function(event) {
            if (event.key === '1' && context['$main']) {
                const first = context['$main'].querySelector('[nwe]');
                if (first) first.focus();
            }
            if (event.key === '2' && context['$editor']) {
                const first = context['$editor'].querySelector('[nwe]');
                if (first) first.focus();
            }
        }));
        $aside.querySelectorAll('[nwe="options.editor"]').forEach($l => $l.addEventListener('keydown', function(event) {
            if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
            if (event.key === '1' && context['$main']) {
                const first = context['$main'].querySelector('[nwe]');
                if (first) first.focus();
            }
            if (event.key === '3' && context['$loaded']) {
                context['$loaded'].focus();
            }
        }));
    }

    function renderView(args) {
        let { $body } = args;
        if (!args['input']) args['input'] = {};
        $body.innerHTML = '';
        const $aside = renderAside(args);
        $body.appendChild($aside);
        attachAsideEvents($aside, args);
        $aside.querySelectorAll('[nwe="options.loaded"]').forEach(a => a.dispatchEvent(new Event('change')));
        context['$aside'] = $aside;
        return { $body, $aside };
    }

    function onAsideChange(event, args) {
        const { data, $body, $modal } = args;
        const elem = event.currentTarget;
        if (!args['input']) args['input'] = {};
        const [view, field] = elem.getAttribute('nwe').split('.');
        if (elem.tagName === 'SELECT' && elem.multiple) {
            // Initialize an array to hold the values of selected options
            args['input'][field] = Array.from(elem.selectedOptions).map(option => option.value);
        } else {
            // For other input types or single-value selects
            args['input'][field] = elem.value;
        }
        renderChanges(args['input'], data);
        let focused = null;
        if (document.activeElement) focused = document.activeElement.getAttribute('nwe');
        const $main = renderMain(args);
        context['$main'] = $main;
        const $old = $body.querySelector('main');
        if ($old) {
            $body.replaceChild($main, $old);
        } else {
            $body.prepend($main);
        }
        attachMainEvents($main, args);

        if (focused) {
            focused = $body.querySelector(`[nwe="${focused}"]`);
        } else {
            focused = $main.querySelector('[nwe]');
        }
        if (focused) {
            if (!focused.hasAttribute('tabindex')) focused.setAttribute('tabindex', '0');
            $modal.addEventListener('shown.bs.modal', () => focused.focus());
            // setTimeout(() => focused.focus(), 600);
        }
    }

    function renderEditor(element, args, onOk = () => {}) {
        const { $body } = args;
        $body.querySelectorAll('aside section.nw-editor').forEach(ed => {
            ed.innerHTML = '';
            if (element) {
                ed.appendChild(element);
                const active = ed.querySelector('.active');
                if (active) {
                    active.focus();
                    window.nwScrollTo(active);
                }
            }
        });
    }

    function collectItem(uri, args) {
        const { data, field } = args;
        let item = copy(data[field]);
        // set item for the specific uri
        (args['loaded'] || []).filter(l => l.uri === uri).forEach(l => {
            if ('undefined' !== typeof l['data']?.[field]) {
                item = l['data'][field];
            }
        });
        // set item for the selected value
        if ('undefined' !== typeof args['input']?.['$changes']?.[uri]?.[field]) {
            item = copy(args['input']['$changes'][uri][field]);
        }
        return item;
    }

    function close($li, args) {
        $li.classList.remove('active');
        $li.focus();
        renderEditor(null, args);
        args['field'] = null;
        args['item'] = null;
    }

    function hasChange(uri, args) {
        const { field } = args;
        const current = args['input']?.['$changes']?.[uri]?.[field];
        const original = (args['loaded'] || []).filter(l => l.uri === uri)?.[0]?.['data']?.[field];
        if (undefined === current) {
            return false;
        }
        if (Array.isArray(current) && Array.isArray(original)) {
            return JSON.stringify(current) !== JSON.stringify(original);
        }
        if ('object' === typeof current && 'object' === typeof original) {
            return JSON.stringify(current) !== JSON.stringify(original);
        }
        return current !== original;
    }

    function onOptionClick(event, args) {
        const $li = event.currentTarget;
        const uri = $li.getAttribute('uri');
        const { field, data, $body, $footer } = args;
        event.preventDefault();
        function onChange(value, keepOpen = false) {
            if (hasChange(uri, args)) {
                $li.classList.add('has-change');
            } else {
                $li.classList.remove('has-change');
            }
            renderFooter(args, $footer);
            if (keepOpen) return;
            close($li, args);
        }
        function onCancel() {
            close($li, args);
        }
        (args['schema'] || []).filter(r => r['name'] === field).forEach(rule => {
            const nwType = window.nwTypes[rule['type']] || window.nwTypes['nwComponent'] || null;
            if (!nwType) {
                console.error('Cannot find a nan•web type in rule', rule);
                return;
            }
            args['item'] = collectItem(uri, args);
            args['rule'] = rule;
            if (nwType['click']) {
                nwType.click.apply(this, [args, event, onChange, onCancel]);
            } else if (nwType['edit']) {
                const { $element, onAttach } = nwType.edit.apply(this, [args, event, onChange, onCancel]);
                if ($element) {
                    if (!$li.classList.contains('active')) {
                        for (const $el of $li.parentNode.children) $el.classList.remove('active');
                        $li.classList.add('active');
                    }
                    renderEditor($element, args);
                    onAttach($element, args);
                } else {
                    close($li, args);
                }
            }
        });
    }

    function onChange(value, args, $el) {
        if (!$el) return true;
        const $p = window.nwFindParent($el, '[nwe]');
        if ($p) {
            console.log($p);
        }
    }

    async function init({ $body, $footer, $modal, $panel }) {
        context['$body']   = $body;
        context['$footer'] = $footer;
        context['$modal']  = $modal;
        context['$panel']  = $panel;
        try {
            const res = await window.nwAPI('edit');
            const data = Object.assign({}, res.body);
            window.nweData = data;
            return renderView({ ...data, $body, $footer, $modal, $panel, onChange });
        } catch (error) {
            if (window.nwIsDebugMode()) console.error(error);
        }
        return false;
    }

    if (!window.nwEditor) window.nwEditor = {};
    window.nwEditor.options = {
        init
    };
})();
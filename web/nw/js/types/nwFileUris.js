(() => {
    const html = window.nwCreateHTML;
    const nwComponent = window.nwTypes.nwComponent;
    const $events = {
        onChange: () => {},
        onCancel: () => {}
    };
    function renderViewItem(value, args) {
        const $span = html('span', { class: 'form-control' }, value.join(', '));
        return nwComponent.setViewItem($span, args);
    }
    function read(args) {
        const { rule, field, item } = args;
        const $div = html('div', { class: `value ${rule['disabled'] ? 'disabled': ''}` });
        const $label = html('label', { class: 'form-label' }, rule['title']);
        $div.appendChild($label);
        $div.appendChild(renderViewItem(item[field], args));
        return $div;
    }

    function onTextChange(event, args) {
        event.preventDefault();
        event.stopPropagation();
        args['item'] = ('' + this.value.trim()).split("\n");
        const $view = renderViewItem(args['item'], args);
        window.nwEditor.index.change(args['item'], args, $view);
        $events['onChange'].apply(this, [args['item']]);
    }

    function edit(args, event, onChange, onCancel) {
        if (nwComponent.isActiveRow(event, args)) {
            nwComponent.deactivateRow(event);
            return { $element: null };
        }
        console.log(event.target, event);
        $events['onChange'] = onChange;
        $events['onCancel'] = onCancel;
        const value = args['item'].join("\n");
        const $element = html('textarea', { class: 'form-control', rows: 9 }, value, true);
        if (args['rule']?.['disabled']) $element.setAttribute('disabled', true);
        $element.addEventListener('keyup', function (event) {
            if (!(event.metaKey && event.key === 'Enter')) return;
            onTextChange.apply(this, [event, args]);
        });
        $element.addEventListener('blur', function (event) {
            onTextChange.apply(this, [event, args]);
        });
        return { $element, onAttach: () => $element.focus() };
    }

    if (!window.nwTypes) window.nwTypes = {};
    window.nwTypes.nwFileUris = {
        $name: 'nwFileUris',
        read,
        edit,
    };
})();
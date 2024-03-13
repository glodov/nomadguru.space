(() => {
    const URL_A_CLASS = 'btn btn-xs btn-outline-success';
    const html = window.nwCreateHTML;
    const l = window.nwL;
    const $events = {
        onChange: () => {},
        onCancel: () => {}
    };
    let isOpen = false;
    let $viewItem;
    const a = {
        $name: 'a',
        read: (args) => {
            const { field, item } = args;
            const href = item[field];
            const $i = html('i', { class: 'nwi-external-link me-2' });
            const $span = html('span', {}, item['text'] || href);
            return html('a', { href, target: '_blank', class: item['class'] || URL_A_CLASS }, [$i, $span], true);
        }
    };
    function renderForm(args) {
        const $element = html('div', { class: 'value' });
        const id = `nwUrl-${args['field']}`;
        const $label = html('label', { class: 'form-label mb-3', for: id }, args['rule']?.['title']);
        $element.appendChild($label);
        const $input = html('input', {
            class: 'form-control',
            type: 'url',
            name: args['field'],
            id,
            value: args['item'],
            placeholder: args['rule']?.['placeholder'] || '',
        });
        if (args['rule']?.['disabled']) $input.setAttribute('disabled', true);
        const $group = html('div', { class: 'input-group' });
        $group.appendChild($input);
        const $span = html('span', {}, l('Accept btn', args['data']?.['$l'] || {}));
        const $btn = html('button', { class: 'btn btn-outline-success', type: 'button' });
        $btn.appendChild($span);
        $group.appendChild($btn);
        $element.appendChild($group);
        return $element;
    }
    function onTextChange(event, args, closeForm = false) {
        if (closeForm) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (this.tagName === 'INPUT') {
            args['item'] = this.value.trim();
            renderViewItem(args['item']);
            window.nwEditor.index.change(args['item'], args, $viewItem);
        }
        isOpen = !closeForm;
        $events['onChange'].apply(this, [args['item'], isOpen]);
    }
    function attachFormEvents($element, args) {
        $element.addEventListener('keydown', function (event) {
            if (!event.target || event.target.tagName !== 'INPUT' || event.key !== 'Enter') return;
            onTextChange.apply(event.target, [event, args, true]);
        });
        $element.addEventListener('keyup', function (event) {
            if (!event.target || event.target.tagName !== 'INPUT' || event.key === 'Enter') return;
            onTextChange.apply(event.target, [event, args, false]);
        });
        $element.addEventListener('blur', function (event) {
            if (!event.target || event.target.tagName !== 'INPUT') return;
            onTextChange.apply(event.target, [event, args, true]);
        });
        $element.addEventListener('click', function (event) {
            if (!event.target || event.target.tagName !== 'BUTTON') return;
            onTextChange.apply(event.target, [event, args, true]);
        });
    }
    function renderViewItem(value) {
        const $el = a.read({ field: 'href', item: { href: value } });
        if ($viewItem instanceof HTMLElement) {
            $viewItem.parentElement.replaceChild($el, $viewItem);
        }
        $viewItem = $el;
        return $viewItem;
    }
    const nwUrl = {
        $name: 'nwUrl',
        read: (args, rebuild = false) => {
            const { field, item, rule } = args;
            const href = '' + item[field];
            console.log(href);
            const name = rule['title'] || rule['name'];
            const $label = html('label', { class: 'form-label' }, name);
            const $div = html('div', { class: 'value' });
            $div.appendChild($label);
            $div.appendChild(renderViewItem(href));
            $div.addEventListener('click', window.nwTypes.nwComponent.allowLinksOnClick);
            return $div;
        },
        edit: (args, event, onChange, onCancel) => {
            $events['onChange'] = onChange;
            $events['onCancel'] = onCancel;
            isOpen = !isOpen;
            if (!isOpen) return false;
    
            const $element = renderForm(args);
            attachFormEvents($element, args);
            return { $element, onAttach: () => $element.querySelector('input').focus() };
        }
    }
    
    if (!window.nwTypes) window.nwTypes = {};
    window.nwTypes.a = a;
    window.nwTypes.nwUrl = nwUrl;
})();

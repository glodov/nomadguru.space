(() => {
    const html = window.nwCreateHTML;
    const $events = {
        onChange: () => {},
        onCancel: () => {}
    };
    let isOpen = false;
    let $viewItem;
    // let $viewItem = {};
    // function setViewItem(args, $span) {
    //     const { field } = args;
    //     if ($viewItem[field]) {
    //         $viewItem[field].parentElement.replaceChild($span, $viewItem[field]);
    //         $viewItem[field] = $span;
    //     } else {
    //         $viewItem[field] = $span;
    //     }
    // }
    // function getViewItem(args) {
    //     const { field } = args;
    //     return $viewItem[field] || null;
    // }
    function renderViewItem(value, rule) {
        const list = value.split(' ');
        const allow = (rule['allow'] || []).flatMap(item => item.split(' '));
        const $list = [];
        for (const c of list) {
            const $c = html('span', { class: `badge me-2 bg-${allow.includes(c) ? 'success' : 'danger'}` }, c);
            $list.push($c);
        }
        const $el = html('span', {}, $list, true);
        if ($viewItem instanceof HTMLElement) {
            $viewItem.parentElement.replaceChild($el, $viewItem);
        }
        $viewItem = $el;
        return $viewItem;
    }
    function read(args) {
        const { field, item, rule } = args;
        const $div = html('div', { class: 'value' });
        const $label = html('label', { class: 'form-label' }, rule['title']);
        $div.appendChild($label);
        $div.appendChild(renderViewItem(item[field], rule));
        return $div;
    }
    function renderForm(args) {
        const { field, item, rule } = args;
        const value = item.split(' '); // Assuming this is the current list of selected classes
        const $element = html('div', { class: 'value' });
        const $label = html('label', { class: 'form-label mb-3' }, rule['title']);
        $element.appendChild($label);
        const $row = html('div', { class: 'row' });
    
        // Create a checkbox for each allowed class
        (rule['allow'] || []).forEach(classes => {
            classes.split(' ').forEach(c => {
                const $col = html('div', { class: 'col-6 col-xl-4' });
                const $check = html('div', { class: 'form-check' });
                const $input = html('input', {
                    class: 'form-check-input',
                    type: 'checkbox',
                    name: `${field}[]`, // Naming the checkboxes as an array for easier collection
                    value: c,
                    id: `checkbox-${c}`,
                });
                if (value.includes(c)) $input.setAttribute('checked', true);
                const $label = html('label', {
                    class: 'form-check-label',
                    for: `checkbox-${c}`
                }, c);
        
                $check.appendChild($input);
                $check.appendChild($label);
                $col.appendChild($check);
                $row.append($col);
            });
            const $col = html('div', { class: 'col-12' }, '<hr>', true);
            $row.append($col);
        });
        $element.appendChild($row);
        return $element;
    }
    function attachFormEvents($form, args) {
        // Attach event listener to handle checkbox changes
        $form.addEventListener('change', function(event) {
            if (!event.target.matches('input[type="checkbox"]')) return;
            const selected = Array.from(this.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
            args['item'] = '' + selected.join(' ');
            const $span = renderViewItem(args['item'], args['rule']);
            window.nwEditor.index.change(args['item'], args, $span);
            $events['onChange'].apply(this, [args['item'], true]);
        });
    }
    function edit(args, event, onChange, onCancel) {
        $events['onChange'] = onChange;
        $events['onCancel'] = onCancel;
        isOpen = !isOpen;
        if (!isOpen) return false;

        const $element = renderForm(args);
        attachFormEvents($element, args);
        return { $element, onAttach: () => $element.focus() };
    }

    if (!window.nwTypes) window.nwTypes = {};
    window.nwTypes.nwClassList = {
        $name: 'nwClassList',
        read,
        edit,
    };
})();
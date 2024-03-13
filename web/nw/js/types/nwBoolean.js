(() => {
    const html = window.nwCreateHTML;
    function read(args) {
        const { rule, field: name, item } = args;
        const $div = html('div', { class: 'value form-check form-switch form-switch-end' });
        const $label = html('label', { class: 'form-check-label' }, rule['title']);
        $div.appendChild($label);
        const $input = html('input', {
            class: 'form-check-input', name, type: 'checkbox', role: 'switch',
        });
        if (true === item[name]) $input.setAttribute('checked', true);
        $div.appendChild($input);
        return $div;
    }

    function click(args, event, onChange, onCancel) {
        const clickOnInput = event.target && event.target.tagName === 'INPUT';
        if (!clickOnInput) {
            event.preventDefault();
        }
        if (!event.currentTarget) {
            console.error('No target provided for the click event');
            return;
        }
        const sel = `[name="${args.field}"]`;
        const $input = clickOnInput ? event.target : event.currentTarget.querySelector(sel);
        if (!$input) {
            console.error(`Input ${sel} not found`);
            return;
        }
        // @todo when clicking on the input[type=checkbox] the change is double, so
        // no change at all, just input['$changes'] updated twicely.
        if ($input.type === 'checkbox' && !clickOnInput) {
            $input.checked = !$input.checked;
        }
        const value = $input.type === 'checkbox' ? $input.checked : $input.value;
        window.nwEditor.index.change(value, args, $input);
        if (onChange) onChange.apply(this, [value]);
    }
    
    if (!window.nwTypes) window.nwTypes = {};
    window.nwTypes.nwBoolean = {
        $name: 'nwBoolean',
        read,
        click,
    };
})();
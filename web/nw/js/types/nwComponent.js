(() => {
    const html = window.nwCreateHTML;
    const $viewItem = {};
    function getViewId(args) {
        const path = [];
        if (args['input']?.['loaded']) path.push(args['input']?.['loaded']);
        if (args['field']) path.push(args['field']);
        return path.join('/');
    }
    const nwComponent = {
        $name: 'nwComponent',
        read: (args) => {
            const { field, item, rule } = args;
            const $label = html('label', { class: 'form-label' }, rule['title'] || rule['name']);
            const $span = html('span', {}, '' + item[field]);
            return html('div', { class: 'value' }, [$label, $span], true);
        },
        allowLinksOnClick: function (event) {
            if (!event.target) return;
            const a = window.nwFindParent(event.target, 'a', this);
            if (a) {
                if (a.href) window.open(a.href, '_blank').focus();
                event.preventDefault();
                event.stopPropagation();
            }
        },
        setViewItem: function ($item, args, rebuild = false) {
            const id = getViewId(args);
            if (rebuild && $viewItem[id] && $viewItem[id].parentElement) {
                $viewItem[id].parentElement.removeChild($viewItem[id]);
            }
            if ($viewItem[id] && $viewItem[id].parentElement) {
                $viewItem[id].parentElement.replaceChild($item, $viewItem[id]);
            }
            $viewItem[id] = $item;
            return $viewItem[id];
        },
        getViewItem: function (args) {
            return $viewItem[getViewId(args)] || null;
        },
        getAllViewItems: function () {
            return $viewItem;
        },
        isActiveRow: function (event, args) {
            if (!event.target) return false;
            const $nwe = event.target.matches('[nwe]') ? event.target : window.nwFindParent(event.target, '[nwe]');
            if (!$nwe) return false;
            return $nwe.classList.contains('active');
        },
        deactivateRow: function (event) {
            if (!event.target) return false;
            const $nwe = event.target.matches('[nwe]') ? event.target : window.nwFindParent(event.target, '[nwe]');
            if (!$nwe) return false;
            return $nwe.classList.remove('active');
        }
        // change: (args, value) => {
        //     args.data[args.field] = value;
        //     const arr = (args.input['loaded'] || ['*']);
        //     const uri = arr[arr.length - 1];
        //     if (!args.input['$changes']) args.input['$changes'] = {};
        //     if (!args.input['$changes'][uri]) args.input['$changes'][uri] = {};
        //     args.input['$changes'][uri][args.field] = value;
        //     window.nweData = args;
        // },
    };
    
    if (!window.nwTypes) window.nwTypes = {};
    window.nwTypes.nwComponent = nwComponent;
})();

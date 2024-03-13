(() => {
    function setValues(clone, values) {
        for (const key in values) {
            const value = values[key];
            clone.querySelectorAll(`[nw="${key}"]`).forEach(el => el.innerText = value);
        }
    }
    function processSpecific(name, clone, element) {
        const words = name.split('.');
        const href = element.getAttribute('href');
        if ('file' === words[0] && href) {
            const parts = href.split('/');
            const filename = parts.pop();
            const names = filename.split('.');
            const ext = names.pop();
            const basename = names[0];
            setValues(clone, { href, filename, basename, ext });
        }
    }
    document.querySelectorAll('template[nw-clone]').forEach(t => {
        // Ensure t is a <template> element
        const name = t.getAttribute('nw-clone');
        const targetSelector = `nwclone[name="${name}"]`;
        document.querySelectorAll(targetSelector).forEach(el => {
            // Create a clone of the template's content, not the template itself
            const clone = document.importNode(t.content, true).firstElementChild;

            // Copy attributes from the original element (nwclone) to the clone
            Array.from(el.attributes).forEach(attr => {
                clone.setAttribute(attr.name, attr.value);
            });
            processSpecific(name, clone, el);

            // Remove the 'nw-clone' attribute to avoid confusion or repeated processing
            clone.removeAttribute('nw-clone');

            // Replace the original element with the clone
            el.parentNode.replaceChild(clone, el);
        });
    });
})();

// Decode all <email>'s.
(() => {
    function decode(encodedString, shift = 1) {
        return encodedString.split('').map(function(char) {
            return String.fromCharCode(char.charCodeAt(0) - shift);
        }).join('');
    }

    document.querySelectorAll('email').forEach(function(el) {
        const encodedEmail = el.getAttribute('a');
        const shift = parseInt(el.getAttribute('s'), 10);
        const query = el.getAttribute('q') || '';
        const decodedEmail = decode(encodedEmail, shift);
        const $a = document.createElement('a');
        $a.href = 'mailto:' + decodedEmail;
        if (query) $a.href += '?' + query;
        $a.innerHTML = el.innerHTML.replace(encodedEmail, decodedEmail);
        Array.from(el.attributes).forEach(attr => {
            if (attr.name !== 'a') $a.setAttribute(attr.name, attr.value);
        });
        el.parentNode.replaceChild($a, el);
    });
})();
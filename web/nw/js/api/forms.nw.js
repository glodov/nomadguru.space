/**
 * Requires
 *  <div><form action /></div> - div is a wrapper for collapse 
 */
(() => {
    'use strict';
    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    const forms = document.querySelectorAll('form[novalidate]');
    const html = window.nwCreateHTML;

    // Loop over them and prevent submission
    Array.from(forms).forEach(form => {
        form.addEventListener('submit', async (event) => {
            event.preventDefault(); // Always prevent default to handle submission via AJAX
            form.classList.add('was-validated');
            if (!form.checkValidity()) {
                event.stopPropagation();
            } else {
                const action = form.getAttribute('action');
                const method = form.getAttribute('method') || 'POST';
                const formData = new FormData(form);
                const $wrap = form.parentElement;
                let status = 'danger';
                let text = '';
                try {
                    const response = await fetch(action, {
                        method: method,
                        body: formData,
                    });
                    text = await response.text();
                    if (response.ok) {
                        status = 'success';
                    } else if (401 === response.status) {
                        status = 'warning';
                    } else if (400 === response.status) {
                        status = 'danger';
                        for (const line of text.split('\n')) {
                            const words = line.split(': ');
                            const name = words[0];
                            const $field = form.querySelector(`[name="${name}"]`);
                            const $parent = window.nwFindParent($field, '[nw="input-container"]');
                            const $feedback = $parent.querySelector('.invalid-feedback');
                            if ($feedback) {
                                $feedback.textContent = words.slice(1).join(': ');
                                $feedback.style.display = 'block';
                                $field.classList.add('is-invalid');
                                form.classList.remove('was-validated');
                            } else {
                                text = line;
                            }
                        }
                    }
                } catch (error) {
                    text = error['message'] || "Network error, please try again.";
                    console.error('Submission error:', error);
                }
                const $div = html('div', { class: `alert alert-${status}` }, text);
                if ('success' === status) {
                    if ($wrap) {
                        const bsCollapse = new bootstrap.Collapse($wrap, { toggle: false });
                        bsCollapse.hide();
                        $wrap.insertAdjacentElement('beforebegin', $div);
                    } else {
                        form.insertAdjacentElement('beforebegin', $div);
                    }
                }
                window.nwScrollTo($div);
            }
        }, false);
    });
})();

(() => {
    document.querySelectorAll('button.hamburger, a.hamburger').forEach($btn => {
        $btn.addEventListener('click', () => {
            $btn.classList.toggle('is-active');
        });
    });
})();

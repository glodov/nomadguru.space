const NW_LS_ALERT = 'nwAlert';

(() => {
    document.querySelectorAll('[nwalert]').forEach($alert => {
        const index = $alert.getAttribute('nwalert');
        // Read status from localStorage
        const values = (localStorage.getItem(NW_LS_ALERT) || '').split("\n").filter(v => v != '');
        const isCollapsed = values.includes(index);

        // Set initial visibility based on status
        if (isCollapsed) {
            $alert.classList.add('collapsed');
        }

        // Add click event to toggle visibility
        $alert.addEventListener('click', () => {
            $alert.classList.toggle('collapsed');

            // Write status to localStorage
            const newStatus = $alert.classList.contains('collapsed');
            if (newStatus) {
                values.push(index);
            } else {
                const indexToRemove = values.indexOf(index);
                if (indexToRemove !== -1) values.splice(indexToRemove, 1);
            }
            localStorage.setItem(`${NW_LS_ALERT}`, values.join("\n"));
        });
    });
})();

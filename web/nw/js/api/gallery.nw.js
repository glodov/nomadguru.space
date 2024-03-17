/**
 * Gallery API
 * @depends
 *      #galleryModal
 *      img[nw-gallery="${group}"]
 */
(() => {
    const $modal = document.getElementById('galleryModal');
    if (!$modal) return;
    const $inner = $modal.querySelector('.carousel-inner');
    if (!$inner) return;

    const all = document.querySelectorAll('img[nw-gallery]');
    const modal = new bootstrap.Modal($modal);

    function onClick() {
        const group = this.getAttribute('nw-gallery') || '*';
        const $images = Array.from(all).filter(i => i.getAttribute('nw-gallery') === group);

        let activeIndex = 0;
        $inner.innerHTML = '';
        $images.forEach((img, index) => {
            if (img.src === this.src) activeIndex = index;
            const item = document.createElement('div');
            item.className = `carousel-item ${index === 0 ? 'active' : ''}`;

            const imgTag = document.createElement('img');
            imgTag.src = img.getAttribute(img.hasAttribute('href') ? 'href' : 'src');
            imgTag.className = 'd-block w-100';
            imgTag.alt = img.alt;

            item.appendChild(imgTag);
            $inner.appendChild(item);
        });
        const carousel = new bootstrap.Carousel($inner);
        carousel.to(activeIndex);
        modal.show();
    }

    all.forEach(image => {
        image.addEventListener('click', onClick);
    });
})();

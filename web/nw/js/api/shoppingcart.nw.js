(() => {
    const initCart = () => {
        const Cart = {
            items: [],
            add: function (item) {
                this.items.push(item);
                this.updateLocalStorage();
                this.render();
            },
            has: function(id) {
                return this.items.some(item => item.id === id);
            },
            remove: function (id) {
                this.items = this.items.filter(item => item.id !== id);
                this.updateLocalStorage();
                this.render();
            },
            updateLocalStorage: function() {
                localStorage.setItem('cart', JSON.stringify(this.items));
            },
            loadLocalStorage: function() {
                const storedCart = localStorage.getItem('cart');
                if (storedCart) {
                    this.items = JSON.parse(storedCart);
                }
            },
            render: function() {
                const buttons = document.querySelectorAll('[btn-cart="modal"]');
                buttons.forEach(button => {
                    const $badge = button.querySelector('.badge');
                    if ($badge) $badge.textContent = this.items.length;
                });
                const goods = document.querySelectorAll('[data-id]');
                goods.forEach(good => {
                    const button = good.querySelector('[btn-cart]');
                    if (window.Cart.has(good.getAttribute('data-id'))) {
                        if (button) button.classList.add('active');
                    } else {
                        if (button) button.classList.remove('active');
                    }
                });
            },
            // A sample item structure for reference, not used directly
            sampleItem: {
                id: 'xau-1',
                url: '/good/uri',
                title: 'Good title',
                image: '/img/path.jpg',
                price: 300.33
            }
        };
        window.Cart = Cart;
        // Initialize the cart from localStorage when the script loads
        Cart.loadLocalStorage();
        
        // Example usage:
        // Cart.add({id: 'xau-1', url: '/good/uri', title: 'Good title', image: '/img/path.jpg', price: 300.33});
        // Cart.remove('xau-1');
    };

    const orderButton = () => {
        const orderButtons = document.querySelectorAll('[btn-order]');
        const cartButtons = document.querySelectorAll('[btn-cart]');
        const $order = document.getElementById('orderModal');
        const $cart = document.getElementById('cartModal');
        if (!$order || !$cart) return;
        const orderModal = new bootstrap.Modal($order);
        const cartModal = new bootstrap.Modal($cart);
    
        orderButtons.forEach(button => {
            button.addEventListener('click', function () {
                const productElement = findProductElement(this);
                const productInfo = getProductInfo(productElement);
    
                $order.querySelector('[data-title]').innerText = productInfo.title;
                $order.querySelector('[data-image]').src = productInfo.image;
                $order.querySelector('[data-price]').innerText = productInfo.price;
                $order.querySelector('[data-id]').innerText = productInfo.id;
    
                orderModal.show();
            });
        });
        cartButtons.forEach(button => {
            const type = button.getAttribute('btn-cart');
            if ('modal' === type) {
                button.addEventListener('click', e => cartModal.show());
                return;
            }
            const good = getProductInfo(findProductElement(button));
            button.addEventListener('click', function () {
                if (!window.Cart.has(good.id)) window.Cart.add(good);
                this.classList.toggle('active');
            });
        });
        window.Cart.render();
    
        $order.querySelector('[type=submit]').addEventListener('click', event => {
            event.preventDefault();
            // Handle the submission logic here
            const fullName = $order.querySelector('input[name="fullName"]').value;
            const phone = $order.querySelector('input[name="phone"]').value;
            const comment = $order.querySelector('textarea[name="comment"]').value;
    
            // Save input data to local storage
            localStorage.setItem(LS_ORDER_FULLNAME, fullName);
            localStorage.setItem(LS_ORDER_PHONE, phone);
            localStorage.setItem(LS_ORDER_COMMENT, comment);
    
            // Close the modal
            orderModal.hide();
        });
    
        $order.addEventListener('shown.bs.modal', event => event.target.querySelector('input').focus());
        $cart.addEventListener('show.bs.modal', event => {
            const $row = document.getElementById('cartModalRow');
            if (!$row) return;
            const $body = $cart.querySelector('.modal-body');
            if (!$body) return;
            const $empty = document.getElementById('cartModalEmpty');
            if (!$empty) return;
            $body.innerHTML = '';
            window.Cart.items.forEach(item => {
                const row = $row.content.cloneNode(true);
                row.querySelector('[data-url]').setAttribute('href', item.url);
                row.querySelector('[data-title]').textContent = item.title;
                row.querySelector('[data-price]').textContent = item.price;
                row.querySelector('[data-image]').src = item.image;
                row.querySelector('[data-id]').setAttribute('data-id', item.id);
                $body.appendChild(row);
            });
            $body.querySelectorAll('[cart-remove]').forEach(button => {
                button.addEventListener('click', event => {
                    const $item = findProductElement(button);
                    const info = getProductInfo($item);
                    window.Cart.remove(info.id);
                    $item.remove();
                    if (!window.Cart.items.length) {
                        const row = $empty.content.cloneNode(true);
                        $body.innerHTML = '';
                        $body.appendChild(row);
                    }
                });
            });
        });
    
        function findProductElement(element) {
            // Traverse parent elements until an element with [data-id] is found
            while (element && !element.getAttribute('data-id')) element = element.parentElement;
            return element;
        }
    
        function getProductInfo($product) {
            // Get product information from the product element
            const id = $product.getAttribute('data-id');
            const title = $product.querySelector('[data-title]').innerText;
            const image = $product.querySelector('[data-image]').getAttribute('src');
            const price = $product.querySelector('[data-price]').innerText;
    
            return { id, url: location.pathname, title, image, price };
        }
    };
    
    initCart();
    document.addEventListener('DOMContentLoaded', orderButton);
})();
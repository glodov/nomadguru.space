const fs = require('node:fs');
const SOCIAL_NETWORKS = [
    { host: ['instagram.com'], icon: 'instagram', title: 'Instagram', color: '#bc2a8d' },
    { host: ['twitter.com', 'x.com'], icon: 'x', title: 'Twitter', color: '#1da1f2' },
    { host: 'facebook.com', icon: 'facebook', title: 'Facebook', color: '#1877f2' },
    { host: 'linkedin.com', icon: 'linkedin', title: 'LinkedIn', color: '#0e76a8' },
    { host: 'reddit.com', icon: 'reddit', title: 'Reddit', color: '#ff4500' },
    { host: 'pinterest.com', icon: 'pinterest', title: 'Pinterest', color: '#bd081c' },
    { host: 'pin.it', icon: 'pinterest', title: 'Pinterest', color: '#bd081c' },
    { host: 'whatsapp.com', icon: 'whatsapp', title: 'WhatsApp', color: '#25d366' },
    { host: ['t.me', 'telegram.org'], icon: 'telegram', title: 'Telegram', color: '#0088cc' },
    { host: ['youtube.com', 'youtu.be'], icon: 'youtube', title: 'YouTube', color: '#ff0000' },
    { host: 'tiktok.com', icon: 'tiktok', title: 'TikTok', color: '#69c9d0' },
    { host: 'medium.com', icon: 'medium', title: 'Medium', color: '#00ab6c' },
    { host: 'soundcloud.com', icon: 'soundcloud-peace', title: 'SoundCloud', color: '#ff5500' },
    { host: 'music.apple.com', icon: 'apple-music', title: 'Apple Music', color: '#FA233B' },
];
/**
 * { social-btn: { link, image, title, class } } 
 * { social-btn: 'https://x.com/post-url' }
 * @template
 <a target="_blank" href="<%= item['link'] %>" title="<%= item['title'] %>" class="btn">
    <img class="icon" src="<%= item['image'] %>" alt="<%= item['title'] %>">
    <label><%= item['title'] %></label>
</a>
 */
module.exports = function(content) {
    const item = content['social-btn'];
    let link = '';
    let title = '';
    let image = '';
    let color = '';
    let icon = '';
    if ('string' === typeof item) {
        link = item;
    } else {
        link = item['link'];
        title = item['title'];
        image = item['image'];
    }
    const url = new URL(link);
    if (!image) SOCIAL_NETWORKS.forEach(network => {
        if (image) return;
        const host = url.host.startsWith('www.') ? url.host.slice(4) : url.host;
        if (Array.isArray(network.host) && network.host.includes(host) || host === network.host) {
            image = `/img/brands/${network.icon}.svg`;
            if (!title) title = network.title;
            if (!color) color = network.color;
            if (!icon) icon = network.icon;
        }
    });
    let svg = '';
    if (!image.startsWith('/img/')) {
        if (!fs.existsSync(image)) {
            throw new Error(`Social icon file not found: ${link}`);
        }
        svg = fs.readFileSync(image).toString();
    }
    const tag = {
        $target: '_blank',
        $href: link,
        $title: title,
        $class: [item['class'] || 'btn', `social-${icon}`].join(' '),
        a: [
            image.startsWith('/img/') ? { img: image } : Buffer.from(svg),
            {
                label: title
            }
        ]
    };
    if (color) {
        tag['$style'] = [
            '--bs-btn-color',
            '--bs-btn-border-color',
            '--bs-btn-hover-border-color',
            '--bs-btn-active-bg',
            '--bs-btn-hover-bg',
            ''
        ].join(`:${color};`);
    }
    return tag;
};
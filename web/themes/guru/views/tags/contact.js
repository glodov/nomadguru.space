const { utils } = require('../../../../src/ejs/utils');
/**
 * { contact: { phone, email, address } }
 */
module.exports = function (content) {
    const tag = {
        '$class': 'contact',
        'address': [
        ]
    };
    const contact = content['contact'] || null;
    if (!contact) return null;
    if (contact['email']) {
        const isObj   = 'object' === typeof contact['email'];
        const email   = isObj ? contact['email']['to'] : contact['email'];
        const subject = isObj ? contact['email']['subject'] : null;
        const body    = isObj ? contact['email']['body'] : null;
        let $href     = `mailto:${email}`;
        if (subject) {
            const q = [];
            q.push(`subject=${encodeURIComponent(subject)}`);
            if (body) q.push(`body=${encodeURIComponent(body)}`);
            if (q.length) $href += '?' + q.join('&');
        }
        tag.address.push(
            {
                $href,
                $class: 'fs-5',
                a: [
                    { $class: 'icon-mail fs-3', span: '' },
                    { span: email }
                ]
            }
        );
    }
    if (contact['phone']) {
        tag.address.push(
            {
                $href: `tel:${utils.tel(contact.phone)}`,
                $class: 'fs-5 text-nowrap',
                a: [
                    { $class: 'icon-phone fs-3', span: '' },
                    { span: utils.phone(contact.phone) },
                ]
            }
        );
    }
    if (contact['address']) {
        if ('object' === typeof contact['address']) {
            tag.address.push(
                {
                    $target: '_blank',
                    $href: contact['address']['url'],
                    a: [
                        { $class: 'icon-map fs-3', span: '' },
                        { span: contact['address']['text'] },
                    ]
                }
            );
        } else {
            tag.address.push({ span: contact['address'] });
        }
    }
    return tag;
}
/**
 * { logo: true, $src, $alt, $dark }
 */
module.exports = function(content) {
    const tag = [
        {
            '$data-bs-theme': 'light',
            // '$src': content['$src'],
            '$alt': content['$alt'] || '',
            'img':  content['$src']
        },
    ];
    if (content['$dark']) {
        tag.push(
            {
                '$data-bs-theme': 'dark',
                // '$src': content['$dark'],
                '$alt': content['$alt'] || '',
                '$style': 'display: none',
                'img': content['$dark']
            }
        );
    }
    return tag;
}
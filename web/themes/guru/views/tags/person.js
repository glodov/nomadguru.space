module.exports = function (content) {
    const person = content['person'];
    return {
        $class: 'person',
        div: [
            { figure: { $class: 'rounded-circle', img: person['image'], $alt: person['name'] } },
            { h3: person['name'] },
            { h4: person['title'] },
            { p: person['desc'] },
        ]
    };
};
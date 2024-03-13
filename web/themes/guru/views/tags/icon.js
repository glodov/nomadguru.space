module.exports = function (content) {
    const tag = { img: `/img/icon/${content['icon']}.svg` };
    Object.entries(content).forEach(([key, value]) => {
        if (key.startsWith('$')) tag[key] = value;
    })
    return tag;
};
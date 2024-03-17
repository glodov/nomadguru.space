const { nano2html } = require('../../../../src/ejs/functions');
/**
 * { social: [ link ] } 
 * { social: link } 
 */
module.exports = function(content) {
    const social = content['social'];
    const tag = {
        $class: 'social',
        nav: []
    };
    if (Array.isArray(social)) {
        social.forEach(item => tag.nav.push({ 'social-btn': item }));
    } else {
        tag.nav.push(nano2html({ 'social-btn': social }));
    }
    return tag;
};
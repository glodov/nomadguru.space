const { start, commit, write, count } = require('./_/store');
const { runtime } = require('../../runtime');

function renderEmails(args, mods) {
    const { filesIndex, filesLen } = args;
    if (mods['html']?.['cached']) return args;
    if (filesLen && !filesIndex) start('emails');
    const html = mods['html']['out'];
    const shiftNBytes = (str, n) => {
        return str.split('').map(char => String.fromCharCode(char.charCodeAt(0) + parseInt(n))).join('');
    };
    const encodedHtml = html.replace(/<a href="mailto:([^"]+)"?([^>]*)>(.+?)<\/a>/gis, (match, email, attributes, linkText) => {
        const shift = runtime['EMAIL_RENDER_SHIFT'] || 6;
        const words = email.split('?');
        email = words[0];
        const query = words.length > 1 ? words[1] : '';
        const encodedEmail = shiftNBytes(email, shift);
        const encodedLinkText = linkText.replace(email, encodedEmail);
        write('emails', email);
        const res = [ '<email', `a="${encodedEmail}"`, `s="${shift}"`];
        if (query) res.push(`q="${query}"`);
        res.push(attributes.trim() + `>${encodedLinkText}</email>`);
        return res.join(' ');
    });
    if (filesIndex === filesLen -1) {
        commit('emails');
        args.emailsCount = count('emails');
    }
    args.out = encodedHtml;
    return { key: 'html', out: encodedHtml };
}

module.exports = renderEmails;
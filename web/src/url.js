const removeQueryParams = uri => uri.split('?')[0];
const decodeUri = uri => {
    try {
        return removeQueryParams(decodeURIComponent(uri));
    } catch (err) {
        console.error(err, uri);
    }
    return null;
}
function getQueryParams(url) {
    const queryParams = {};
    const queryStringIndex = url.indexOf('?');

    if (queryStringIndex !== -1) {
        const queryString = url.substring(queryStringIndex + 1);
        const params = queryString.split('&');

        for (const param of params) {
            const [key, value] = param.split('=');
            queryParams[decodeURIComponent(key)] = decodeURIComponent(value || '');
        }
    }

    return queryParams;
}

function fileToUri(file) {
    if (file.endsWith('.yaml')) {
        return file.slice(0, file.length - '.yaml'.length).replace(/\\+/g, '/');
    };
    return file.replace(/\\+/g, '/');
}

module.exports = {
    removeQueryParams,
    decodeUri,
    getQueryParams,
    fileToUri,
};
const date = new Date();
const startDate = new Date('2023-12-01T00:00:00Z'); // Start date at 2023-12-01 00:00 UTC
const CONTENT_SECURITY_POLICY = [
    "default-src 'none';",
    "script-src 'self' https://maps.googleapis.com;",
    "script-src-elem 'self' https://maps.googleapis.com;",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com;",
    "font-src 'self' https://fonts.gstatic.com;",
    "connect-src 'self' https://maps.googleapis.com;",
    "img-src 'self' https://maps.gstatic.com/ *.googleapis.com data:;",
    "media-src 'none';",
    "object-src 'none';",
    "child-src 'none';",
    "frame-src 'self';",
    "worker-src 'self';",
    "form-action 'none';",
    "upgrade-insecure-requests;",
    "block-all-mixed-content;",
    "base-uri 'self';",
    "manifest-src 'self';",
].join(' ');

module.exports = {
    version: '0.1.0',
    versionSlug: Math.floor((date - startDate) / 1000).toString(36), // Calculate the difference in seconds
    timestampVersion: () => (Date.now() - (new Date('2023-12-08').getTime())).toString(36),
    contentSecurityPolicy: CONTENT_SECURITY_POLICY,
    runtime: {},
    cache: {}
};

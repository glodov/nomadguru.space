const path = require('node:path');
const { readData } = require('../render/core');
const { decodeUri } = require('../url');
const { runtime } = require('../runtime');
const { utils } = require('../ejs/utils');
const { translate: l } = utils;

function readVars(body, boundary) {
    const parts = body.split(`--${boundary}`).filter(part => part.trim() !== '' && part.trim() !== '--');
    const fields = {};
    parts.forEach(part => {
        const nameMatch = part.match(/name="([^"]+)"/);
        const valueMatch = part.match(/\r\n\r\n([\s\S]+)/);
        if (nameMatch && valueMatch) {
            const name = nameMatch[1];
            const value = valueMatch[1].replace(/\r\n$/, '');
            fields[name] = value;
        }
    });
    return fields;
}

function validateForm(fields, form) {
    if (!form) return ['Form is not provided'];
    const errors = [];

    form.forEach(field => {
        const fieldName = field['$name'];
        const fieldValue = fields[fieldName];
        const isRequired = field['$required'];
        const pattern = field['$pattern'] ? new RegExp(field['$pattern']) : null;
        // Check if required fields are present
        if (isRequired && (!fieldValue || fieldValue.trim() === '')) {
            errors.push(`${fieldName}: ${field['error'] || 'This field is required.'}`);
            return;
        }
        // Check if the field matches the pattern
        if (pattern && fieldValue && !pattern.test(fieldValue)) {
            errors.push(`${fieldName}: ${field['error'] || 'This field does not match the expected format.'}`);
        }
    });
    return errors.length ? errors : true;
}

const handleAction = async (req, res, renderOptions) => {
    if (req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString(); // Convert Buffer to string
        });

        req.on('end', () => {
            const contentType = req.headers['content-type'];
            const boundary = contentType.split('boundary=')[1];

            if (!boundary) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                return res.end('Bad Request: Missing boundary');
            }
            const fields = readVars(body, boundary);

            // Split the body by the boundary
            let status = 200;
            let text = 'Your application has been sent';
            if (fields['$uri']) {
                const current = decodeUri(fields['$uri']).slice(1).replace(/\.html$/, '.yaml');
                const file = path.join(runtime['DATA_DIR'], current);
                const args = { current, file, ...renderOptions };
                const { data, deps } = readData({ ...args, current });
                if (data['$l']) text = l(text, data['$l']);
                const errors = validateForm(fields, data['page']?.['form']);
                if (Array.isArray(errors)) {
                    text = errors.join('\n');
                    status = 400;
                } else if (false === errors) {
                    text = 'Impossible to validate the form';
                    status = 500;
                }
            }
            res.writeHead(status, { 'Content-Type': 'text/plain' });
            res.end(text);
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
    }
};

module.exports = {
    handleAction
};
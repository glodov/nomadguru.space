const path = require('node:path');
const DomParser = require('dom-parser');
const { runtime } = require('../runtime');
/**
 * @define nwDataUri: /^[a-zA-Z0-9\-_./]+$/
 */
const nwDataUri = {
    from: (uri) => {
        const url = new URL(uri);
        let dataUri = url.pathname.slice(1);
        if (dataUri.endsWith('.html')) {
            dataUri = dataUri.slice(0, dataUri.length - '.html'.length);
        }
        return dataUri;
    },
    isValid: (uri) => {
        const url = new URL(uri);
        const pathname = url.pathname.slice(1); // Remove leading slash for consistency
        // Regex to match only Latin letters, digits, and standard non-encoded characters
        return /^[a-zA-Z0-9\-_./]+$/.test(pathname);
    },
    to: (uri, replaceWith = '-') => {
        const url = new URL(uri);
        let pathname = url.pathname.slice(1); // Remove leading slash for consistency
        // Replace any character not in the allowed set with the specified replacement character
        pathname = pathname.replace(/[^a-zA-Z0-9\-_./]/g, replaceWith);
        return pathname;
    }
};

/**
 * @define nwNano: # nan•web YAML format representing the structure of HTML
 */
const nwNano = {
    from: (html) => {
        // Simplified example of converting HTML to nan∙web YAML format
        let parser = null;
        if ('undefined' !== typeof window && window['DOMParser']) {
            parser = new DOMParser();
        } else {
            parser = DomParser;
        }
        const doc = parser.parseFromString(html, "text/html");
        const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.trim() ? node.textContent : null;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const obj = {};
                const tagName = node.tagName.toLowerCase();
                obj[tagName] = {};
                for (const attr of node.attributes) {
                    obj[tagName][`$${attr.name}`] = attr.value;
                }
                const children = Array.from(node.childNodes).map(processNode).filter(n => n);
                if (children.length) {
                    obj[tagName].content = children.length === 1 ? children[0] : children;
                }
                return obj;
            }
            return null;
        };
        return processNode(doc.body).body.content || {};
    },
    isValid: (yaml) => {
        // This is a basic check; real validation would require more comprehensive analysis
        return typeof yaml === 'object' && !Array.isArray(yaml) && yaml !== null;
    },
    to: (yaml) => {
        // Convert nan•web YAML format back to HTML (simplified example)
        const processYaml = (obj) => {
            if (typeof obj === 'string') {
                return document.createTextNode(obj);
            } else if (typeof obj === 'object') {
                for (const [tag, value] of Object.entries(obj)) {
                    const el = document.createElement(tag);
                    if (value && typeof value === 'object') {
                        for (const [attr, attrValue] of Object.entries(value)) {
                            if (attr.startsWith('$')) {
                                el.setAttribute(attr.slice(1), attrValue);
                            } else if (attr === 'content') {
                                if (Array.isArray(attrValue)) {
                                    attrValue.forEach(child => {
                                        const childEl = processYaml(child);
                                        if (childEl) el.appendChild(childEl);
                                    });
                                } else {
                                    const childEl = processYaml(attrValue);
                                    if (childEl) el.appendChild(childEl);
                                }
                            }
                        }
                    }
                    return el;
                }
            }
            return null;
        };
        const html = processYaml(yaml);
        const container = document.createElement('div');
        container.appendChild(html);
        return container.innerHTML;
    }
};

/**
 * @define nwText: /.+/
 */
const nwText = {
    from: (text) => {
        return text.match(/.+/)[0];
    },
    isValid: (text) => {
        return /.+/.test(text);
    },
    to: (text, replaceWith = ' ') => {
        return text.replace(/[^\w\s]/g, replaceWith).trim();
    }
};

/**
 * @define nwClassName: # DOMTokenList
 * @todo write the function, no explanation, just code, no comments.
 */
const nwClassName = {
    from: (className) => {
        return className.match(/\S+/g) || [];
    },
    isValid: (className) => {
        return /\S+/.test(className);
    },
    to: (classNames, replaceWith = '_') => {
        return classNames.split(/\s+/).filter(Boolean).map(name => name.trim().replace(/\W+/g, replaceWith)).join(' ');
    }
};

/**
 * @define nwFileName: /[^\s]{2,}/
 * @todo write the function, no explanation, just code, no comments.
 */
const nwFileName = {
    from: (filename) => {
        return filename.match(/[^\s]{2,}/)[0];
    },
    isValid: (filename) => {
        return /[^\s]{2,}/.test(filename);
    },
    to: (filename, replaceWith = '_') => {
        return filename.trim().length < 2 ? replaceWith.repeat(2) : filename.replace(/\s+/g, replaceWith);
    }
};

/**
 * @define nwSection: /[\d]+(\.{1}[\d]+)*\.{0,1}/
 * @todo write the function, no explanation, just code, no comments.
 */
const nwSection = {
    from: (section) => {
        return section.match(/[\d]+(\.{1}[\d]+)*\.{0,1}/)[0];
    },
    isValid: (section) => {
        return /[\d]+(\.{1}[\d]+)*\.{0,1}/.test(section);
    },
    to: (section, replaceWith = '.') => {
        return section.replace(/[^0-9.]/g, replaceWith);
    }
};

/**
 * @define nwDataUriSection: # {nwDataUri}:{nwSection}
 * @todo write the function, no explanation, just code, no comments.
 */
const nwDataUriSection = {
    from: (uri) => {
        const [dataUriPart, sectionPart] = uri.split(':');
        return {
            dataUri: nwDataUri.from(dataUriPart),
            section: nwSection.from(sectionPart)
        };
    },
    isValid: (uri) => {
        const [dataUriPart, sectionPart] = uri.split(':');
        return nwDataUri.isValid(dataUriPart) && nwSection.isValid(sectionPart);
    },
    to: (uri, replaceWithDataUri = '-', replaceWithSection = '.') => {
        const [dataUriPart, sectionPart] = uri.split(':');
        return nwDataUri.to(dataUriPart, replaceWithDataUri) + ':' + nwSection.to(sectionPart, replaceWithSection);
    }
};

/**
 * @define nwFileUri: /^[a-zA-Z0-9\-_./]+(\.[\w\d]{2,})$/
 * @todo write the functionality
 */
const nwFileUri = {
    from: (uri) => {
        const url = new URL(uri, 'https://yaro.page');
        let fileUri = url.pathname.slice(1);
        return fileUri;
    },
    isValid: (uri) => {
        const url = new URL(uri, 'https://yaro.page');
        const pathname = url.pathname.slice(1);
        return /^[a-zA-Z0-9\-_./]+(\.[\w\d]{2,})$/.test(pathname);
    },
    to: (uri, opts = { replaceWith: '-', ext: '.yaml' }) => {
        let pathname;
        try {
            const url = new URL(uri, 'https://yaro.page');
            pathname = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        } catch (e) {
            pathname = uri.startsWith('/') ? uri.slice(1) : uri;
        }   
        if (pathname.endsWith('.html')) {
            pathname = pathname.slice(0, pathname.length - '.html'.length);
        }
        
        pathname = pathname.replace(/[^a-zA-Z0-9\-_./]/g, opts['replaceWith'] || '-');
        if (!/\.[\w\d]{2,}$/.test(pathname)) {
            pathname += opts['ext'] || '.yaml';
        }
        return pathname;
    }
};

/**
 * @define nwFile:
 *   - object:
 *     src: nwFileUri
 *     name: nwFileName # <span class="h1">{name}</span>
 *     class: nwClassName # li.{class}
 *     text: nwText # <div class="p-3 py-0"><%= p.text %></div>
 *     filesClass: nwClassName # ul.files.{filesClass}
 *     $ref: nwDataUriSection # {nwDataUri}:{nwSection}
 *     files: nwFiles
 *   - string: nwFileUri # <a href="{filePrefix}{file}" %>">{file}</a>
 */
const nwFile = {
    from: (file) => {
        if (typeof file === 'string') {
            return nwFileUri.from(file);
        } else if (typeof file === 'object') {
            return {
                src: file.src ? nwFileUri.from(file.src) : undefined,
                name: file.name ? nwFileName.from(file.name) : undefined,
                class: file.class ? nwClassName.from(file.class).join(' ') : undefined,
                text: file.text ? nwText.from(file.text) : undefined,
                filesClass: file.filesClass ? nwClassName.from(file.filesClass).join(' ') : undefined,
                $ref: file.$ref ? nwDataUriSection.from(file.$ref) : undefined,
                files: file.files ? file.files.map(f => nwFile.from(f)) : undefined
            };
        }
    },
    isValid: (file) => {
        if (typeof file === 'string') {
            return nwFileUri.isValid(file);
        } else if (typeof file === 'object') {
            return (file.src || file.$ref) && (!file.src || nwFileUri.isValid(file.src)) && (!file.$ref || nwDataUriSection.isValid(file.$ref));
        }
        return false;
    },
    to: (file) => {
        if (typeof file === 'string') {
            return nwFileUri.to(file);
        } else if (typeof file === 'object') {
            let result = {
                src: file.src ? nwFileUri.to(file.src) : undefined,
                name: file.name ? nwFileName.to(file.name) : undefined,
                class: file.class ? nwClassName.to(file.class) : undefined,
                text: file.text ? nwText.to(file.text) : undefined,
                filesClass: file.filesClass ? nwClassName.to(file.filesClass) : undefined,
                $ref: file.$ref ? nwDataUriSection.to(file.$ref) : undefined,
                files: file.files ? file.files.map(f => nwFile.to(f)) : undefined
            };
            Object.keys(result).forEach(key => result[key] === undefined && delete result[key]);
            return result;
        }
    }
};

/**
 * @define nwFiles: "[nwFile]"
 */
const nwFiles = {
    from: (files) => files.map(f => nwFile.from(f)),
    isValid: (files) => Array.isArray(files) && files.every(f => nwFile.isValid(f)),
    to: (files) => files.map(f => nwFile.to(f))
};

const nwViewFile = {
    from: (uri) => {
        return nwFileUri.from(uri);
    },
    isValid: (uri) => {
        return nwFileUri.isValid(uri);
    },
    to: (uri, opts = { dataDir: `${runtime['NWE_DIR']}/views`, ext: '.ejs' }) => {
        return path.join(opts['dataDir'], nwFileUri.to(uri, { replaceWith: '-', ext: opts['ext'] }));
    }
}

module.exports = {
    nwDataUri,
    nwFileUri,
    nwViewFile,
    nwFileName,
    nwSection,
    nwDataUriSection,
    nwNano,
    nwText,
    nwClassName,
    nwFile,
    nwFiles
};

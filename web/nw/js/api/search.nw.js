const splitSearch = str => str.split(window.nwSupportsES2018 ? /[^\p{L}\w\d]+/u : /[\s!;\.\,]+/);
// Search API
// @depends /search.json
//          /search.txt
//          - window.nwScrollTo  element
//          - window.nwIsDebugMode() => bool
// @return:
//  - window.nwSearchTextValue 'string'
//  - window.nwSearchResults   [ { uri, title, desc, image, body } ]
//  - window.nwSearchMap       { uri: title }
//  - window.nwSearch          function(str) => { results: [ { uri, title, desc, image, body } ], total }
//      search ignores the tokens (words) with the length less than 3 characters.
(() => {
    const TITLE_SCORE_MAX  = 100000;
    const DESC_SCORE_MAX   = 10000;
    const TEXT_SCORE_MAX   = 1000;
    const TITLE_SCORE_MULT = 100;
    const DESC_SCORE_MULT  = 10;
    const TEXT_SCORE_MULT  = 1;

    window.nwSearchTextValue = null;
    window.nwSearchResults = [];
    window.nwSearchTotal = 0;
    window.nwSearchLoadedFiles = {};
    window.nwSearchIndexFile = async function(name = null) {
        const uri = name || window.location.pathname.replace(/\.html$/, '.txt');
        const file = `/search${uri}`;
        if (!window.nwSearchLoadedFiles[file]) {
            const res = await fetch(file);
            if (res.status >= 400) {
                if (window.nwIsDebugMode()) console.error('Search.api', res.status, 'error in response to', file);
                return { text: '', posts: [], file, uri };
            }
            const text = await res.text();
            const posts = text.trim().split('\n\n').map(entry => JSON.parse(entry));
            posts.sort((a, b) => new Date(b.date) - new Date(a.date));
            window.nwSearchLoadedFiles[file] = { text, posts, file, uri };
        }
        return window.nwSearchLoadedFiles[file];
    };
    window.nwSearch = async function (str) {
        if ('string' === typeof str && str.length < 2) return { results: [], total: null };
        if (window.nwSearchTextValue === str) return { results: window.nwSearchResults, total: window.nwSearchTotal};
        window.nwSearchTextValue = str;
        const lang = document.documentElement.lang;
        const checkpoint = Date.now();
        const searchStr = str.toLowerCase();
        const searchResponse = await fetch(`/search/index.json`, { cache: 'reload' });
        const searchData = await searchResponse.json();
        const version = searchData.version || '';
        const response = await fetch(`/search/${lang}.txt?ver=${version}`, {
            method: 'GET',
            headers: { 'Accept-Encoding': 'gzip, deflate, br' }
        });
        const contentEncoding = response.headers.get('Content-Encoding');
        const size = response.headers.get('Content-Length');
        const time = Date.now() - checkpoint;
        const msg = `search/${lang}.txt: ${(time / 1000).toFixed(2)}sec | ${(size / 1024).toFixed(1)}Kb | ${version.slice(0, 4)}..${version.slice(-4)}`;
        if (contentEncoding && contentEncoding.includes('gzip')) {
            console.log(msg);
        } else {
            console.error(msg);
        }
        const text = await response.text();

        const decode = (item) => {
            try {
                const json = JSON.parse(item);
                return {
                    uri: json['$'] || '',
                    title: json['t'] || '',
                    desc: json['d'] || '',
                    image: json['i'] || '',
                    body: json['c'] || '',
                    date: json['a'] || null,
                }
            } catch (err) {
                if (window.nwIsDebugMode()) console.error(err);
            }
            return {};
        };

        // Split the text into lines and group every 4 lines into one entry
        const lines = text.trim().split('\n\n').map(entry => decode(entry));

        const calculateScore = (str, tokens, title, desc, body) => {
            const fullText = title + " " + desc + " " + body;
            const lowerTitle = title.toLowerCase();
            const lowerDesc = desc.toLowerCase();
            const lowerText = fullText.toLowerCase();
            let tokenScore = 0;
            let distanceScore = 0;

            let t = lowerTitle.trim();
            let d = lowerDesc.trim();
            let e = lowerText.trim();
            let prevPosition = -1;
            tokens.forEach(token => {
                if (token.length < 3) return;
                t = t.replaceAll(token, '');
                d = d.replaceAll(token, '');
                e = e.replaceAll(token, '');
                const position = lowerText.indexOf(token);
                if (position !== -1) {
                    tokenScore += token.length;
                    if (prevPosition !== -1) {
                        const distance = Math.abs(position - prevPosition);
                        distanceScore += Math.max(0, (30 - distance));
                    }
                }
                prevPosition = position;
            });
            tokenScore += TITLE_SCORE_MULT * (lowerTitle.length - t.length);
            tokenScore += DESC_SCORE_MULT * (lowerDesc.length - d.length);
            tokenScore += TEXT_SCORE_MULT * (lowerText.length - e.length);

            let fullTitleScore = 0;
            if (lowerTitle.includes(str)) {
                fullTitleScore = TITLE_SCORE_MAX / Math.abs((str.length - lowerTitle.length) || 1);
            }
            let fullDescScore = 0;
            if (lowerDesc.includes(str)) {
                fullDescScore = DESC_SCORE_MAX / Math.abs((str.length - lowerDesc.length) || 1);
            }
            const fullTextScore = lowerText.includes(str) ? TEXT_SCORE_MAX : 0;
            return tokenScore + distanceScore + fullTitleScore + fullDescScore + fullTextScore;
        };

        const tokens = splitSearch(searchStr.toLowerCase());
        window.nwSearchStr = searchStr;
        window.nwSearchTokens = tokens;
        window.nwSearchMap = {};
        // Search and rank each entry
        const results = lines.map(({ uri, title, desc, image, body }) => {
            try {
                window.nwSearchMap[uri] = title;
                const score = calculateScore(searchStr, tokens, title, desc, body);
                return { uri, title, desc, image, body, score };
            } catch (err) {
                if (window.nwIsDebugMode()) console.error('Cannot parse search index', err);
                return { uri, title: 'NOT_FOUND', desc: '', image: '', body: '', score: 0 };
            }
        }).filter(result => result.score > 0); // Filter out entries with no matches

        // Sort the results by score in descending order
        results.sort((a, b) => b.score - a.score);

        window.nwSearchResults = results;
        window.nwSearchTotal = lines.length;

        return { results, total: window.nwSearchTotal };
    };
})();
// Modal search
// @depends window.nwFindParent(element, selector)
//          window.nwFindParent(element)
//          window.nwScrollTo(element)
//          window.nwTruncateText(text, maxLen)
//          window.nwEscapeHTML(text)
// @return
//  - window.nwHighlightText(text, className, insideOf = document.body, addRemovalOnClick = false) [ NodeElement ]
(() => {
    const QUERY_PARAM_FIND_TEXT = 'find';
    const QUERY_PARAM_FIND_LINK = 'findLink';
    const FOUND_TEXT_CLASS = 'found-h';
    const FOUND_LINK_CLASS = 'found-h';
    const IGNORE_FOUND_IN = ['header.root', 'footer.root', 'script', 'style'];
    const MODAL_SEARCH_MODAL_ID = 'searchModal';
    const MODAL_SEARCH_INPUT_ID = 'searchInput';
    const MODAL_SEARCH_RESULTS_ID = 'searchResults';
    const MODAL_SEARCH_TEMPLATE_ID = 'searchResultTemplate';
    const MODAL_SUMMARY_TEMPLATE_ID = 'searchSummaryTemplate';
    const MODAL_SEARCH_SUBMIT_ID = 'searchSubmit';
    const MODAL_SEARCH_FORM_ID = 'searchForm';
    const MODAL_BODY_CLASS_ON_SEARCH = 'searched';
    const FOUND_SUMMARY_CLASS = 'found';
    const SEARCH_ON_KEYDOWN = false;
    const SEARCH_ON_SUBMIT = true;
    const MAX_DESC_LEN = 255; // characters
    const RESULTS_PER_PAGE = 12; // items
    const SCROLL_TRIGGER_HEIGHT = 12; // px

    window.nwHighlightText = (text, className, insideOf = document.body, addRemovalOnClick = false) => {
        const elements = insideOf.querySelectorAll('*');
        const scrolles = []; // Array to hold elements to scroll to

        for (let element of elements) {
            // Skip elements that shouldn't be modified or don't have text nodes
            if (element.children.length > 0 || IGNORE_FOUND_IN.some(s => element.matches(s))) {
                continue;
            }

            let html = element.innerHTML;
            // Escape special characters in 'word' to use in regex
            const escapedWord = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedWord})`, 'gi');

            if (regex.test(html)) {
                html = html.replace(regex, `<span class="${className}">$1</span>`);
                scrolles.push(element);
            }
            element.innerHTML = html;
    
            // Remove highlight on click
            if (addRemovalOnClick) element.addEventListener('click', function() {
                this.innerHTML = this.innerHTML.replace(new RegExp(`<span class="${className}">(.*?)<\/span>`, 'gi'), '$1');
            });
        }
    
        return scrolles;
    };

    if ('function' !== typeof window['nwFindParent']) {
        return console.error('window.nwFindParent not found');
    }

    function decodePath(uri, last = 3) {
        const words = uri.split('/');
        const res = [];
        for (let i = 2; i < words.length; i++) {
            let rel = words.slice(1, i).join('/');
            if ('' === rel) rel += 'index';
            [
                '/' + rel,
                '/' + rel + '/index'
            ].forEach(guess => {
                guess = guess.endsWith('.html') ? guess.slice(0, guess.length - '.html'.length) : guess;
                if (window.nwSearchMap[guess]) {
                    res.push({ uri: guess + '.html', title: window.nwSearchMap[guess] });
                }
            });
        }
        return res.slice(- last);
    }

    function highlightSearchTerms(searchText, insideOf = document.body) {
        const elements = insideOf.querySelectorAll('*');
        const words = splitSearch(searchText);
        const scrolles = []; // Array to hold elements to scroll to
    
        for (let element of elements) {
            // Skip elements that shouldn't be modified or don't have text nodes
            if (element.children.length > 0 || IGNORE_FOUND_IN.some(s => element.matches(s))) {
                continue;
            }
    
            let html = element.innerHTML;
            for (const word of words) {
                // Escape special characters in 'word' to use in regex
                const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedWord})`, 'gi');
    
                if (regex.test(html)) {
                    html = html.replace(regex, `<span class="${FOUND_TEXT_CLASS}">$1</span>`);
                    scrolles.push(element);
                }
            }
            element.innerHTML = html;
    
            // Remove highlight on click
            element.addEventListener('click', function() {
                this.innerHTML = this.innerHTML.replace(new RegExp(`<span class="${FOUND_TEXT_CLASS}">(.*?)<\/span>`, 'gi'), '$1');
            });
        }
    
        return scrolles;
    }

    function findLinks(searchLink, insideOf = document.body) {
        const links = insideOf.querySelectorAll(`[href*="${searchLink}"]`);
        links.forEach(l => l.classList.add(FOUND_LINK_CLASS));
        return links;
    }

    function scrollToFirst(scrolles) {
        if (scrolles.length) {
            let topElement = scrolles.reduce((topElem, currentElem) => {
                return (currentElem.offsetTop < topElem.offsetTop) ? currentElem : topElem;
            }, scrolles[0]);
            window.nwScrollTo(topElement);
            return true;
        }
        return false;
    }

    const initModal = () => {
        const $modal    = document.getElementById(MODAL_SEARCH_MODAL_ID);
        const $input    = document.getElementById(MODAL_SEARCH_INPUT_ID);
        const $results  = document.getElementById(MODAL_SEARCH_RESULTS_ID);
        const $template = document.getElementById(MODAL_SEARCH_TEMPLATE_ID);
        const $submit   = document.getElementById(MODAL_SEARCH_SUBMIT_ID);
        const $form     = document.getElementById(MODAL_SEARCH_FORM_ID);
        const $summary  = document.getElementById(MODAL_SUMMARY_TEMPLATE_ID);
        if (!$input || !$results || !$template) {
            return console.error(`Modal search template not found`);
        }
        let currentPage = 0;
        let allResults = [];
        function showSummary(found, total) {
            if (!$summary) return false;
            const $row = $summary.content.cloneNode(true);
            $results.appendChild($row);
            const newRow = $results.lastElementChild;
            if (found) newRow.classList.add(FOUND_SUMMARY_CLASS);
            newRow.querySelectorAll('[nw="found"]').forEach(el => el.textContent = found);
            newRow.querySelectorAll('[nw="total"]').forEach(el => el.textContent = total);
            return true;
        }
        function appendResults() {
            const start = currentPage * RESULTS_PER_PAGE;
            const end = start + RESULTS_PER_PAGE;
            const pageResults = allResults.slice(start, end);
            pageResults.forEach(r => {
                const $row = $template.content.cloneNode(true);
                $row.querySelectorAll('[nw="img"]').forEach(i => i.setAttribute('src', r.image));
                $row.querySelectorAll('[nw="title"]').forEach(t => t.textContent = r.title);
                $row.querySelectorAll('[nw="desc"]').forEach(t => t.textContent = window.nwTruncateText(r.desc || r.body, MAX_DESC_LEN));
                $row.querySelectorAll('[nw="url"]').forEach(a => {
                    const findParam = `find=${encodeURIComponent($input.value)}`;
                    const href = r.uri + '.html';
                    if (href.includes('?')) {
                        a.setAttribute('href', `${href}&${findParam}`);
                    } else {
                        a.setAttribute('href', `${href}?${findParam}`);
                    }
                });
                $row.querySelectorAll('[nw="path"]').forEach(ol => {
                    ol.innerHTML = '';
                    decodePath(r.uri).forEach(({ uri, title }) => {
                        const $li = document.createElement('li');
                        $li.classList.add('breadcrumb-item');
                        $li.innerHTML = `<a href=${window.nwEscapeHTML(uri)}>${window.nwEscapeHTML(title)}</a>`;
                        ol.appendChild($li);
                    });
                    // last empty li for the / at the end.
                    const $li = document.createElement('li');
                    $li.classList.add('breadcrumb-item');
                    ol.appendChild($li);
                });
                $results.appendChild($row);
                const newRow = $results.lastElementChild;
                newRow.setAttribute('tabindex', '0');
                newRow.setAttribute('role', 'button');
                highlightSearchTerms($input.value, newRow);
            });
            $results.querySelectorAll('article footer').forEach(el => {
                if (el.scrollHeight > el.clientHeight) {
                    el.parentElement.classList.add('overflow');
                }
            });
            currentPage++;
        }
        function doSearch(event) {
            if (event) event.preventDefault();
            $results.innerHTML = '';
            allResults = [];
            window.nwSearch($input.value).then(res => {
                const results = res.results;
                currentPage = 0;
                allResults = res.results;
                showSummary(results.length, res.total);
                appendResults();
                const handleScroll = () => {
                    const { scrollTop, scrollHeight, clientHeight } = $results;
                    if (scrollTop + clientHeight >= scrollHeight - SCROLL_TRIGGER_HEIGHT) {
                        appendResults();
                    }
                };
                $results.removeEventListener('scroll', handleScroll);
                $results.addEventListener('scroll', handleScroll);
            });
        }
        // Handle Tab navigation within results
        $results.addEventListener('keydown', function (e) {
            const focusableElements = Array.from($results.children);
            const focusedElement = document.activeElement;
            if (!focusableElements.includes(focusedElement)) return;
    
            if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault(); // Prevent the default Tab behavior
    
                const focusableElements = Array.from($results.children);
                const focusedElement = document.activeElement;
                const currentIndex = focusableElements.indexOf(focusedElement);
    
                let nextIndex = 0;
                if (e.key === 'Tab' || e.key === 'ArrowDown') {
                    if (currentIndex + 1 >= focusableElements.length) {
                        appendResults();
                    }
                    nextIndex = currentIndex + 1 < focusableElements.length ? currentIndex + 1 : 0;
                } else if (e.key === 'ArrowUp' || e.key === 'Tab' && e.shiftKey) {
                    nextIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : focusableElements.length - 1;
                }
    
                focusableElements[nextIndex].focus();
            }
            if (e.key === 'Enter') {
                const link = focusedElement.querySelector('[nw="url"]');
                if (link) link.click();
            }
        });
        if (SEARCH_ON_KEYDOWN) {
            $input.addEventListener('keyup', doSearch);
        }
        if (SEARCH_ON_SUBMIT) {
            if ($submit) $submit.addEventListener('click', doSearch);
            if ($form) $form.addEventListener('submit', doSearch);
        }
        $modal.addEventListener('shown.bs.modal', () => $input.focus());
    };
    initModal();

    document.addEventListener('DOMContentLoaded', function() {
        function getQueryStringValue(key) {
            const params = new URLSearchParams(window.location.search);
            const value = params.get(key);
            if (!value) return value;
            return value;
        }
        function containsText(node, text) {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.nodeValue.includes(text);
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                for (let child of node.childNodes) {
                    if (containsText(child, text)) {
                        return true;
                    }
                }
            }
            return false;
        }
        
        const searchText = getQueryStringValue(QUERY_PARAM_FIND_TEXT);
        if (searchText) {
            const scrolles = highlightSearchTerms(searchText);
            scrollToFirst(scrolles);
        }
        const searchLink = getQueryStringValue(QUERY_PARAM_FIND_LINK);
        if (searchLink) {
            const scrolles = findLinks(searchLink);
            scrollToFirst(Array.from(scrolles));
        }
        return;
    });
})();

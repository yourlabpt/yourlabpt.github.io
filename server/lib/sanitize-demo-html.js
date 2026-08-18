'use strict';

const ANY_DASH = '[-\\u00AD\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212]';

function closeUnclosedStyle(html) {
    const opens = (html.match(/<style\b/gi) || []).length;
    const closes = (html.match(/<\/style>/gi) || []).length;
    if (opens <= closes) return html;
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, '</style></head>');
    if (/<body\b/i.test(html)) return html.replace(/<body\b/i, '</style><body');
    return `${html}</style>`;
}

function sanitizeDemoHtml(html) {
    let out = closeUnclosedStyle(String(html || ''));
    out = out.replace(new RegExp(`var\\(\\s*${ANY_DASH}+`, 'g'), 'var(--');
    out = out.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (full, attrs, css) => {
        const clean = String(css)
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
        return `<style${attrs}>${clean}</style>`;
    });
    return out;
}

module.exports = { sanitizeDemoHtml };

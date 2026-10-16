import {Marked} from './vendor/marked.js';
import DOMPurify from './vendor/purify.mjs';
import katex from './vendor/katex/katex.mjs';

const delimiters = [
  {open: '\\\\[', close: '\\\\]', display: true},
  {open: '\\[', close: '\\]', display: true},
  {open: '$$', close: '$$', display: true},
  {open: '\\\\(', close: '\\\\)', display: false},
  {open: '\\(', close: '\\)', display: false},
  {open: '$', close: '$', display: false}
];
const escapeHTML = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Tokenize before Markdown processes backslash escapes or underscores in TeX.
export function mathToken(source, block = false) {
  const offset = block ? source.match(/^ {0,3}/)[0].length : 0;
  const text = source.slice(offset);
  for (const form of delimiters) {
    if (block && !form.display) continue;
    if (!text.startsWith(form.open)) continue;
    if (form.open === '$' && (text.startsWith('$$') || /\s/.test(text[1] || ''))) continue;
    let end = text.indexOf(form.close, form.open.length);
    if (form.open === '$' || form.open === '$$') {
      // An escaped dollar is part of a formula, not its closing delimiter.
      while (end !== -1) {
        let slashes = 0; for (let i = end - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
        if (!(slashes % 2)) break;
        end = text.indexOf(form.close, end + form.close.length);
      }
    }
    if (end === -1) {
      if (form.open === '$') continue; // Avoid treating ordinary currency as pending math.
      return {type: block ? 'mathBlock' : 'mathInline', raw: source, pending: true, display: form.display};
    }
    const tex = text.slice(form.open.length, end);
    if (form.open === '$' && (!tex.trim() || /\n/.test(tex) || /\s$/.test(tex))) continue;
    const length = offset + end + form.close.length;
    const tail = source.slice(length);
    if (block && !/^[ \t]*(?:\n|$)/.test(tail)) continue;
    const suffix = block ? tail.match(/^[ \t]*(?:\n|$)/)[0] : '';
    return {type: block ? 'mathBlock' : 'mathInline', raw: source.slice(0, length) + suffix, tex, display: form.display, pending: false};
  }
}

export function formatted(text, {streaming = false} = {}) {
  const node = document.createElement('div'); node.className = 'answer';
  const formulas = [];
  const renderToken = token => {
    const index = formulas.push(token) - 1;
    const tag = token.type === 'mathBlock' ? 'div' : 'span';
    return `<${tag} class="math-slot" data-math-index="${index}"></${tag}>`;
  };
  const parser = new Marked({
    gfm: true, breaks: true,
    renderer: {
      html: token => escapeHTML(token.text),
      image: token => escapeHTML(`[图片：${token.text || '图片'}]`)
    },
    extensions: [
      {name:'mathBlock', level:'block', start: src => {
        const match = /(?:^|\n) {0,3}(?:\\{1,2}\[|\$\$)/.exec(src);
        return match ? match.index + (match[0].startsWith('\n') ? 1 : 0) : undefined;
      }, tokenizer: src => mathToken(src, true), renderer: renderToken},
      {name:'mathInline', level:'inline', start: src => {
        const match = /\\{1,2}[\[(]|\$/.exec(src); return match?.index;
      }, tokenizer: src => mathToken(src), renderer: renderToken}
    ]
  });
  try {
    const html = parser.parse(String(text));
    node.innerHTML = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p','br','strong','em','del','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','a','table','thead','tbody','tr','th','td','div','span'],
      ALLOWED_ATTR: ['href','title','start','class','data-math-index','align'],
      ALLOW_DATA_ATTR: false
    });
    for (const link of node.querySelectorAll('a')) {
      try {
        const url = new URL(link.getAttribute('href'));
        if (!['https:','http:'].includes(url.protocol)) throw new Error('unsupported protocol');
        link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      } catch { link.removeAttribute('href'); }
    }
    for (const slot of node.querySelectorAll('.math-slot')) {
      const token = formulas[Number(slot.dataset.mathIndex)];
      slot.removeAttribute('data-math-index');
      if (!token) { slot.remove(); continue; }
      if (token.pending) {
        slot.className = 'math-pending'; slot.textContent = token.raw;
        slot.title = streaming ? '公式接收中，完整后自动排版' : '公式缺少结束符，已保留原文';
        continue;
      }
      try {
        katex.render(token.tex, slot, {
          displayMode: token.display, throwOnError: true, trust: false,
          strict: 'ignore', maxExpand: 1000, maxSize: 20, output: 'htmlAndMathml'
        });
        slot.className = token.display ? 'math-rendered math-block' : 'math-rendered';
      } catch {
        slot.className = 'math-error'; slot.textContent = token.raw.trim();
        slot.title = '此公式无法解析，已保留原文';
      }
    }
    for (const table of node.querySelectorAll('table')) {
      const wrapper = document.createElement('div'); wrapper.className = 'table-scroll';
      table.replaceWith(wrapper); wrapper.append(table);
    }
  } catch {
    node.classList.add('render-fallback'); node.textContent = String(text);
  }
  return node;
}

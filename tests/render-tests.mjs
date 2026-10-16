import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'https://extension.test/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
const {formatted,mathToken}=await import('../extension/render.js');
const sample=await (await import('node:fs/promises')).readFile(new URL('../fixtures/markdown-math.md',import.meta.url),'utf8');
const rendered=formatted(sample);
assert.equal(rendered.querySelectorAll('.katex').length,4,'用户示例的四条公式必须全部排版');
assert.equal(rendered.querySelectorAll('math').length,4,'公式同时包含辅助阅读 MathML');
assert.equal(rendered.querySelectorAll('ul>li').length,2,'例子必须显示为两个列表项');
assert.ok([...rendered.querySelectorAll('code')].some(c=>c.textContent==='spam_score'));
assert.equal(rendered.querySelectorAll('.math-error').length,0,'中文与分式不应解析失败');
assert.equal(rendered.querySelectorAll('li .katex').length,2,'缩进公式必须保留在所属列表中');
const syntax=formatted(String.raw`# 标题

**粗体**、*斜体*、~~删除线~~，行内公式 \(x_i^2\) 和 $a+b$。

$$\frac{1}{2}$$

> 引用内容

1. 第一项
2. 第二项

| 概念 | 说明 |
| --- | --- |
| 概率 | 值 |

[文档](https://example.com) [恶意链接](javascript:alert(1))

<img src="https://external.test/tracker" onerror="alert(1)"><script>alert(1)</script>
`.replace(/\\`/g,'`'));
assert.ok(syntax.querySelector('h1'));assert.ok(syntax.querySelector('strong'));assert.ok(syntax.querySelector('em'));assert.ok(syntax.querySelector('del'));assert.equal(syntax.querySelectorAll('.katex').length,3);assert.equal(syntax.querySelectorAll('ol>li').length,2);assert.ok(syntax.querySelector('.table-scroll table'));assert.ok(syntax.querySelector('blockquote'));
assert.equal(syntax.querySelectorAll('script,img,[onerror]').length,0);
assert.equal(syntax.querySelector('a[href^="javascript:"]'),null);
assert.equal(syntax.querySelector('a[href="https://example.com/"]').rel,'noopener noreferrer');
const code=formatted('```tex\n\\[x_1\\]\n```\n\n`$x$`');assert.equal(code.querySelectorAll('.katex').length,0);assert.equal(code.querySelector('pre code').textContent,'\\[x_1\\]\n');assert.ok(code.querySelector('code').textContent.includes('\\['));
const doubled=formatted(String.raw`\\[ P = \frac{3}{101} \\]`);assert.equal(doubled.querySelectorAll('.katex').length,1,'兼容双反斜杠公式分隔符');
const invalid=formatted(String.raw`\[\unknowncommand{x}\]`);assert.equal(invalid.querySelectorAll('.math-error').length,1);assert.ok(invalid.textContent.includes('unknowncommand'));
const pending=formatted(String.raw`正在生成 \[\frac{2`,{streaming:true});assert.equal(pending.querySelectorAll('.math-pending').length,1);assert.ok(pending.textContent.includes('\\frac{2'));
const untrusted=formatted(String.raw`\[\href{javascript:alert(1)}{点击}\]`);assert.equal(untrusted.querySelector('a[href^="javascript:"]'),null);
assert.equal(mathToken(String.raw`\[x_1\]`).tex,'x_1');
console.log('通过：用户原例四条中文公式、列表嵌套公式、四种标准数学分隔符、双斜杠分隔符、Markdown 标题/列表/表格/代码、流式半截公式、错误公式回退与 HTML/链接安全。');

# 本地渲染依赖

Marked 18.1.1（MIT）、DOMPurify 3.4.17（Apache-2.0 OR MPL-2.0）、KaTeX 0.19.0（MIT）。许可证随本目录交付。

全部脚本、样式和公式字体均在扩展本地加载，不请求 CDN。

渲染流程：识别数学 token → Markdown → HTML 清洗 → KaTeX 本地公式排版。禁止执行原始 HTML，禁用数学可信命令，并限制宏展开。

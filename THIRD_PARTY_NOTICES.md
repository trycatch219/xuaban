# 第三方依赖与声明

项目自身的 MIT 许可证不替代第三方文件原有许可证。分发扩展时请保留 vendor 文件及许可证。

| 组件 | 固定版本 | 用途 | 许可证文件 |
| --- | --- | --- | --- |
| Marked | 18.1.1 | Markdown 解析 | [MIT](extension/vendor/MARKED-LICENSE.txt) |
| DOMPurify | 3.4.17 | HTML 清洗 | [Apache-2.0 / MPL-2.0 双许可证文本](extension/vendor/DOMPURIFY-LICENSE.txt) |
| KaTeX | 0.19.0 | 数学排版、样式和字体 | [MIT](extension/vendor/KATEX-LICENSE.txt) |

上述脚本、样式和字体在扩展内本地打包，不通过 CDN 加载。

jsdom 30.1.2 及其传递依赖仅用于开发测试，不放入扩展 ZIP。其版本、来源与完整性记录在 package-lock.json 中，许可证可在安装后的对应 npm 包内查看。更新依赖后应重新核对 notices、保留许可证并执行全部测试。

docs/images/interface-concept.png 为本项目早期界面概念图，使用内置图像生成工具生成；它不是浏览器实测截图。preview 中图示为代码生成的示意图。教程样本与测试 Key 为非真实服务数据。

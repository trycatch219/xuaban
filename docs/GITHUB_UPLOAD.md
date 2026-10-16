# 上传 GitHub

本源码包没有预设远程仓库，也没有代你发布任何内容。仓库名可以使用 xueban 或自己的名称。

## 上传前

- 确认接受根目录 MIT 许可证，必要时调整版权主体。
- 确认项目名、版本与 Firefox 扩展 ID；当前 ID 是开发用标识。
- 不填写或提交真实 API Key；不需要把 Key 配成 GitHub Secrets 来运行测试。
- 阅读 PRIVACY.md，检查文档与自己的分发方式一致。
- GitHub Actions 配置已提供，但只有仓库实际运行成功后才能声称 CI 通过。

## 方法一：Git 命令（推荐）

在 GitHub 新建一个空仓库，暂不让 GitHub 初始化 README、License 或 .gitignore，因为本源码包已经包含这些文件。

解压源码包，进入直接包含 README.md 与 package.json 的目录，执行：

```bash
git init
git branch -M main
git add .
git status
git diff --cached --stat
git commit -m "Initial release: Xueban browser extension 0.4.0"
```

确认暂存内容不含 node_modules、dist、缓存和私人数据，再设置远程地址。下面的 YOUR_USERNAME 与仓库名必须替换成自己的：

```bash
git remote add origin https://github.com/YOUR_USERNAME/xueban.git
git push -u origin main
```

首次提交需要本机配置 Git 用户信息，认证按 GitHub 当前提供的方式完成。不要将账号令牌写入远程 URL 或项目文件。

## 方法二：GitHub 网页上传

上传解压目录内的源码文件和文件夹，不要只上传整个源码 ZIP。否则仓库首页无法直接展示 README，也不便于查看代码。

必须保留 `.github/`、`.gitignore`、`.gitattributes`、`.editorconfig`、`.nvmrc` 等点开头的文件。网页上传完成后，请逐项确认它们存在；若上传工具漏掉隐藏文件，改用 Git。

## 上传后

1. 查看仓库 README 的图片和相对链接。
2. 查看 Actions 中 CI 是否成功；修复失败后再发布。
3. 在 Security 设置中按需开启 private vulnerability reporting。
4. 在仓库 About 中填写项目说明；尚未发布商店时不填写虚构商店链接。
5. 如需提供下载，按 RELEASING.md 将浏览器安装 ZIP 放到 GitHub Release。

仓库 README 含本地预览链接，用户必须先运行 `npm run preview`；它不是已部署的公开网站。

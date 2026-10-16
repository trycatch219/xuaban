# 构建与发布

## 版本与构建

1. 同步修改 package.json、extension/manifest.json、manifests/firefox.json 和 package-lock.json 根版本。
2. 更新 CHANGELOG、README 与影响到的隐私说明。
3. 运行 `npm ci`、`npm run check`、`npm test`。
4. 运行 `npm run package`，输出：

```text
dist/chromium/
dist/firefox/
dist/xueban-chromium-0.4.0.zip
dist/xueban-firefox-0.4.0.zip
dist/SHA256SUMS.txt
```

打包脚本使用 Node 内置模块写入普通无压缩 ZIP，便于跨平台运行，不依赖系统 zip 命令。归档排序与时间字段固定，同一输入重复打包应得到相同校验值。体积可能比压缩 ZIP 大，但可按普通 ZIP 解压。

构建会重建 dist/chromium 和 dist/firefox，因此不要在这两个生成目录中直接维护源码。dist 被 .gitignore 排除。

## GitHub Release

先按 TESTING.md 验证生成目录，在 GitHub 手动创建对应 tag / Release，附上两个 ZIP 与 SHA256SUMS.txt，说明功能、浏览器验证范围及尚未签名状态。不要把 node_modules、缓存、浏览器用户数据或 Key 附到 Release。

当前工作流不自动创建 tag、发布 Release 或上传商店，需要维护者自己执行这些发布动作。

## 浏览器商店

GitHub ZIP 是开发加载包，不等于商店已审核安装包。正式分发前需要准备图标、准确实测截图、维护者信息、隐私页面、权限理由，并按目标商店当时要求检查 Manifest、数据声明与签名。

Firefox manifest 中扩展 ID 为开发用标识，且数据收集声明仍需针对实际分发审核；不能把现有配置视为已符合审核要求。Safari 尚无可发布构建。

## 更新现有安装

保持已加载目录路径不变，覆盖新构建后关闭侧栏并在扩展管理页重新加载。若改成另一个路径或卸载后重装，扩展身份及本地数据可能变化；更新前可导出重要记录。

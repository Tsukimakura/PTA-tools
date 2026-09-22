# 贡献指南

感谢你愿意改进 PTA-Tools。无论是错误报告、文档修正、题型适配还是代码贡献，都请遵循本指南。

参与项目即表示你同意遵守 [行为准则](CODE_OF_CONDUCT.md)。安全漏洞不要提交公开 Issue，请按照 [安全策略](SECURITY.md) 私下报告。

## 开始之前

提交 Issue 前，请先：

1. 搜索现有 Issue，避免重复报告；
2. 使用最新的 `main` 分支复现问题；
3. 区分工具缺陷与 PTA 平台自身的接口或权限限制；
4. 删除日志、截图和导出文件中的 Cookie、密码、Webhook、学号及未公开题目内容。

功能建议应说明使用场景、期望行为和可能的副作用。涉及开始考试、提交答案、发送消息或修改远端数据的功能，必须明确指出外部状态变化。

## 本地开发

项目要求 Node.js 22.12 或更高版本。

```bash
git clone https://github.com/Tsukimakura/PTA-tools.git
cd PTA-tools
npm install
cp config.example.json config.json
npm run check
```

如果只修改文档或运行不需要浏览器的测试，可以跳过 Chrome 下载：

```bash
PUPPETEER_SKIP_DOWNLOAD=true npm ci
```

不要提交 `config.json`、`pta_status.json`、`downloads/`、日志或任何真实凭据。

## 分支与提交

建议从最新的 `main` 创建短生命周期分支：

```text
feat/todo-filter
fix/session-expiry
docs/configuration
refactor/api-client
```

提交应保持单一职责，并使用 Conventional Commits 风格：

```text
feat(cli): add a new command
fix(auth): validate refreshed cookies
docs: explain monitor deployment
test(parser): cover nested code fences
refactor(api): centralize response handling
chore(deps): upgrade Puppeteer
```

- 一个提交只解决一个可独立说明和回滚的问题；
- 不要把格式化、依赖升级和业务修改混在同一提交；
- 标题使用祈使语气，控制在简洁可读的长度；
- 行为不兼容时，在正文中加入 `BREAKING CHANGE:` 说明。

## 代码约定

- 使用 CommonJS，与现有模块风格保持一致；
- 优先使用 `async/await`，异步调用必须处理失败路径；
- PTA URL 统一放在 `src/api/endpoints.js`；
- PTA 请求统一通过 `src/api/client.js`，不要绕过认证、超时和重试策略；
- 业务逻辑放在 `src/services/`，命令入口只负责参数解析和调度；
- 配置、状态及导出文件使用原子写入工具，避免生成半截文件；
- 新增外部副作用前应提供清晰确认或使用显式子命令；
- 不在日志、错误消息或测试快照中输出 Cookie、密码及 Webhook；
- 对 PTA 返回数据保持防御性解析，不假设可选字段一定存在。

新增 CLI 子命令时，请同步更新：

1. `bin/pta.js` 的分发和帮助信息；
2. `package.json` 中必要的 scripts 或 bin 配置；
3. README 命令表；
4. 自动化测试。

## 测试

提交前必须运行：

```bash
npm run check
```

测试应满足：

- 默认不访问真实 PTA 或钉钉服务；
- 不开始题目集、不提交答案、不发送通知；
- 使用依赖注入或模拟 `fetch` 覆盖网络逻辑；
- 对修复的问题添加能够在修改前失败的回归测试；
- 涉及 Node.js 版本或锁文件时，在空目录执行一次 `npm ci`。

如确实需要手工联调，请在 PR 中说明测试账号环境、执行过的命令和产生的外部副作用，但不要附带真实凭据。

## Pull Request

创建 PR 前确认：

- [ ] 改动范围明确，提交历史按功能拆分；
- [ ] `npm run check` 已通过；
- [ ] 新行为有测试或说明无法自动测试的原因；
- [ ] README、配置示例和变更日志已按需更新；
- [ ] 未包含账号、Cookie、Webhook、个人信息或课程私有内容；
- [ ] 已说明兼容性变化和潜在外部副作用。

PR 描述应包含问题背景、解决方案、验证方式和关联 Issue。维护者可能要求进一步拆分提交或补充测试。

## 许可证

提交代码即表示你有权提供该贡献，并同意其按照项目的 [GNU GPL-3.0-only](LICENSE) 许可证发布。

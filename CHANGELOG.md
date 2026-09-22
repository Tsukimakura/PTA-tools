# 变更记录

本文件记录 PTA-Tools 的重要变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 新增

- 统一的 `pta` 命令及 `cli`、`todo`、`monitor` 子命令；
- 钉钉未结束题目集待办摘要；
- 判断、选择、程序填空、代码填空和编程题的交互式提交；
- 进行中题目集答案导出、多文件题归档和终端评测报告；
- Node.js 内置测试与 Node 22/24 CI；
- 中文 README、贡献指南、安全策略和社区行为准则。

### 变更

- Puppeteer 升级至 25.11.0，最低 Node.js 版本调整为 22.12；
- Monitor 使用分页结果，并依据缓存时间推进缺失题目集的状态；
- 普通下载和归档共用 Markdown 清洗与转义逻辑；
- 环境变量优先于 `config.json`，本地配置权限自动收紧为 `0600`。

### 修复

- 评测轮询绑定最新提交 ID，避免返回旧提交结果；
- PTA GET 请求增加超时、重试和 HTTP 状态检查；
- 配置、状态及导出内容采用原子写入；
- 修复 Monitor 因接口分页或临时缺项而误判结束的问题；
- 修复 Markdown 中代码围栏、空答案和表格字符破坏文档的问题；
- 修复 npm 锁文件中可选 Node 类型依赖缺失导致的 `npm ci` 失败。

### 安全

- 登录后先通过 PTA API 验证 Cookie，再写入本地配置；
- 更新 Puppeteer 及相关传递依赖，当前 npm 审计无已知漏洞。

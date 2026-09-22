# PTA-Tools

[![CI](https://github.com/Tsukimakura/PTA-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/Tsukimakura/PTA-tools/actions/workflows/ci.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-339933.svg)](https://nodejs.org/)

PTA-Tools 是一个面向 [PTA（Pintia）](https://pintia.cn/) 平台的非官方命令行工具。它可以在终端中浏览题目集、导出题面与答题记录、提交答案、查看成绩，并通过钉钉机器人发送待办摘要或持续监控题目集状态。

> [!IMPORTANT]
> 本项目依赖 PTA 当前的网页接口，不受 PTA 官方支持。平台接口、登录流程或风控策略发生变化时，部分功能可能需要同步适配。请遵守平台规则，不要用于高频抓取、绕过考试限制或其他违规用途。

## 功能概览

| 功能 | 说明 |
| --- | --- |
| 交互式控制台 | 使用方向键选择题目集，并根据状态显示对应操作 |
| 题面下载 | 将不同题型的题面整理为 Markdown |
| 进度导出 | 导出进行中题目集及服务器上已保存的答案 |
| 完整归档 | 导出已结束题目集的代码、分数、评测结果与测试点信息 |
| 终端成绩单 | 查看排名、总分、分题型得分和完成进度 |
| 命令行提交 | 支持判断、选择、程序填空、代码填空和编程题 |
| 钉钉待办摘要 | 一次性发送所有进行中及未开始的题目集 |
| 状态监控 | 持续检测新题目集及状态变化并发送钉钉通知 |

目前可以解析的题型包括：

- `TRUE_OR_FALSE`
- `MULTIPLE_CHOICE`
- `PROGRAMMING`
- `CODE_COMPLETION`
- `FILL_IN_THE_BLANK_FOR_PROGRAMMING`
- `MULTIPLE_FILE`（当前仅支持下载和归档，不支持命令行提交）

## 环境要求

- Node.js 22.12 或更高版本
- npm
- 可启动图形界面的桌面环境，用于首次登录或 Cookie 失效后的重新认证
- 可选：钉钉自定义机器人 Webhook

Puppeteer 会在正常安装时下载匹配版本的 Chrome。首次登录可能需要在浏览器中手动完成验证码。

## 安装

```bash
git clone https://github.com/Tsukimakura/PTA-tools.git
cd PTA-tools
npm install
npm link
```

`npm link` 会为当前 Node.js 环境注册全局命令 `pta`。如果使用 NVM 并切换了 Node.js 版本，需要在项目目录重新执行一次 `npm link`。

不希望注册全局命令时，也可以直接使用仓库内的 npm scripts：

```bash
npm run cli
npm run todo
npm run monitor
```

## 配置

推荐使用环境变量保存账号和密码：

```bash
export PTA_USERNAME="your_email@example.com"
export PTA_PASSWORD="your_password"
export DINGTALK_WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=..."
export PTA_REFRESH_INTERVAL="30000"
```

也可以复制配置模板：

```bash
cp config.example.json config.json
```

```json
{
  "username": "",
  "password": "",
  "cookie": "",
  "dingdingWebhook": "",
  "refreshInterval": 30000
}
```

### 配置项

| JSON 字段 | 环境变量 | 必需 | 说明 |
| --- | --- | --- | --- |
| `username` | `PTA_USERNAME` | 登录时可选 | PTA 登录账号；未配置时可在浏览器中手动输入 |
| `password` | `PTA_PASSWORD` | 登录时可选 | PTA 登录密码；未配置时可在浏览器中手动输入 |
| `cookie` | `PTA_COOKIE` | 否 | 已登录 Cookie；通常由工具验证后自动保存 |
| `dingdingWebhook` | `DINGTALK_WEBHOOK` | 通知功能必需 | 钉钉自定义机器人 Webhook |
| `refreshInterval` | `PTA_REFRESH_INTERVAL` | 否 | Monitor 轮询间隔，单位为毫秒，默认 5 分钟、最小 1 秒 |

环境变量优先于 `config.json`。`config.json`、`pta_status.json` 和 `downloads/` 均已加入 `.gitignore`；在类 Unix 系统上，工具还会自动将 `config.json` 权限限制为 `0600`。

> [!WARNING]
> `PTA_COOKIE` 环境变量不会被程序永久修改。如果通过环境变量提供的 Cookie 已失效，即使当前进程重新登录成功，下次启动前仍应删除或更新旧的 `PTA_COOKIE`。

## 命令

```text
pta [command]
```

| 命令 | 短别名 | 说明 |
| --- | --- | --- |
| `pta` / `pta cli` | `pta c` | 打开交互式控制台 |
| `pta todo` | `pta t` | 立即发送一次钉钉待办摘要 |
| `pta monitor` | `pta m` | 启动持续状态监控 |
| `pta help` | `pta h` | 显示命令帮助 |

兼容入口 `pta-tools` 和 `pta-monitor` 仍然保留。

## 使用方式

### 交互式控制台

```bash
pta
```

工具会分页获取账号下的全部题目集，并根据时间计算状态：

- `NOT_STARTED`：尚未开始
- `ONGOING`：正在进行
- `ENDED`：已经结束

对于未开始或进行中的题目集，可以查看进度、下载题面、导出已保存答案或进入提交界面。对于已结束题目集，可以查看成绩单或生成完整归档。

某些操作需要考试会话。如果题目集尚未开始，工具会先询问是否要开始；只有明确确认后才会向 PTA 发送开始请求。

### 钉钉待办摘要

```bash
pta todo
```

该命令执行一次即时查询，并发送一条包含以下内容的 Markdown 消息：

- 所有 `ONGOING` 题目集，按截止时间排序
- 所有 `NOT_STARTED` 题目集，按开始时间排序
- 开始时间、截止时间及相对剩余时间

这是通过机器人 Webhook 发送的“待办摘要消息”，不会创建钉钉原生 Todo 对象。原生 Todo API 需要钉钉企业应用及额外授权凭据。

### 持续状态监控

```bash
pta monitor
```

Monitor 会：

1. 建立本地状态快照 `pta_status.json`；
2. 按配置间隔分页拉取近期题目集；
3. 检测新题目集以及 `NOT_STARTED → ONGOING → ENDED` 状态变化；
4. 通过钉钉机器人发送变化摘要；
5. 在启动和退出时发送进程状态通知。

Monitor 是前台常驻进程。如需长期后台运行，请使用 systemd、PM2 或其他进程管理器。

## 输出文件

所有导出文件默认写入 `downloads/`：

```text
downloads/
├── 题目集名称.md
├── [Progress] 题目集名称.md
└── [Archive] 题目集名称.md
```

- 普通文件：仅包含整理后的题面
- `[Progress]`：题面与当前已保存答案
- `[Archive]`：题面、答案、代码、得分及评测详情

同名文件会通过原子写入安全覆盖。多文件题归档中包含的附件链接可能是 PTA 提供的临时地址，过期后需要重新生成归档。

## 项目结构

```text
bin/
├── pta.js                 # 统一命令入口
├── pta-cli.js             # 交互式控制台
└── pta-monitor.js         # 状态监控器
src/
├── api/                   # PTA 请求封装与端点
├── auth/                  # Puppeteer 登录与 Cookie 验证
├── services/              # 下载、归档、报告、提交和通知业务
└── utils/                 # 配置、文件写入与通用工具
test/                      # Node.js 内置测试运行器测试
```

## 开发与验证

```bash
npm test        # 运行自动化测试
npm run check   # 语法检查并运行测试
```

测试使用模拟 HTTP 响应，不会登录 PTA、开始题目集、提交答案或发送钉钉通知。CI 会在 Node.js 22 和 24 上执行相同检查。

提交改动前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按照 [SECURITY.md](SECURITY.md) 私下报告。

## 常见问题

### 登录浏览器无法启动

确认当前系统能够运行 Chrome，并检查 Puppeteer 的系统依赖。在纯服务器环境中，可以先在有图形界面的机器上登录，或通过安全渠道配置有效的 `PTA_COOKIE`。

### `pta` 命令不存在

在项目目录执行：

```bash
npm link
```

使用 NVM 时，确保执行 `npm link` 和运行 `pta` 时使用的是同一个 Node.js 版本。

### 钉钉消息未发送

检查 `DINGTALK_WEBHOOK` 或 `dingdingWebhook` 是否配置正确，并确认机器人安全策略允许消息内容。命令会在 HTTP 失败或钉钉返回非零 `errcode` 时退出失败。

### PTA 接口返回认证错误

删除配置中的旧 Cookie 后重新运行命令。工具会打开浏览器重新登录，并在保存 Cookie 前调用 PTA API 验证会话。

## 贡献、安全与许可

- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)
- 行为准则：[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- 安全策略：[SECURITY.md](SECURITY.md)
- 变更记录：[CHANGELOG.md](CHANGELOG.md)
- 许可证：[GNU GPL-3.0-only](LICENSE)

联系方式：

- QQ：2889908070
- 邮箱：[chenlingshi@zju.edu.cn](mailto:chenlingshi@zju.edu.cn)

# PTA-Tools

A comprehensive automation and utility toolkit for the Pintia (PTA) platform. While designed as a multi-functional suite for future expansions, it currently features a robust background status monitoring system.

## Current Component

**Monitor (`monitor.js`)**

An automated background service that polls the PTA platform API to monitor problem set state changes and pushes instant alerts via Webhooks.

---

## Getting Started

### Prerequisites
* Node.js >= 18.x
* Chrome/Chromium dependencies (required for Puppeteer execution under Linux environments)

### Installation
1. Clone the repository and install the required dependencies:

```bash
git clone https://github.com/Tsukimakura/PTA-tools.git
cd PTA-Tools
npm install
```

2. Initialize your local configuration by copying the production template:

```bash
cp config.example.json config.json
```


3. Populate `config.json` with your configurations:

```json
{
  "username": "your_email@example.com",
  "password": "your_password",
  "cookie": "",
  "apiUrl": "https://pintia.cn/api/...",
  "dingdingWebhook": "https://oapi.dingtalk.com/robot/send?access_token=...",
  "refreshInterval": 30000
}
```
* The unit of `refreshInterval` is milliseconds.


### Running

To start the daemon process locally:

```bash
node monitor.js
```


---

## More

PR 请先联系我。能力有限，仍在学习。欢迎指教和交流。

QQ：2889908070
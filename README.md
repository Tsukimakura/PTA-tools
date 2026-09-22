# PTA-Tools

A useful (I hope) toolkit for the PTA (Pintia) platform.

---

## Features

* **Interactive CLI Management:** Seamlessly navigate through current and historical problem sets using arrow keys.
* **Dual-Mode Downloader:** For ongoing problem-sets (Clean Mode), download the problems. For ended ones (Archive Mode), download more information like scores/answers/ranks etc.
* **Terminal Report Cards:** Direct command-line data grid showing the basic information of the chosen problem-set.
* **Proactive Status Monitor:** Persistent foreground poller that computes real-time status changes and emits notifications via DingTalk webhooks.

---

## Installation

1. **Clone the Repository:**

```bash
git clone https://github.com/Tsukimakura/PTA-tools.git
cd PTA-tools
```

2. **Install Dependencies:**

```bash
npm install
```


3. **Configuration:**

Environment variables are recommended for credentials:

```bash
export PTA_USERNAME="your_email@example.com"
export PTA_PASSWORD="your_password"
export DINGTALK_WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=..."
export PTA_REFRESH_INTERVAL="30000"
```

Alternatively, copy the example configuration:

```bash
cp config.example.json config.json
```


Open `config.json` and insert the values you need. `cookie` is optional because a
validated session cookie is captured after browser login.

```json
{
  "username": "",
  "password": "",
  "cookie": "",
  "dingdingWebhook": "https://oapi.dingtalk.com/robot/send?access_token=...",
  "refreshInterval": 30000
}
```

Environment variables override values from `config.json`. The full supported set
is `PTA_USERNAME`, `PTA_PASSWORD`, `PTA_COOKIE`, `DINGTALK_WEBHOOK`, and
`PTA_REFRESH_INTERVAL`. On Unix-like systems, the tool restricts `config.json` to
the current user (`0600`) before using it. The file remains excluded from Git.

---

## Usage Guide

### 1. Interactive Console

To start downloading assignments or inspecting reports via terminal, execute:

```bash
npm run cli
```

After installing or linking the package, the same entry point is available as
`pta-tools`.

### 2. Status Monitor

To spin up the continuous tracking subsystem that records state changes and pipes them straight to your communication channels, execute:

```bash
npm run monitor
```

The program creates `pta_status.json` to track state transitions. It remains in
the foreground; use a process supervisor such as systemd or PM2 when you need it
to run as a background service. The installed executable is `pta-monitor`.

(In short, you can use it to avoid missing a test...)

### 3. Development checks

```bash
npm test
npm run check
```

The test suite uses mocked HTTP responses and does not log in, submit answers, or
send notifications.


---

## More

I'm far from skilled temporarily. Issues and PRs (Contact me first) are welcome.

QQ: 2889908070 (recommended);

email: [chenlingshi@zju.edu.cn](mailto:chenlingshi@zju.edu.cn)

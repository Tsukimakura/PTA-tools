# PTA-Tools

A useful (I hope) toolkit for the PTA (Pintia) platform.

---

## Features

* **Interactive CLI Management:** Seamlessly navigate through current and historical problem sets using arrow keys.
* **Dual-Mode Downloader:** For ongoing problem-sets (Clean Mode), download the problems. For ended ones (Archive Mode), download more information like scores/answers/ranks etc.
* **Terminal Report Cards:** Direct command-line data grid showing the basic information of the chosen problem-set.
* **Proactive Status Monitor:** Persistent polling daemon capable of computing real-time status changes and emitting notifications via integrated DingTalk webhooks.

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


3. **Environment Setup:**
Duplicate the example profile into a concrete local configurations map:

```bash
cp config.example.json config.json
```


Open `config.json` and insert your username and password (cookie is not necessary)

```json
{
  "username": "chenlingshi@zju.edu.cn",
  "password": "@zju070720",
  "cookie": "",
  "dingdingWebhook": "https://oapi.dingtalk.com/robot/send?access_token=...",
  "refreshInterval": 30000
}
```

---

## Usage Guide

### 1. Interactive Console

To start downloading assignments or inspecting reports via terminal, execute:

```bash
npm run cli
```

Then I believe you can understand how to use it.

### 2. Status Monitoring Daemon (Monitor)

To spin up the continuous tracking subsystem that records state changes and pipes them straight to your communication channels, execute:

```bash
npm run monitor
```

The program will generate a local database layer tracking state-machine transformations (`pta_status.json`) and run silently in the background.

(In short, you can use it to avoid missing a test...)


---

## More

I'm far from skilled temporarily. Issues and PRs (Contact me first) are welcome.

QQ: 2889908070 (recommended);

email: [chenlingshi@zju.edu.cn](chenlingshi@zju.edu.cn)
# PTA-tools

A toolkit for the Pintia (PTA) platform.

## Architecture & Project Structure

The project follows a decoupled design to allow seamless extensions (e.g., interactive CLI queries, assignment downloaders) without breaking existing workflows.

```text
PTA-tools/
├── bin/                      # Executable entry points for different tools
│   └── pta-monitor.js        # Background daemon for real-time tracking
├── src/                      # Core business logic
│   ├── api/                  # Request layer (client wrappers, endpoint paths)
│   ├── auth/                 # Authentication state & browser automation
│   └── utils/                # Cross-cutting concerns (logging, configuration)
├── config.json               # Local private credentials
├── pta_status.json           # Cached state
└── package.json              # Dependency manifests and scripts
```

## Getting Started

### Prerequisites

* Node.js >= 18.x
* Basic Chrome/Chromium operational dependencies (required for Puppeteer under Linux/WSL2)

### Installation

1. Clone the repository and install exact dependencies using the lockfile:

```bash
git clone https://github.com/Tsukimakura/PTA-tools.git
cd PTA-tools
npm install
```


2. Initialize your local runtime properties by copying the schema template:

```bash
cp config.example.json config.json
```


3. Populate `config.json` with your real profile metrics:

```json
{
  "username": "your_email@example.com",
  "password": "your_password",
  "cookie": "",
  "apiUrl": "https://pintia.cn/api/",
  "dingdingWebhook": "https://oapi.dingtalk.com/robot/send?access_token=",
  "refreshInterval": 30000
}
```



### Execution

Run the flat background monitor component via the unified npm wrapper:

```bash
npm run monitor
```

---

## More

I'm far from skilled temporarily. Issues and PRs (Contact me first) are welcome.

QQ: 2889908070 (recommended);

email: [chenlingshi@zju.edu.cn](chenlingshi@zju.edu.cn)
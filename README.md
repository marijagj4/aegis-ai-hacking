# AEGIS - Autonomous Purple-Team Cyber Range Assessment Platform

**AEGIS** is an autonomous, AI-assisted security assessment platform designed for local Docker container evaluation, deterministic vulnerability verification, and automated evidence-based reporting.

Built with a strict **Fail-Closed** security architecture, AEGIS combines local LLM orchestration (`Ollama`) with raw TCP socket verifiers to eliminate AI hallucinations and ensure completely isolated, safe execution.

---

## 🚀 Key Features

* **Ethical Scope Guard:** Strict isolation mechanism ensuring all offensive evaluations and network scans remain constrained strictly to loopback interfaces (`127.0.0.1`).
* **Semantic Prompt Guard:** Powered locally by `llama3.2:3b`, this guard inspects requests for prompt injection attempts (e.g., system rule overrides) and blocks unauthorized actions before execution.
* **Deterministic Socket Verification:** Replaces probabilistic AI outputs with hard network evidence. Uses raw TCP socket handshakes and payload responses (e.g., Redis `PING` / `+PONG`) to confirm vulnerabilities like CWE-306 without false positives.
* **Evidence Layer & Audit Trail:** Generates immutable, append-only JSON Lines logs (`audit.jsonl`) and comprehensive Markdown assessment reports (`.md`).
* **Transfer Guardian:** Prevents data exfiltration by intercepting and blocking unapproved external network requests.
* **Metasploit Catalog Parsing:** Educational module review with strict execution locks (`execution: disabled`) for risk-free vulnerability analysis.

---

## 🛠️ Tech Stack

* **Backend:** FastAPI, Python 3.14
* **Local AI Orchestration:** Ollama (`llama3.2:1b` for fast triage, `llama3.2:3b` for semantic guard & reasoning)
* **Frontend:** HTML5, Modern CSS, JavaScript (Fetch API, Live Log Streams)
* **Reconnaissance & Tools:** Nmap, Python Raw Sockets (`socket` module)
* **Infrastructure:** Docker, Docker Compose

---

## 📂 Project Structure

```text
aegis-from-scratch/
├── app/
│   ├── static/               # Frontend CSS, JavaScript, and UI assets
│   ├── templates/            # HTML interface templates
│   ├── agents.py             # LLM orchestration and Prompt Guard agents
│   ├── assessment_tools.py   # Nmap scanner & TCP Socket verifiers
│   ├── audit.py              # Immutable logging & evidence recording
│   ├── main.py               # FastAPI backend entry point
│   ├── metasploit_catalog.py # Metasploit module parsing (disabled execution)
│   ├── ollama_client.py      # Ollama API integration layer
│   ├── reports.py            # Markdown report generator
│   ├── target_registry.py    # Docker container discovery and scope manager
│   └── transfer_client.py    # Transfer Guardian data exfiltration protection
├── data/                     # Target registry JSON and persistent state
├── output/                   # Generated evaluation outputs
├── reports/                  # Markdown assessment reports
├── target/                   # Vulnerable lab containers (e.g., Redis lab)
└── docker-compose.yml        # Multi-container lab setup

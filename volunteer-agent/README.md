# OLPAI Volunteer Judge Agent

Volunteer workers help judge submissions during AI contests by running the judge script on their local machine.

## Requirements

- Python 3.11+
- 4 GB RAM minimum
- 10 GB free disk
- Docker (required for final-phase inference, optional for public test phases)

## Setup

### Install

```bash
pip install -e .
```

### Step 1 — Register (first time, no token needed)

```bash
API_URL=https://judge.example.com WORKER_NAME="my-rtx4090" olpai-volunteer
```

The agent will print your Worker ID and exit. Send the ID to the contest admin.

### Step 2 — Get approved

The admin approves your worker on the platform and sends you an API token.

### Step 3 — Run

```bash
API_URL=https://judge.example.com WORKER_TOKEN=<your-token> olpai-volunteer
```

The agent will poll for jobs every 10 seconds, run the judge, and submit results automatically.

Press `Ctrl+C` to stop gracefully.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:8080` | Contest platform API URL |
| `WORKER_TOKEN` | *(empty)* | Token from admin (required to process jobs) |
| `WORKER_NAME` | hostname | Display name shown to admins |
| `POLL_INTERVAL_S` | `10` | Seconds between job polls |
| `HEARTBEAT_INTERVAL_S` | `30` | Seconds between heartbeats |
| `SANDBOX_TIMEOUT_S` | `600` | Max judge execution time (seconds) |
| `TEMP_DIR` | system temp | Directory for temporary files |

## Docker

```bash
docker run -d \
  -e API_URL=https://judge.example.com \
  -e WORKER_TOKEN=<your-token> \
  -e WORKER_NAME=$(hostname) \
  -v /var/run/docker.sock:/var/run/docker.sock \
  olpai-volunteer-agent
```

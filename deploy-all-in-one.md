# OLPAI System Deployment Guide (Droplet + Supabase + Caddy)

This document provides a comprehensive, production-grade guide to deploying, configuring, and maintaining the OLPAI system. It incorporates the actual server configuration verified in running environments.

---

## 1. Architecture Overview

The OLPAI platform is split into a static React frontend, a Go REST API, and associated database/object storage services.

```
                  +--------------------------------+
                  |           Client / Browser     |
                  +--------------------------------+
                                  |
                                  | HTTPS (80, 443)
                                  v
+-------------------------------------------------------------------------+
| DigitalOcean Droplet / VPS                                              |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Caddy (Web Server & Reverse Proxy)                                |  |
|  +-------------------------------------------------------------------+  |
|         |                        |                       |              |
|         | (Static files)         | (Reverse Proxy)       | (Rev Proxy)  |
|         v                        v                       v              |
|  +--------------+        +---------------+       +---------------+      |
|  | Frontend dir |        | Backend API   |       | MinIO Console |      |
|  | /var/www/    |        | Go App        |       | Port 9001     |      |
|  |   olpai      |        | Port 8080     |       +---------------+      |
|  +--------------+        +---------------+               |              |
|                                  |                       |              |
|                                  +--------+   +----------+              |
|                                           v   v                         |
|                                  +---------------+                      |
|                                  | MinIO S3 API  |                      |
|                                  | Port 9000     |                      |
|                                  +---------------+                      |
|                                          |                              |
|                                          v                              |
|                                  +---------------+                      |
|                                  | Redis Cache   |                      |
|                                  | Port 6379     |                      |
|                                  +---------------+                      |
+-------------------------------------------------------------------------+
                                           |
                                           | WAN (External)
                                           v
                  +--------------------------------+
                  |  Supabase Managed PostgreSQL   |
                  +--------------------------------+
```

* **Frontend (FE)**: React/Vite built statically and served directly by Caddy from the Droplet's local storage (no external hosting providers required).
* **Database (DB)**: Managed PostgreSQL instance hosted on Supabase.
* **Backend API & Runner Worker**: Packaged and deployed via Docker Compose on the VPS.
* **Cache & Message Queue**: Redis running inside a Docker container (bound locally).
* **Object Storage**: MinIO S3-compatible service running inside a Docker container (for submissions and assets).

---

## 2. DNS and Domain Requirements

To enable automatic Let's Encrypt SSL/TLS certificates through Caddy, you must configure the following DNS **A records** pointing directly to your VPS IP address:

| Host / Subdomain | Target / Record Type | Destination | Purpose |
| :--- | :--- | :--- | :--- |
| `@` (Root) | `A` | `YOUR_VPS_IP` | Serves the React frontend (`bkdnaioj.app`) |
| `api` | `A` | `YOUR_VPS_IP` | Endpoint for backend Go REST API (`api.bkdnaioj.app`) |
| `storage` | `A` | `YOUR_VPS_IP` | S3-compatible S3 API host (`storage.bkdnaioj.app`) |
| `minio` | `A` | `YOUR_VPS_IP` | MinIO Management Web Interface (`minio.bkdnaioj.app`) |

*Optional:* If you want to support `www.bkdnaioj.app`, add an `A` record for `www` pointing to `YOUR_VPS_IP`. If you do not create this record, **do not** include it in your Caddy configuration.

---

## 3. Server Initialization (VPS Setup)

### 3.1 Swap Memory Allocation
To prevent out-of-memory (OOM) compilation crashes when building frontend assets on resource-constrained VPS instances (e.g., 1GB - 2GB RAM), configure a 2GB Swap space:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 3.2 System Updates & Firewall Configuration (UFW)
Secure your server by allowing only web traffic (HTTP/HTTPS) and SSH access:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ufw

# Configure UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw --force enable
sudo ufw status verbose
```

### 3.3 Docker & Docker Compose Installation
Install Docker Engine along with the newer Compose plugin:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install docker-compose-plugin -y
docker compose version
```

### 3.4 Clone Application Repository
Place the project repository in a centralized `/app` directory:

```bash
sudo mkdir -p /app
sudo chown -R root:root /app
cd /app
git clone https://github.com/thuonguyenvan/bkdnaioj.git olpai
cd /app/olpai
```

---

## 4. Production Environment Configuration

Create the environment file `/app/olpai/.env` to configure all backend and infrastructure options:

```bash
nano /app/olpai/.env
```

Fill in the template below with your real production details:

```env
# Domain names (Exclude http:// or https:// prefixes)
API_DOMAIN=api.bkdnaioj.app
STORAGE_DOMAIN=storage.bkdnaioj.app
MINIO_DOMAIN=minio.bkdnaioj.app

# Database connection (Supabase Transaction Pooler recommended)
# Format: postgres://[user].[project-id]:[password]@[host]:6543/postgres?sslmode=require
DATABASE_URL=postgres://postgres.[YOUR-PROJECT-ID]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require

# Infrastructure Secrets (Change these to long, random values)
REDIS_PASSWORD=ChooseASecureRedisPassword123!
JWT_SECRET=ReplaceWithA32CharacterSecureRandomString!

# MinIO Administrative Credentials
MINIO_ROOT_USER=olpaiadmin
MINIO_ROOT_PASSWORD=ChooseASecureMinioAdminPassword123!
```

> [!IMPORTANT]
> Within `docker-compose.prod.yml`, the backend API relies on `S3_PUBLIC_ENDPOINT` resolving to `"https://${STORAGE_DOMAIN}"`. Always verify that your final domain matches this exactly (`https://storage.bkdnaioj.app`).

To test if variables are loaded correctly by the containers:
```bash
docker compose -f docker-compose.prod.yml config | grep S3_PUBLIC_ENDPOINT
```

---

## 5. Deploying the Backend Stack

Spin up the backend system (API, Worker, Redis, MinIO) in detached daemon mode:

```bash
cd /app/olpai
docker compose -f docker-compose.prod.yml up -d --build
```

Check the health and running status of all containers:
```bash
docker compose -f docker-compose.prod.yml ps
```

---

## 6. Building and Publishing the Frontend

### 6.1 Node.js Setup via NVM
The frontend build pipeline requires Node.js >= 20. Install Node.js 22 LTS:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
nvm alias default 22
node -v && npm -v
```

### 6.2 Frontend Production Compilation
Configure the production API endpoint for the React application:

```bash
cd /app/olpai/frontend
cat > .env <<'EOF'
VITE_API_URL=https://api.bkdnaioj.app
EOF

npm ci
npm run build
```

### 6.3 Deploy Static Assets
Publish the compiled static assets to the Caddy server directory:

```bash
sudo mkdir -p /var/www/olpai
sudo rsync -a --delete dist/ /var/www/olpai/
```

---

## 7. Caddy Web Server Installation & Configuration

### 7.1 Install Caddy
Run the official commands to install the stable Caddy server:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

### 7.2 Configure the Caddyfile
Backup the default Caddyfile and write a clean configuration:

```bash
sudo mv /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
sudo nano /etc/caddy/Caddyfile
```

Add the following reverse proxy and static file routing directives:

```caddy
# Frontend Router
bkdnaioj.app {
    root * /var/www/olpai
    file_server
    try_files {path} /index.html
    encode gzip zstd
}

# Redirect www to non-www (Only enable if www A Record exists in DNS)
# www.bkdnaioj.app {
#     redir https://bkdnaioj.app{uri} 301
# }

# Backend Go API Proxy
api.bkdnaioj.app {
    reverse_proxy 127.0.0.1:8080
}

# MinIO S3 API Endpoint
storage.bkdnaioj.app {
    reverse_proxy 127.0.0.1:9000
}

# MinIO Console Dashboard
minio.bkdnaioj.app {
    reverse_proxy 127.0.0.1:9001
}
```

### 7.3 Apply Configuration
Validate and reload the Caddy service:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

---

## 8. MinIO Post-Installation Setup

Once MinIO starts successfully and Caddy issues the SSL certificates:

1. Open your browser and navigate to `https://minio.bkdnaioj.app`.
2. Login using the configured credentials (`MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`).
3. Click on **Buckets** -> **Create Bucket**.
4. Name the bucket **`submissions`** and click **Create**.
5. Once created, click on the **submissions** bucket, navigate to **Anonymous Rules** (or Access Policy), and add a rule allowing public read access (`Read-Only` or `public` access prefix `*` or empty) so that the frontend can fetch files.

---

## 9. Database Migrations

Database tables are managed using schema migration scripts located under `backend/migrations`.

### Option A: Apply Migrations from Local Machine (Recommended)
Make sure `goose` is installed locally, then run:

```bash
cd backend/migrations
goose postgres "postgres://postgres.[YOUR-PROJECT-ID]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require" up
```

### Option B: Apply Migrations from VPS
Download the binary and execute migrations using credentials from the active `.env` file:

```bash
curl -fsSL https://github.com/pressly/goose/releases/download/v3.20.0/goose_linux_x86_64 -o goose
chmod +x goose
sudo mv goose /usr/local/bin/

cd /app/olpai/backend/migrations
export $(grep -v '^#' /app/olpai/.env | xargs)
goose postgres "${DATABASE_URL}" up
```

---

## 10. Update Workflow (CI/CD Checklist)

To apply changes pushed to your Github repository:

```bash
cd /app/olpai
git pull origin main

# 1. Update backend containers
docker compose -f docker-compose.prod.yml up -d --build

# 2. Apply DB migrations (If schema changes exist)
cd /app/olpai/backend/migrations
export $(grep -v '^#' /app/olpai/.env | xargs)
goose postgres "${DATABASE_URL}" up

# 3. Build & Deploy Frontend
cd /app/olpai/frontend
npm ci
npm run build
rsync -a --delete dist/ /var/www/olpai/

# 4. Reload Caddy web server
systemctl reload caddy
```

---

## 11. Troubleshooting & Diagnostics

### 11.1 Inspecting Container Logs
If the backend returns unexpected responses or crashes, inspect Docker logs:

```bash
cd /app/olpai
# View all container logs in real-time
docker compose -f docker-compose.prod.yml logs -f

# View only the Go API container logs
docker compose -f docker-compose.prod.yml logs -f api
```

### 11.2 Checking Caddy Server Logs
If domains return 502 Bad Gateway or cannot secure an SSL certificate:

```bash
journalctl -u caddy -f --no-pager
```

### 11.3 Resolving SSL/TLS Certificate Failures
If you receive SSL errors:
1. Run `nslookup api.bkdnaioj.app` locally to make sure it points to your exact VPS IP.
2. Verify that ports `80` and `443` are open on your VPS using `ufw status`.
3. Check Caddy logs for Let's Encrypt rate-limiting warnings: `journalctl -u caddy -n 100`.

### 11.4 Fixing "AxiosError: Network Error" or CORS Issues
* Check that `VITE_API_URL` inside `/app/olpai/frontend/.env` is set to `https://api.bkdnaioj.app` (with `https://`).
* Check that backend API is up and running via `docker ps`.
* Check if backend responds using curl: `curl -I https://api.bkdnaioj.app/api/v1/contests`.

---

## 12. Backup & Maintenance

### 12.1 PostgreSQL Database Backups
Since PostgreSQL runs on Supabase, navigate to the Supabase dashboard under **Database** -> **Backups** to configure daily automated backup schedules.

### 12.2 Purging Local Docker Build Caches
If your VPS disk space fills up over time, safely remove unused Docker build caches and dangling images:

```bash
docker system prune -af --volumes
```

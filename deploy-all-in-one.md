# Hướng Dẫn Deploy Hệ Thống OLPAI (Droplet + Supabase + Caddy)

Tài liệu này cập nhật theo cấu hình đã chạy thực tế trong session:

- **Frontend (FE)**: Build static trên **Droplet**, Caddy serve trực tiếp (không dùng Vercel).
- **Database (DB)**: **Supabase PostgreSQL**.
- **Backend API + Worker**: Docker Compose trên **DigitalOcean Droplet**.
- **Redis + MinIO**: chạy container nội bộ trên Droplet.

---

## 1) Kiến trúc triển khai

- `bkdnaioj.app` -> FE static (`/var/www/olpai`) qua Caddy.
- `api.bkdnaioj.app` -> reverse proxy tới `127.0.0.1:8080` (Go API).
- `storage.bkdnaioj.app` -> reverse proxy tới `127.0.0.1:9000` (MinIO S3 API).
- `minio.bkdnaioj.app` -> reverse proxy tới `127.0.0.1:9001` (MinIO Console).

Lưu ý:
- `api.bkdnaioj.app/` có thể 404 là bình thường nếu backend không có route `/`.
- FE hiện gọi API theo prefix `/api/v1` (xem `frontend/src/lib/api-client.ts`).

---

## 2) DNS bắt buộc

Tạo các bản ghi sau về đúng IP Droplet:

- `A @` -> `IP_DROPLET`
- `A api` -> `IP_DROPLET`
- `A storage` -> `IP_DROPLET`
- `A minio` -> `IP_DROPLET`

Tuỳ chọn:
- Nếu dùng `www`, tạo thêm `A www` -> `IP_DROPLET`.
- Nếu không dùng `www`, **không** đưa `www` vào Caddyfile.

---

## 3) Chuẩn bị Droplet

### 3.1 SWAP (khuyên dùng)
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 3.2 Docker + Compose
```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install docker-compose-plugin -y
```

### 3.3 Clone mã nguồn
```bash
mkdir -p /app
cd /app
git clone <URL_GITHUB_CUA_BAN> olpai
cd /app/olpai
```

---

## 4) Cấu hình `.env` production

Tạo `/app/olpai/.env`:

```env
API_DOMAIN=api.bkdnaioj.app
STORAGE_DOMAIN=storage.bkdnaioj.app
MINIO_DOMAIN=minio.bkdnaioj.app

DATABASE_URL=postgres://postgres.[YOUR-PROJECT-ID]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require

REDIS_PASSWORD=MatKhauSieuKhoRedis123!
JWT_SECRET=TaoMotChuoiNgauNhienDauDo32KyTuNayNhe!

MINIO_ROOT_USER=olpaiadmin
MINIO_ROOT_PASSWORD=MatKhauMinioAdmin123!
```

Quan trọng:
- Trong `docker-compose.prod.yml`, API dùng:
  - `S3_PUBLIC_ENDPOINT: "https://${STORAGE_DOMAIN}"`
- Phải đảm bảo giá trị thực tế là:
  - `S3_PUBLIC_ENDPOINT=https://storage.bkdnaioj.app`

Kiểm tra nhanh:
```bash
docker compose -f docker-compose.prod.yml exec api printenv S3_PUBLIC_ENDPOINT
```

---

## 5) Chạy backend stack

```bash
cd /app/olpai
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

---

## 6) Build FE trên Droplet (không Docker)

### 6.1 Node version
FE hiện dùng Vite/React Router mới, cần **Node >= 20** (khuyên dùng Node 22 LTS).

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
nvm alias default 22
node -v
npm -v
```

### 6.2 Build FE
```bash
cd /app/olpai/frontend
cat > .env <<'EOF'
VITE_API_URL=https://api.bkdnaioj.app
EOF
npm ci
npm run build
```

### 6.3 Publish static files
```bash
sudo mkdir -p /var/www/olpai
sudo rsync -a --delete /app/olpai/frontend/dist/ /var/www/olpai/
```

---

## 7) Caddy reverse proxy + HTTPS

Cài Caddy:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

Mẫu `/etc/caddy/Caddyfile` (không www):

```caddy
bkdnaioj.app {
    root * /var/www/olpai
    file_server
    try_files {path} /index.html
    encode gzip zstd
}

api.bkdnaioj.app {
    reverse_proxy 127.0.0.1:8080
}

storage.bkdnaioj.app {
    reverse_proxy 127.0.0.1:9000
}

minio.bkdnaioj.app {
    reverse_proxy 127.0.0.1:9001
}
```

Nếu muốn dùng `www`, chỉ thêm khi đã có DNS record `www`:

```caddy
www.bkdnaioj.app {
    redir https://bkdnaioj.app{uri} 301
}
```

Apply:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

---

## 8) MinIO bucket

1. Truy cập `https://minio.bkdnaioj.app`
2. Tạo bucket `submissions`
3. Set policy theo nhu cầu bài toán (public/private)

---

## 9) Migration DB (Supabase)

Khuyên dùng chạy từ local:
```bash
cd backend/migrations
goose postgres "postgres://postgres.[YOUR-PROJECT-ID]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require" up
```

Hoặc chạy từ Droplet:
```bash
curl -fsSL https://github.com/pressly/goose/releases/download/v3.20.0/goose_linux_x86_64 -o goose
chmod +x goose
sudo mv goose /usr/local/bin/

cd /app/olpai/backend/migrations
export $(grep -v '^#' /app/olpai/.env | xargs)
goose postgres "${DATABASE_URL}" up
```

---

## 10) Quy trình cập nhật code

```bash
cd /app/olpai
git pull

# backend
docker compose -f docker-compose.prod.yml up -d --build

# frontend
cd /app/olpai/frontend
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/olpai/

# reload web
sudo systemctl reload caddy
```

---

## 11) Checklist kiểm tra nhanh

```bash
# DNS
nslookup bkdnaioj.app
nslookup api.bkdnaioj.app
nslookup storage.bkdnaioj.app
nslookup minio.bkdnaioj.app

# HTTPS
curl -I https://bkdnaioj.app
curl -I https://api.bkdnaioj.app/api/v1/contests
curl -I https://storage.bkdnaioj.app
```

---

## 12) Troubleshooting SSL (quan trọng)

### Lỗi `NXDOMAIN` khi Caddy xin cert
Nguyên nhân: domain/subdomain chưa có DNS record.

Ví dụ lỗi thực tế:
- `NXDOMAIN looking up A/AAAA for www.bkdnaioj.app`

Cách xử lý:
- Hoặc thêm record DNS cho `www`
- Hoặc bỏ `www` khỏi Caddyfile

### Lỗi `HTTP 429 too many failed authorizations`
Do thử xin cert lỗi nhiều lần (Let’s Encrypt rate limit).

Cách xử lý:
- Sửa DNS đúng trước
- Chờ qua thời điểm `retry after` trong log
- Reload Caddy lại

### FE báo `AxiosError: Network Error` + `ERR_SSL_PROTOCOL_ERROR` ở `storage`
Nguyên nhân thường do SSL của `storage.bkdnaioj.app` chưa hợp lệ.

Checklist:
- `nslookup storage.bkdnaioj.app` ra đúng IP Droplet
- `curl -Iv https://storage.bkdnaioj.app` bắt tay TLS thành công
- `S3_PUBLIC_ENDPOINT` trong container API đúng `https://storage.bkdnaioj.app`

---

## 13) Ghi chú bảo mật tối thiểu

- Không commit `.env` lên git.
- Dùng mật khẩu mạnh cho Redis/MinIO/JWT.
- Chỉ expose các service public qua Caddy, giữ port nội bộ bind `127.0.0.1` như hiện tại.
- Mở firewall tối thiểu: `80`, `443`.

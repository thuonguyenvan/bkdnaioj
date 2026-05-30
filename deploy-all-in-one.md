# Hướng Dẫn Deploy Hệ Thống OLPAI (Kiến Trúc Hybrid Tối Ưu)

Tài liệu này hướng dẫn chi tiết cách triển khai hệ thống **OLPAI** theo mô hình **Hybrid (Lai)** hiện đại và tối ưu tài nguyên nhất:
*   **Frontend (FE)**: Triển khai lên **Vercel** (Miễn phí, tự động scale, CDN toàn cầu).
*   **Database (DB)**: Sử dụng **Supabase PostgreSQL** (Độ tin cậy cao, sao lưu tự động, tiết kiệm RAM/CPU cho Droplet).
*   **API Backend & Workers**: Triển khai lên **DigitalOcean Droplet** (Gói $6/tháng hoặc $12/tháng chạy cực kỳ mượt mà nhờ giảm tải DB và FE).
*   **Redis & MinIO**: Chạy Docker nội bộ ngay trên Droplet để phục vụ hàng đợi chấm bài và Object Storage chứa code.

---

## 📊 1. Đánh Giá Tải Lượng & Ưu Điểm của Kiến Trúc Hybrid

Bằng cách chuyển giao **Database sang Supabase** và **Frontend sang Vercel**, Droplet của bạn được giải phóng khỏi 2 tác vụ ngốn tài nguyên nhất:
1.  **Không chạy Postgres trên Droplet**: Tiết kiệm được **150MB - 350MB RAM** vật lý và giảm thiểu tối đa IOPS (đọc ghi ổ cứng) liên tục của database.
2.  **Không chạy Web Server Frontend**: Tiết kiệm băng thông mạng và CPU xử lý các tệp tĩnh.

### Kết quả:
*   Một **Droplet gói $6/tháng (1GB RAM / 1 vCPU / 25GB NVMe)** hoặc **$12/tháng (2GB RAM / 1 vCPU / 50GB NVMe)** hoàn toàn có thể cân tốt **hơn 300 - 500 người dùng hoạt động đồng thời** mà không có bất kỳ rủi ro sập RAM (Out of Memory) nào!
*   **Tính sẵn sàng cực cao**: Hệ thống chấm bài (Go API & Python Worker) hoạt động độc lập, không ảnh hưởng đến dữ liệu người dùng được lưu trữ an toàn trên Supabase.

---

## 🛠️ 2. Bước 1: Chuẩn Bị và Cấu Hình Bên Ngoài

Trước khi cấu hình Droplet, hãy chuẩn bị các tài khoản và lấy thông tin cấu hình từ Supabase và Vercel.

### A. Cấu Hình Supabase (Database)
1. Đăng nhập vào [Supabase](https://supabase.com/) và tạo một Project mới.
2. Vào **Project Settings** -> **Database**.
3. Cuộn xuống phần **Connection String**, chọn tab **URI**.
4. Sao chép chuỗi kết nối dạng:
   ```text
   postgres://postgres.[YOUR-PROJECT-ID]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
   ```
   > ⚠️ **Lưu ý**: Nên sử dụng cổng `6543` (Connection Pooler ở chế độ Transaction) thay vì cổng `5432` (Direct Connection) để tối ưu số lượng kết nối đồng thời từ API Go và Python Worker.

### B. Cấu Hình Vercel (Frontend)
1. Kết nối repository GitHub dự án của bạn với [Vercel](https://vercel.com/).
2. Trong bước cấu hình dự án trên Vercel, vào mục **Environment Variables** và thêm biến môi trường sau:
   *   **Key**: `VITE_API_URL`
   *   **Value**: `https://api.yourdomain.com` (Tên miền API của bạn trỏ về Droplet)
3. Nhấn **Deploy**. Vercel sẽ tự động build và cấp phát SSL miễn phí cho Frontend tĩnh của bạn.

---

## 🚀 3. Bước 2: Thiết Lập Trên DigitalOcean Droplet

Trỏ các bản ghi DNS của bạn về IP của Droplet:
*   `api.yourdomain.com` -> IP Droplet (Dành cho Backend API)
*   `storage.yourdomain.com` -> IP Droplet (Dành cho MinIO API tải file)
*   `minio.yourdomain.com` -> IP Droplet (Dành cho MinIO Console quản trị)

SSH vào Droplet của bạn và thực hiện các bước sau:

### Bước 3.1: Cấu hình SWAP Memory (Chống sập RAM khi chấm bài nặng)
Dù đã giảm tải Postgres, việc tạo SWAP vẫn là bắt buộc để dự phòng khi Worker chạy các đoạn code Python/C++ chấm bài ngốn tài nguyên đột biến:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### Bước 3.2: Cài đặt Docker & Docker Compose
```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt-get install docker-compose-plugin -y
```

### Bước 3.3: Tải Mã Nguồn Từ GitHub Về Droplet
```bash
mkdir -p /app
cd /app
git clone <URL_GITHUB_CUA_BAN> olpai
cd olpai
```

### Bước 3.4: Tạo File Cấu Hướng Môi Trường `.env`
Tạo file `/app/olpai/.env` trên Droplet để cấu hình các dịch vụ:
```bash
nano .env
```
Dán cấu hình sản xuất sau vào (thay thế mật khẩu và thông tin Supabase của bạn):
```env
# Domain cấu hình Droplet (Trừ domain chính đã chạy trên Vercel)
API_DOMAIN=api.yourdomain.com
STORAGE_DOMAIN=storage.yourdomain.com
MINIO_DOMAIN=minio.yourdomain.com

# Chuỗi kết nối Database Supabase (Lấy từ bước 1)
DATABASE_URL=postgres://postgres.[YOUR-PROJECT-ID]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require

# Redis (Chạy container nội bộ để làm Queue)
REDIS_PASSWORD=MatKhauSieuKhoRedis123!

# JWT Security
JWT_SECRET=TaoMotChuoiNgauNhienDauDo32KyTuNayNhe!

# MinIO (Object Storage chạy nội bộ chứa code bài nộp)
MINIO_ROOT_USER=olpaiadmin
MINIO_ROOT_PASSWORD=MatKhauMinioAdmin123!
```

### Bước 3.5: Sử Dụng File `docker-compose.prod.yml`
File `docker-compose.prod.yml` đã được tinh chỉnh tinh gọn (loại bỏ Postgres và Frontend), chỉ giữ lại các thành phần chạy trên Droplet:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  minio:
    image: minio/minio:latest
    restart: always
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - miniodata:/data
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: always
    environment:
      HTTP_ADDR: ":8080"
      DATABASE_URL: "${DATABASE_URL}"
      REDIS_URL: "redis://:${REDIS_PASSWORD}@redis:6379/0"
      JWT_SECRET: "${JWT_SECRET}"
      JWT_TTL: "168h"
      S3_ENDPOINT: "http://minio:9000"
      S3_PUBLIC_ENDPOINT: "https://${STORAGE_DOMAIN}"
      S3_BUCKET: "submissions"
      S3_ACCESS_KEY: "${MINIO_ROOT_USER}"
      S3_SECRET_KEY: "${MINIO_ROOT_PASSWORD}"
      LOG_LEVEL: "info"
    ports:
      - "127.0.0.1:8080:8080"
    depends_on:
      redis: { condition: service_healthy }

  worker-judge:
    build:
      context: ./backend/workers
      dockerfile: Dockerfile
    restart: always
    environment:
      DATABASE_URL: "${DATABASE_URL}"
      REDIS_URL: "redis://:${REDIS_PASSWORD}@redis:6379/0"
      WORKER_ROLE: "judge"
      WORKER_GROUP: "cg:judge-worker"
      WORKER_CONSUMER: "worker-judge-1"
      STREAM_JUDGE: "jobs:judge"
      STREAM_RESULTS: "jobs:results"
      SANDBOX_TIMEOUT_S: "15" # Timeout chấm bài ngắn để tránh treo CPU
      S3_ENDPOINT: "http://minio:9000"
      S3_BUCKET: "submissions"
      S3_ACCESS_KEY: "${MINIO_ROOT_USER}"
      S3_SECRET_KEY: "${MINIO_ROOT_PASSWORD}"
      S3_SECURE: "false"
    deploy:
      resources:
        limits:
          cpus: '0.60' # Giới hạn CPU chấm bài tránh nghẽn API
          memory: 800M # Tránh phình RAM
    depends_on:
      redis: { condition: service_healthy }

volumes:
  redis_data:
  miniodata:
```

### Bước 3.6: Khởi Chạy Các Dịch Vụ Trên Droplet
Khởi chạy API, Worker, Redis và MinIO dưới chế độ chạy ngầm:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
Kiểm tra xem toàn bộ các container hoạt động bình thường chưa:
```bash
docker compose -f docker-compose.prod.yml ps
```

### Bước 3.7: Cài Đặt Caddy & Cấu Hình Reverse Proxy
Cài đặt **Caddy** trên hệ điều hành Droplet để làm Reverse Proxy nhận request HTTPS:
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

Mở tệp cấu hình Caddyfile:
```bash
sudo nano /etc/caddy/Caddyfile
```
Dán cấu hình định tuyến thông minh sau (CORS đã do API Go Echo tự xử lý):
```caddy
# Tên miền API Backend
api.yourdomain.com {
    reverse_proxy localhost:8080
}

# Tên miền Lưu trữ File tải xuống (MinIO API)
storage.yourdomain.com {
    reverse_proxy localhost:9000
}

# Trang quản trị MinIO Console
minio.yourdomain.com {
    reverse_proxy localhost:9001
}
```

Khởi động lại Caddy để áp dụng:
```bash
sudo systemctl restart caddy
```

### Bước 3.8: Tạo Thùng Chứa (Bucket) Trên MinIO
1. Truy cập: `https://minio.yourdomain.com` và đăng nhập.
2. Chọn **Buckets** -> **Create Bucket** -> điền tên `submissions` -> nhấn **Create Bucket**.
3. Thay đổi **Access Policy** của bucket `submissions` từ **Private** thành **Public**.

### Bước 3.9: Chạy Migration Lên Supabase
Bạn có hai cách cực kỳ tiện lợi để khởi chạy 17 bảng dữ liệu lên Supabase:

#### Cách 1: Chạy từ máy tính cá nhân của bạn (Khuyên dùng - Nhanh nhất)
Vì Supabase cho phép kết nối từ xa qua SSL, bạn có thể chạy migrate trực tiếp từ máy cá nhân mà không cần cài gì lên Droplet:
```bash
# Di chuyển vào thư mục migrations trong dự án trên máy cá nhân của bạn
cd backend/migrations

# Chạy lệnh goose trực tiếp lên Supabase (Thay thế mật khẩu thực tế của bạn)
goose postgres "postgres://postgres.[YOUR-PROJECT-ID]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require" up
```

#### Cách 2: Chạy từ Droplet
Nếu muốn chạy từ Droplet, bạn tải bộ cài goose gọn nhẹ dạng binary mà không cần cài đặt Go Compiler:
```bash
# Tải goose pre-compiled binary
curl -fsSL https://github.com/pressly/goose/releases/download/v3.20.0/goose_linux_x86_64 -o goose
chmod +x goose
sudo mv goose /usr/local/bin/

# Di chuyển vào thư mục migrations và chạy migrate
cd /app/olpai/backend/migrations
export $(grep -v '^#' /app/olpai/.env | xargs)
goose postgres "${DATABASE_URL}" up
```

---

## 📈 4. Quy Trình Cập Nhật Mã Nguồn (CI/CD)

Mỗi lần bạn đẩy code mới lên GitHub:
1.  **Frontend (Vercel)**: Tự động phát hiện code mới và tự build lại sau vài phút. Bạn hoàn toàn không cần can thiệp.
2.  **Droplet (API & Worker)**: SSH vào Droplet và chạy 3 lệnh sau để cập nhật dịch vụ:
    ```bash
    cd /app/olpai
    git pull
    docker compose -f docker-compose.prod.yml up -d --build
    ```
    Docker sẽ chỉ rebuild và thay thế API và Worker mà **không ảnh hưởng gì đến dữ liệu** trên Supabase, hay file trong MinIO.

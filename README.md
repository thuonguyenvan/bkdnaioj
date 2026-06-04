# OLPAI — AI Contest Platform

Nền tảng Online Judge dành cho các cuộc thi Trí tuệ Nhân tạo (AI Competitions), chạy thử nghiệm (virtual replays) và luyện tập sau cuộc thi.

---

## 📂 Repository Structure

```
├── backend/            # Go API Server + Python Workers
│   ├── cmd/api/        # HTTP API entrypoint
│   ├── cmd/seed/       # Seeder tạo tài khoản & cuộc thi mẫu
│   ├── internal/       # Config, HTTP, Security, Repo, Queue, Scheduler
│   ├── db/             # Code truy vấn DB được sinh bởi sqlc
│   ├── migrations/     # Goose SQL migrations (bảng DB)
│   ├── workers/        # Python worker chạy chấm bài & sandbox Docker
│   ├── demo/           # Benchmark scripts (leaderboard, scheduling, sandbox)
│   ├── Makefile        # Scripts khởi động nhanh
│   ├── Dockerfile      # Dockerfile cho API Server
│   └── docker-compose.yml
├── frontend/           # React App (React 19, Vite, TypeScript)
│   ├── src/            # Mã nguồn giao diện & logic API client
│   ├── package.json
│   └── vite.config.ts
├── volunteer-agent/    # Volunteer Judge Worker Agent (pip package)
│   ├── app/            # CLI, runner, capabilities, artifact cache
│   └── pyproject.toml  # Published: pip install olpai-volunteer-agent
├── draft/              # Thư mục chứa dữ liệu test mẫu (Tabular & Adversarial Attack)
│   ├── btc_upload/     # File BTC cấu hình đề bài mẫu
│   ├── contestant_submissions/ # File nộp mẫu của thí sinh
│   ├── adversarial_attack/     # Dữ liệu hình ảnh kiểm thử tấn công đối kháng
│   └── E2E_TESTING_GUIDE.md    # Hướng dẫn chi tiết kiểm thử E2E
```

---

## 🛠️ Yêu cầu Hệ thống (Prerequisites)

Trước khi chạy dự án, hãy đảm bảo máy tính của bạn đã cài đặt và khởi động:
* **Docker & Docker Desktop** (Để chạy toàn bộ backend stack trong container và khởi động sandbox chấm bài của thí sinh).
* **Go 1.22+** (Để chạy migrations và seed dữ liệu từ máy host).
* **Node.js 18+ & npm** (Để chạy giao diện frontend React).

---

## 🚀 Hướng dẫn Chạy Backend Stack

Backend được quản lý hoàn toàn bằng Docker Compose, bao gồm: Go API, Postgres DB, Redis Queue, MinIO S3 Storage và Python Worker.

### Bước 1: Khởi động Docker containers
Di chuyển vào thư mục `backend` và chạy Docker Compose:
```bash
cd backend
docker compose up -d --build
```
*Lưu ý: Hãy đảm bảo Docker Desktop đang chạy trước khi thực hiện lệnh.*

### Bước 2: Chạy Migrations tạo cấu trúc Database
Chạy lệnh sau để Goose tự động tạo cấu trúc bảng trong PostgreSQL:
Nếu máy của bạn đã cài sẵn `goose`:
```bash
make migrate-up
```
Hoặc nếu không muốn cài đặt `goose`, bạn chạy trực tiếp qua lệnh Go:
```bash
go run github.com/pressly/goose/v3/cmd/goose@latest -dir migrations postgres "postgres://olpai:olpai@localhost:5432/olpai?sslmode=disable" up
```

### Bước 3: Seed dữ liệu mẫu (Khuyên dùng)
Để có sẵn các tài khoản Admin, Thí sinh và một cuộc thi mẫu nhằm dễ dàng kiểm thử E2E:
```bash
make seed
```
Lệnh này sẽ tạo các tài khoản test với mật khẩu mặc định là `password`:
* **Admin (BTC)**: `admin@local.com`
* **Jury (Giám khảo)**: `jury@local.com`
* **Thí sinh**: `dev@local.com`, `bob@local.com`, `charlie@local.com`, `david@local.com`

---

## 💻 Hướng dẫn Chạy Frontend (Giao diện)

Di chuyển vào thư mục `frontend`, cài đặt thư viện và khởi động dev server:

```bash
cd frontend
npm install
npm run dev
```

Sau khi chạy xong, mở trình duyệt truy cập: **`http://localhost:5173`**
* Trang web sẽ tự động kết nối với API backend tại `http://localhost:8080/api/v1`.

---

## 🛑 Cách Dừng / Tắt Toàn Bộ Hệ Thống

Khi muốn dừng kiểm thử hoặc tắt hệ thống:

1. **Dừng Frontend**:
   * Nhấn tổ hợp phím `Ctrl + C` tại cửa sổ Terminal đang chạy lệnh `npm run dev`.

2. **Dừng Backend**:
   * Di chuyển vào thư mục `backend` và hạ các container Docker xuống:
     ```bash
     cd backend
     docker compose down
     ```

---

## 🤝 Volunteer Judge Worker

Bất kỳ máy tính nào đáp ứng yêu cầu đều có thể tham gia mạng lưới chấm bài phân tán, giúp giảm tải cho server chính.

### Yêu cầu tối thiểu

* **Python 3.11+**
* **RAM** 4 GB+, **Disk** 10 GB free
* **Docker** *(tuỳ chọn — chỉ cần cho final phase inference)*

### Cài đặt

```bash
pip install olpai-volunteer-agent
```

### Các bước tham gia

**Bước 1: Đăng ký**
```bash
olpai-volunteer setup
# → Nhập Platform URL: https://api.bkdnaioj.app
# → Nhập tên máy (ví dụ: my-laptop)
# → Hệ thống tự benchmark và đăng ký → ghi lại Worker ID
```

**Bước 2: Chờ Admin phê duyệt**

Admin vào `/admin/workers` → Approve → copy token.

**Bước 3: Lưu token và chạy**
```bash
olpai-volunteer approve-token <TOKEN-FROM-ADMIN>

# Chạy foreground (dev/test)
olpai-volunteer start

# Hoặc cài service tự khởi động khi boot
olpai-volunteer service install
olpai-volunteer service start
```

### Các lệnh hữu ích

```bash
olpai-volunteer doctor        # Kiểm tra môi trường
olpai-volunteer benchmark     # Đo hiệu suất CPU/disk
olpai-volunteer status        # Xem config và trạng thái
olpai-volunteer logs -f       # Theo dõi logs realtime
olpai-volunteer cache --clear # Xoá cache artifact cũ
```

### Lưu ý

* Máy không có Docker vẫn chấm được output-only submissions (public_test, private_test).
* Hệ thống tự phát hiện năng lực máy và chỉ gán job phù hợp — không cần cấu hình thêm.
* Xem đầy đủ tài liệu tại **[/docs](https://www.bkdnaioj.app/docs)** hoặc `volunteer-agent/README.md`.

---

## 🧪 Hướng dẫn Kiểm thử Toàn trình (E2E Testing)

Sau khi khởi động thành công cả Frontend và Backend, bạn có thể tham khảo file hướng dẫn chi tiết tại:
👉 **[E2E_TESTING_GUIDE.md](file:///Users/quangsang/Documents/personal/bkdnaioj/draft/E2E_TESTING_GUIDE.md)**

Hướng dẫn này sẽ hướng dẫn bạn các bước:
1. Đăng nhập Admin và cấu hình bài toán.
2. Nộp bài mẫu của thí sinh (bao gồm bài nộp dạng CSV thông thường và bài nộp dạng Code chạy trong Sandbox).
3. Cách thử nghiệm bài toán **Tấn công đối kháng hình ảnh (Image Adversarial Attack)** mới tạo trong thư mục `draft/adversarial_attack/`.
4. Theo dõi và kiểm tra tính cập nhật tự động của bảng xếp hạng (Leaderboard).

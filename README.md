# vanhanh

Bộ công cụ vận hành nội bộ cho tổ cơ điện sân golf, gồm:
- client API cho hệ thống Kyson
- module tổng hợp báo cáo nước
- xuất báo cáo JSON / CSV / Google Sheet
- webapp nội bộ chạy tại máy tính nội bộ

## Cấu trúc chính

### `scripts/`
Script làm việc với Kyson:
- `kyson-client.js` — client đăng nhập và gọi API
- `kyson-water-report.js` — tổng hợp báo cáo nước theo ngày
- `kyson-water-report-export.js` — xuất JSON / CSV
- `kyson-water-report-to-sheet.js` — đẩy dữ liệu sang Google Sheet

### `docs/`
Tài liệu sử dụng và tổng hợp:
- `kyson-client-usage.md`
- `kyson-google-sheet.md`
- `kyson-source-map.md`
- `tong-hop-session-bao-cao-nuoc-va-webapp.md`

### `ops-standard/`
Webapp nội bộ vận hành:
- đăng nhập
- phân quyền `admin / operator / viewer`
- quản lý record nội bộ
- backup dữ liệu
- backup phiên bản code webapp
- export JSON / CSV

## Chạy nhanh

### 1. Chạy webapp nội bộ
```bash
cd ops-standard
npm start
```
Mặc định:
- `http://127.0.0.1:3080`

> Bản triển khai hiện tại trên máy vận hành đã được chỉnh để có thể listen LAN qua biến môi trường `HOST=0.0.0.0`.

### 2. Lấy báo cáo nước theo ngày
```bash
node scripts/kyson-water-report.js 2026-04-26
```

### 3. Xuất CSV
```bash
node scripts/kyson-water-report-export.js 2026-04-26 csv tmp/kyson-report-2026-04-26.csv
```

### 4. Đẩy Google Sheet
```bash
GOOGLE_APPS_SCRIPT_URL='https://script.google.com/macros/s/XXX/exec' \
GOOGLE_SHEET_NAME='water_report' \
node scripts/kyson-water-report-to-sheet.js 2026-04-26
```

## Biến môi trường Kyson
- `KYSON_BASE_URL`
- `KYSON_UID`
- `KYSON_PWD`

## Ghi chú repo
Repo đã được dọn theo hướng chỉ giữ:
- mã nguồn
- tài liệu
- cấu hình mẫu

Các file runtime / backup / state local đã được đưa vào `.gitignore` để tránh làm bẩn lịch sử Git.

## Gợi ý vận hành tiếp
- đổi mật khẩu mặc định của webapp trước khi dùng thật
- giới hạn truy cập LAN theo dải IP nội bộ nếu cần
- thiết lập backup định kỳ cho dữ liệu webapp

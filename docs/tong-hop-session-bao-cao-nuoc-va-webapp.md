# Tổng hợp session: Kyson báo cáo nước + webapp nội bộ sân golf

## 1) Mục tiêu đã xử lý
Session này đã đi qua 4 phần chính:
- dựng script lấy dữ liệu báo cáo nước từ hệ thống Kyson
- làm API client Node.js hoàn chỉnh để gọi các endpoint Kyson
- tách module báo cáo nước mới để xuất JSON / CSV / đẩy Google Sheet
- dựng webapp nội bộ chạy trên máy tính, chạy nền, tự khởi động và mở truy cập LAN

---

## 2) Cấu trúc file liên quan
### Script / client Kyson
- `scripts/kyson-client.js`
- `scripts/kyson-water-report.js`
- `scripts/kyson-water-report-export.js`
- `scripts/kyson-water-report-to-sheet.js`

### Tài liệu
- `docs/kyson-source-map.md`
- `docs/kyson-client-usage.md`
- `docs/kyson-google-sheet.md`
- `docs/tong-hop-session-bao-cao-nuoc-va-webapp.md`

### Webapp nội bộ sân golf
- `ops-standard/server.js`
- `ops-standard/package.json`
- `ops-standard/README.md`
- `ops-standard/public/index.html`
- `ops-standard/data/db.json`
- `ops-standard/backups/`

---

## 3) Phần 1 - Script lấy dữ liệu báo cáo nước
### File chính
- `scripts/kyson-water-report.js`

### Chức năng
- đăng nhập Kyson
- gọi API báo cáo theo ngày
- xử lý các phiên chạy bơm theo từng `tid`
- cắt lại đúng biên ngày khi ca chạy kéo dài qua 00:00
- tính:
  - thời lượng chạy từng lượt
  - tổng thời lượng theo bơm
  - lưu lượng m3 từng lượt
  - tổng m3 theo bơm
  - tổng toàn ngày

### Cách chạy
```bash
node scripts/kyson-water-report.js 2026-04-26
```

### Kết quả trả ra
JSON tổng hợp gồm:
- `date`
- `pump_count`
- `total_duration_seconds`
- `total_duration_hms`
- `total_m3`
- `items[]` theo từng bơm

---

## 4) Phần 2 - API client hoàn chỉnh cho Kyson
### File chính
- `scripts/kyson-client.js`

### Mục đích
Đây là client dùng lại được để gọi các API hiện có của Kyson mà không cần viết lại logic đăng nhập mỗi lần.

### Endpoint đã bọc
#### Đọc dữ liệu
- `login`
- `check_logined`
- `logout`
- `status`
- `pump`
- `sensor`
- `grafana`
- `setting`
- `users`
- `log`
- `report`

#### Ghi dữ liệu
- `save-pump`
- `save-setting`
- `save-user`

### Các hàm chính
- `login()`
- `ensureLogin()`
- `checkLogined()`
- `getStatus()`
- `getPumps()`
- `getSensors()`
- `getGrafana()`
- `getSettings()`
- `getUsers()`
- `getLog()`
- `getReport(date)`
- `savePump({...})`
- `saveSetting({...})`
- `saveUser(data)`
- `snapshot()`

### Biến môi trường
- `KYSON_BASE_URL`
- `KYSON_UID`
- `KYSON_PWD`

### Ví dụ chạy
```bash
node scripts/kyson-client.js pumps
node scripts/kyson-client.js snapshot
node scripts/kyson-client.js report 2026-04-26
```

---

## 5) Phần 3 - Module báo cáo nước mới
### 5.1 Xuất JSON / CSV
#### File
- `scripts/kyson-water-report-export.js`

#### Chức năng
- dùng lại logic tổng hợp báo cáo nước
- xuất kết quả ra:
  - JSON
  - CSV
- có thể ghi thẳng ra file

#### Ví dụ
```bash
node scripts/kyson-water-report-export.js 2026-04-26 json
node scripts/kyson-water-report-export.js 2026-04-26 csv tmp/kyson-report-2026-04-26.csv
```

### 5.2 Đẩy sang Google Sheet
#### File
- `scripts/kyson-water-report-to-sheet.js`

#### Chức năng
- lấy báo cáo Kyson theo ngày
- chuyển thành mảng row phẳng
- POST sang Google Apps Script Web App
- Google Sheet sẽ ghi dữ liệu theo ngày

#### Biến môi trường
- `GOOGLE_APPS_SCRIPT_URL`
- `GOOGLE_SHEET_NAME`

#### Ví dụ
```bash
GOOGLE_APPS_SCRIPT_URL='https://script.google.com/macros/s/XXX/exec' \
GOOGLE_SHEET_NAME='water_report' \
node scripts/kyson-water-report-to-sheet.js 2026-04-26
```

#### Tài liệu liên quan
- `docs/kyson-google-sheet.md`

---

## 6) Phần 4 - Phân tích nguồn public của Kyson
### File tài liệu
- `docs/kyson-source-map.md`

### Nội dung đã map
- các file public đang lộ qua web
- luồng đăng nhập frontend
- cookie/session `ky_son_uid`, `ky_son_ck`
- danh sách endpoint `/api`
- websocket `/api/ws`
- cấu trúc dữ liệu pump / sensor / setting / user / report
- hướng phát triển tiếp theo

Phần này là nền để viết client và module báo cáo nước phía trên.

---

## 7) Phần 5 - Webapp nội bộ sân golf lưu tại máy tính
### Thư mục
- `ops-standard/`

### Chức năng hiện có
- đăng nhập
- phân quyền `admin / operator / viewer`
- quản lý record nội bộ
- backup dữ liệu ra file JSON
- export JSON / CSV

### Chạy tay
```bash
cd /root/.openclaw/workspace/ops-standard
npm start
```

### Cổng chạy
- `3080`

### Tài khoản mặc định
- user: `admin`
- pass: `admin123!`

**Cần đổi ngay khi đưa vào dùng thực tế.**

---

## 8) Webapp đã được đưa lên chạy nền và tự khởi động
### Thay đổi đã làm
- sửa `ops-standard/server.js` để listen từ `127.0.0.1` sang `0.0.0.0`
- tạo service `systemd`: `ops-standard.service`
- bật tự khởi động cùng hệ thống
- xác nhận cổng `3080` đang listen trên LAN

### Địa chỉ truy cập LAN hiện tại
- `http://192.168.1.14:3080`

### Lệnh quản lý service
```bash
systemctl status ops-standard.service
systemctl restart ops-standard.service
systemctl stop ops-standard.service
systemctl enable ops-standard.service
```

### Ghi chú vận hành
- tiến trình chạy tay cũ đã được dừng để tránh đụng cổng
- hiện service systemd là tiến trình chuẩn để giữ app hoạt động

---

## 9) Các file/tài liệu nên mở khi cần dùng lại
### Nếu cần lấy dữ liệu Kyson
- `docs/kyson-client-usage.md`
- `scripts/kyson-client.js`

### Nếu cần xuất báo cáo nước
- `scripts/kyson-water-report.js`
- `scripts/kyson-water-report-export.js`

### Nếu cần đẩy Google Sheet
- `docs/kyson-google-sheet.md`
- `scripts/kyson-water-report-to-sheet.js`

### Nếu cần sửa webapp nội bộ
- `ops-standard/server.js`
- `ops-standard/public/index.html`
- `ops-standard/data/db.json`

---

## 10) Gợi ý bước tiếp theo
Ưu tiên vận hành nên làm tiếp:
1. đổi ngay mật khẩu `admin` mặc định của webapp
2. giới hạn chỉ IP nội bộ được truy cập cổng `3080`
3. thêm backup định kỳ cho `ops-standard/data/db.json`
4. nếu cần, thêm form riêng cho báo cáo nước ngay trong webapp nội bộ
5. nếu cần tự động hóa, lên cron hằng ngày để xuất báo cáo nước hoặc đẩy Google Sheet

---

## 11) Tóm tắt ngắn gọn
- đã có client Kyson dùng lại được
- đã có script báo cáo nước chuẩn theo ngày
- đã có module export JSON / CSV / Google Sheet
- đã có webapp nội bộ sân golf chạy trên máy
- webapp đã chạy nền bằng `systemd` và mở LAN tại `http://192.168.1.14:3080`

# Ops Standard Local

Webapp nội bộ cho vận hành sân golf, chạy local trên Ubuntu và có thể mở cho máy khác trong mạng nội bộ truy cập.

## Tính năng
- Đăng nhập
- Phân quyền: `admin` / `operator` / `viewer`
- Nhật ký vận hành nội bộ
- Checklist vận hành theo thiết bị / hạng mục
- Cho phép tạo mới, sửa, xóa thiết bị checklist
- Cho phép tạo mới, sửa tên, sửa ghi chú, xóa hạng mục đã tạo
- Đánh dấu checkbox hoàn thành cho từng hạng mục
- Lưu thời gian kiểm tra, người kiểm tra, ghi chú hiện trạng
- Đính kèm hình ảnh hiện trường cho từng lần check
- Theo dõi lịch sử check gần đây
- Lọc theo ngày, ca (`sáng` / `chiều` / `tối`) và chỉ hiện mục chưa check
- Báo cáo checklist theo ngày / ca / người thực hiện
- Backup dữ liệu nội bộ
- Xuất file JSON / CSV
- Đồng bộ dữ liệu Kyson vào webapp nội bộ
- Xem nhanh bơm / cảm biến / log / báo cáo nước theo ngày
- Cài lịch sync tự động hằng ngày ngay trong webapp
- Quản lý snapshot phiên bản code webapp và khôi phục từ giao diện admin

## Cấu trúc chính
- `server.js` — web server Node.js và API nội bộ
- `public/` — giao diện web
- `data/` — dữ liệu local (records, users, checklist, cache Kyson)
- `backups/` — file backup JSON

## Các khu vực chính trong webapp
- **Nhật ký vận hành**
- **Checklist vận hành**
- **Dữ liệu Kyson**
- **Phiên bản code webapp** (admin)
- **Quản lý người dùng** (admin)

## Chạy tay để test nhanh
```bash
cd /root/.openclaw/workspace/ops-standard
npm start
```

## Biến môi trường cho tích hợp Kyson
- `KYSON_BASE_URL`
- `KYSON_UID`
- `KYSON_PWD`

Nếu không khai báo, app sẽ dùng mặc định đang có trong `scripts/kyson-client.js`.

Mặc định app dùng:
- `PORT=3080`
- `HOST=0.0.0.0` khi triển khai LAN bằng service
- nếu chạy tay không truyền biến môi trường, app sẽ dùng giá trị trong mã nguồn

## Truy cập
### Local trên chính máy chủ
- `http://127.0.0.1:3080`

### Từ máy khác trong mạng nội bộ
- `http://<IP_MAY_CHU>:3080`

Ví dụ triển khai hiện tại:
- `http://192.168.1.14:3080`

## Tài khoản mặc định
- user: `admin`
- pass: `admin123!`

**Bắt buộc đổi ngay khi đưa vào vận hành thực tế.**

---

# Triển khai LAN + systemd

## 1) Chạy app lắng nghe trên LAN
App cần listen trên mọi interface mạng:
- `HOST=0.0.0.0`

Cổng mặc định:
- `PORT=3080`

## 2) Tạo service systemd
Tạo file:
- `/etc/systemd/system/ops-standard.service`

Nội dung mẫu:
```ini
[Unit]
Description=Ops Standard Local Webapp
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/.openclaw/workspace/ops-standard
Environment=NODE_ENV=production
Environment=PORT=3080
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/node /root/.openclaw/workspace/ops-standard/server.js
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

## 3) Nạp service và bật tự khởi động
```bash
systemctl daemon-reload
systemctl enable --now ops-standard.service
```

## 4) Kiểm tra trạng thái
```bash
systemctl status ops-standard.service
```

Nếu chạy đúng sẽ thấy trạng thái kiểu:
- `active (running)`

## 5) Kiểm tra cổng đang mở
```bash
ss -ltnp | grep ':3080'
```

Kỳ vọng:
- app listen trên `0.0.0.0:3080`

## 6) Nếu có firewall
Nếu máy đang bật `ufw`, mở cổng nội bộ:
```bash
ufw allow 3080/tcp
```

---

# Lệnh vận hành thường dùng

## Xem trạng thái
```bash
systemctl status ops-standard.service
```

## Khởi động lại
```bash
systemctl restart ops-standard.service
```

## Dừng app
```bash
systemctl stop ops-standard.service
```

## Bật tự khởi động cùng máy
```bash
systemctl enable ops-standard.service
```

## Xem log gần nhất
```bash
journalctl -u ops-standard.service -n 100 --no-pager
```

## Xem log realtime
```bash
journalctl -u ops-standard.service -f
```

---

## Đồng bộ Kyson trong webapp
Sau khi đăng nhập:
- mở thẻ **Dữ liệu Kyson**
- chọn `Từ ngày` và `Đến ngày`
- bấm **Đồng bộ Kyson**

### Sync tự động
Trong cùng thẻ có mục **Cài đặt sync tự động**:
- bật / tắt auto sync
- chọn giờ chạy hằng ngày
- chọn **múi giờ** (`UTC`, `Asia/Ho_Chi_Minh`, hoặc múi giờ máy chủ nếu có)
- chọn `Số ngày lấy lại`

Ví dụ:
- `01:00`, `Asia/Ho_Chi_Minh`, `1 ngày` → mỗi ngày sync dữ liệu của đúng hôm đó theo giờ Việt Nam
- `01:00`, `UTC`, `3 ngày` → mỗi ngày sync lại 3 ngày gần nhất theo giờ UTC

App sẽ lưu cache nội bộ vào `data/db.json`, gồm:
- snapshot hiện tại: pump / sensor / status / setting / grafana
- users Kyson
- log Kyson
- báo cáo nước theo từng ngày trong khoảng đã chọn
- trạng thái lịch auto sync: bật/tắt, giờ chạy, lần chạy cuối, lỗi cuối nếu có

Điều này giúp đội vận hành xem lại dữ liệu ngay trong webapp mà không cần gọi script tay mỗi lần.

# Checklist vận hành

## Chức năng chính của checklist
Trong thẻ **Checklist vận hành**, người dùng có thể:
- tạo thiết bị mới cần kiểm tra
- thêm hạng mục cần check cho từng thiết bị
- sửa tên hạng mục đã tạo
- cập nhật ghi chú tiêu chuẩn / hướng dẫn cho từng hạng mục
- tick checkbox hoàn thành
- lưu thời gian kiểm tra
- lưu ghi chú hiện trạng / bất thường
- đính kèm hình ảnh tại hiện trường
- xem lịch sử check gần đây
- lọc theo ngày làm việc, ca vận hành và trạng thái chưa check
- xem báo cáo checklist theo ngày, ca và người thực hiện

## Quy ước ca checklist
Hệ thống hiện dùng 3 ca cố định:
- `morning` → Ca sáng
- `afternoon` → Ca chiều
- `night` → Ca tối

Mỗi lần lưu checklist sẽ gắn với:
- ngày làm việc
- ca làm việc
- người thực hiện
- thời gian check
- ghi chú và hình ảnh (nếu có)

## Yêu cầu khi thay đổi checklist hoặc tính năng giao diện
Khi thêm hoặc sửa tính năng trong webapp, cần cập nhật lại `ops-standard/README.md` nếu có thay đổi liên quan đến một trong các mục sau:
- cho phép chỉnh sửa tên hạng mục đã tạo
- thêm hoặc đổi hành vi của checkbox đánh dấu hoàn thành
- thêm / sửa trường thời gian kiểm tra
- thêm / sửa trường ghi chú
- thêm / sửa upload hình ảnh
- thay đổi bộ lọc checklist theo ngày / ca / chưa check
- thay đổi báo cáo checklist theo ngày / người thực hiện
- thay đổi phân quyền `admin` / `operator` / `viewer`
- thay đổi API hoặc dữ liệu lưu trong `data/db.json`

Khuyến nghị khi sửa tính năng:
- nếu thay đổi hành vi người dùng nhìn thấy được, phải cập nhật phần **Tính năng**
- nếu thêm dữ liệu mới vào checklist, phải mô tả ngắn trong phần **Dữ liệu chính** hoặc **Checklist vận hành**
- nếu thay đổi thao tác vận hành, phải cập nhật phần **Lệnh vận hành thường dùng** hoặc hướng dẫn liên quan

# Dữ liệu và backup

## Dữ liệu chính
- `data/db.json`

Trong file này hiện lưu các nhóm dữ liệu chính:
- users nội bộ
- nhật ký vận hành
- checklist thiết bị / hạng mục
- lịch sử check theo ngày / ca / người thực hiện
- ghi chú check và hình ảnh checklist
- cache dữ liệu Kyson
- cấu hình auto sync Kyson

Nếu file này chưa tồn tại, app sẽ tự khởi tạo dữ liệu mặc định khi chạy lần đầu.

## Backup
API backup sẽ ghi file vào:
- `backups/`

Nên sao lưu định kỳ các thư mục:
- `data/`
- `backups/`

---

# Sự cố thường gặp

## 1) Cổng 3080 bị chiếm
Dấu hiệu:
- log báo `EADDRINUSE`

Kiểm tra:
```bash
ss -ltnp | grep ':3080'
```

Cách xử lý:
- dừng tiến trình cũ đang chạy tay
- chỉ giữ lại service `ops-standard.service`

## 2) Truy cập được trên máy chủ nhưng máy khác không vào được
Kiểm tra lần lượt:
- app có listen `0.0.0.0:3080` không
- firewall có chặn port 3080 không
- máy client có cùng mạng nội bộ không
- truy cập đúng IP LAN của máy chủ chưa

## 3) Service không tự lên sau reboot
Kiểm tra:
```bash
systemctl is-enabled ops-standard.service
```

Nếu chưa enabled:
```bash
systemctl enable ops-standard.service
```

---

# Khuyến nghị an toàn
- đổi ngay mật khẩu mặc định `admin`
- chỉ mở trong mạng nội bộ, không public Internet trực tiếp
- nếu cần, giới hạn truy cập theo dải IP nội bộ
- backup định kỳ `data/db.json`
- không commit dữ liệu chạy thật hoặc file backup vào Git

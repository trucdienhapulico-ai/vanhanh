# Ops Standard Local

Webapp nội bộ cho vận hành sân golf, chạy local trên Ubuntu và có thể mở cho máy khác trong mạng nội bộ truy cập.

## Tính năng
- Đăng nhập
- Phân quyền: `admin` / `operator` / `viewer`
- Quản lý record nội bộ
- Backup dữ liệu nội bộ
- Xuất file JSON / CSV
- Đồng bộ dữ liệu Kyson vào webapp nội bộ
- Xem nhanh bơm / cảm biến / log / báo cáo nước theo ngày
- Cài lịch sync tự động hằng ngày ngay trong webapp

## Cấu trúc chính
- `server.js` — web server Node.js
- `public/` — giao diện web
- `data/` — dữ liệu local
- `backups/` — file backup JSON

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
- chọn `Số ngày lấy lại`

Giờ hiện dùng theo **UTC** của máy chủ.
Ví dụ:
- `01:00`, `1 ngày` → mỗi ngày sync dữ liệu của đúng hôm đó
- `01:00`, `3 ngày` → mỗi ngày sync lại 3 ngày gần nhất

App sẽ lưu cache nội bộ vào `data/db.json`, gồm:
- snapshot hiện tại: pump / sensor / status / setting / grafana
- users Kyson
- log Kyson
- báo cáo nước theo từng ngày trong khoảng đã chọn
- trạng thái lịch auto sync: bật/tắt, giờ chạy, lần chạy cuối, lỗi cuối nếu có

Điều này giúp đội vận hành xem lại dữ liệu ngay trong webapp mà không cần gọi script tay mỗi lần.

# Dữ liệu và backup

## Dữ liệu chính
- `data/db.json`

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

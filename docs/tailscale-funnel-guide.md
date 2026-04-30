# Tailscale Funnel - Hướng dẫn vận hành cho webapp nội bộ

## 1) Mục tiêu
Dùng **Tailscale Funnel** để public webapp nội bộ đang chạy local trên máy vận hành ra Internet cho nhân viên truy cập hằng ngày bằng điện thoại.

Webapp hiện tại:
- local app: `http://127.0.0.1:3080`
- service: `ops-standard.service`
- public URL hiện dùng: `https://tocodien.tail030e1.ts.net/`

---

## 2) Điều kiện để Funnel hoạt động
Cần đủ 4 điều kiện:
1. Tailscale đang chạy trên máy
2. Webapp local đang chạy ở cổng `3080`
3. Tailnet policy có `nodeAttrs` cho Funnel
4. Node đã được **Approve / Enable Funnel** trong Tailscale

---

## 3) Policy file của tailnet
Tailnet cần có `nodeAttrs` cho Funnel.

Ví dụ tối thiểu:

```json
"nodeAttrs": [
  {
    "target": ["autogroup:member"],
    "attr": ["funnel"]
  }
]
```

An toàn hơn nếu muốn giới hạn hẹp hơn:

```json
"nodeAttrs": [
  {
    "target": ["trucdienhapulico@gmail.com"],
    "attr": ["funnel"]
  }
]
```

---

## 4) File policy đang lưu trong repo
File policy hiện đã tạo trong repo này tại:

- repo: `trucdienhapulico-ai/vanhanh`
- branch: `main`
- path: `tailscale/tailnet-policy.hujson`

Link xem file:
- <https://github.com/trucdienhapulico-ai/vanhanh/blob/main/tailscale/tailnet-policy.hujson>

Link raw:
- <https://raw.githubusercontent.com/trucdienhapulico-ai/vanhanh/main/tailscale/tailnet-policy.hujson>

---

## 5) Bật Funnel cho webapp cổng 3080
Sau khi policy đã apply và node đã approve Funnel:

```bash
tailscale funnel --bg --yes 3080
```

Kết quả mong đợi:
- Funnel chạy nền
- public URL trỏ vào local webapp cổng `3080`

Kiểm tra trạng thái:

```bash
tailscale funnel status
```

---

## 6) Link public dùng hằng ngày
Link public hiện tại:

- <https://tocodien.tail030e1.ts.net/>

Link này đang proxy tới:
- `http://127.0.0.1:3080`

---

## 7) Lệnh tắt Funnel khi cần
Nếu cần dừng public Internet ngay:

```bash
tailscale funnel --https=443 off
```

---

## 8) Kiểm tra vận hành nhanh
### Kiểm tra service webapp
```bash
systemctl status ops-standard.service
```

### Kiểm tra app đang listen cổng 3080
```bash
ss -ltnp | grep ':3080'
```

### Kiểm tra Funnel
```bash
tailscale funnel status
```

### Test public URL
```bash
curl -sS https://tocodien.tail030e1.ts.net/ | head
```

---

## 9) Lưu ý an toàn
Funnel là **public Internet**.

Khuyến nghị vận hành:
1. đổi ngay mật khẩu mặc định `admin`
2. không để dữ liệu nhạy cảm lộ trên giao diện login
3. cân nhắc thêm lớp bảo vệ ngoài nếu dùng lâu dài
4. theo dõi log truy cập và backup dữ liệu webapp định kỳ

---

## 10) Tóm tắt cực ngắn
- policy file: `tailscale/tailnet-policy.hujson`
- public URL: `https://tocodien.tail030e1.ts.net/`
- bật Funnel:
  ```bash
  tailscale funnel --bg --yes 3080
  ```
- tắt Funnel:
  ```bash
  tailscale funnel --https=443 off
  ```

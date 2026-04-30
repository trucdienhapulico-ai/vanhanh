# Backup / khôi phục phiên bản code webapp

## Mục tiêu
Lưu nhiều phiên bản **code webapp hiện tại** để trước khi cải tiến hoặc thay đổi lớn có thể quay lại nhanh.

Phạm vi backup:
- `ops-standard/package.json`
- `ops-standard/server.js`
- `ops-standard/README.md`
- `ops-standard/public/`

Không backup trong bộ này:
- `ops-standard/data/`
- `ops-standard/backups/`

Dữ liệu runtime vẫn giữ nguyên khi khôi phục code.

---

## Nơi lưu snapshot
- thư mục: `state/webapp-versions/`

Mỗi phiên bản gồm:
- file nén `.tar.gz`
- file metadata `.meta`

---

## Tạo backup phiên bản mới
### Cách 1 - từ terminal
```bash
bash scripts/webapp-backup-version.sh <label>
```

### Cách 2 - từ webapp admin
- đăng nhập bằng tài khoản `admin`
- mở mục **Phiên bản code webapp**
- nhập nhãn snapshot
- bấm **Tạo snapshot code**
- có thể bấm **Khôi phục** ở từng dòng snapshot để quay lại bản cũ

Ví dụ:
```bash
bash scripts/webapp-backup-version.sh truoc-khi-sua-giao-dien
```

---

## Xem các phiên bản đã lưu
```bash
ls -lh state/webapp-versions/
```

---

## Xem thử snapshot trước khi khôi phục
```bash
bash scripts/webapp-restore-version.sh <snapshot-name> dry-run
```

Ví dụ:
```bash
bash scripts/webapp-restore-version.sh 20260430T230500Z_baseline dry-run
```

---

## Khôi phục code về một phiên bản cũ
```bash
bash scripts/webapp-restore-version.sh <snapshot-name>
```

Ví dụ:
```bash
bash scripts/webapp-restore-version.sh 20260430T230500Z_baseline
```

Khi restore, script sẽ tự tạo thêm 1 snapshot an toàn với nhãn:
- `pre-restore`

Điều này giúp quay lại trạng thái ngay trước lúc restore nếu cần.

---

## Sau khi khôi phục
Nếu khôi phục từ nút admin hoặc từ script, cần restart service để bản code restored được áp dụng:
```bash
systemctl restart ops-standard.service
```

Nếu chạy tay:
```bash
cd ops-standard
npm start
```

---

## Khuyến nghị dùng thực tế
Trước mỗi đợt sửa lớn:
1. chạy backup phiên bản
2. sửa code
3. test
4. nếu không ổn thì restore snapshot gần nhất

---

## Snapshot baseline ban đầu
Session này đã tạo sẵn 1 snapshot baseline cho webapp hiện tại trong:
- `state/webapp-versions/`

## Hiển thị phiên bản trên webapp
Webapp hiện hiển thị số phiên bản ngay trên đầu trang theo dạng:
- `v<package-version> (<git-commit>)`

Ví dụ:
- `v1.0.0 (abc1234)`

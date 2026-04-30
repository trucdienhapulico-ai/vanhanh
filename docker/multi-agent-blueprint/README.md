# Multi-Agent Blueprint Docker Workspace

Docker chưa được cài trên máy này tại thời điểm khởi tạo workspace này.

Thư mục này được chuẩn bị sẵn để phục vụ giai đoạn dựng sơ đồ và đóng gói kiến trúc multi-agent.

## Mục tiêu

- Có một môi trường riêng, tách biệt cho tài liệu/artefact của hệ multi-agent
- Sẵn sàng chạy bằng Docker sau khi Docker được cài
- Làm nền cho việc dựng sơ đồ, tài liệu kiến trúc, và bản demo sau này

## Thành phần

- `docker-compose.yml`: dịch vụ app/docs cơ bản
- `Dockerfile`: image nền tối giản
- `app/`: vùng làm việc bên trong container
- `data/`: dữ liệu bind mount để giữ artefact bền vững
- `app/architecture.md`: mô tả kiến trúc tổng thể
- `app/agents.md`: danh mục agent và vai trò
- `app/workflows.md`: các workflow lõi
- `app/diagram.mmd`: sơ đồ Mermaid
- `app/docker-compose.agent-stack.yml`: khung container hoá agent stack

## Trạng thái hiện tại

- Docker CLI: chưa có
- Docker Engine: chưa kiểm tra được vì thiếu CLI

## Khi Docker đã được cài

Chạy:

```bash
docker compose up -d --build
```

Sau đó có thể vào container:

```bash
docker compose exec blueprint bash
```

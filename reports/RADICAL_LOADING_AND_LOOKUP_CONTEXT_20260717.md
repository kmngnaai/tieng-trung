# Sửa tải Bộ thủ và giữ ngữ cảnh Tra — 2026-07-17

## Phạm vi

### 1. Học → Bộ thủ

- Không còn phụ thuộc duy nhất vào sự kiện `hanzi:radicals-tab-open`.
- Khi mở trực tiếp `?study=radicals`, dữ liệu được gọi tải ngay.
- Danh sách dùng `radical_catalog.json` gồm 214 mục, khoảng 165 KB thay vì tải ngay file chi tiết khoảng 2,49 MB.
- Chi tiết từng bộ chỉ tải khi người dùng bấm vào bộ đó, từ `details/<id>.json`.
- Có timeout bằng `AbortController`.
- Khi lỗi có thông báo và nút `Thử lại`, không đứng `Đang tải...` vô thời hạn.
- Nếu catalog/detail mới chưa có, code có fallback sang file `radical_learning_notes.json` cũ.

### 2. Tra: 好 → Bộ Nữ → 姐

- Chữ ví dụ trong popup bộ thủ dùng `openTargetWithContext(...)`, không gọi `runSearch(...)` như một tìm kiếm mới.
- Kết quả giữ cấp cha và phát breadcrumb:
  - `中 → Tra → 好 → 姐`
- Bấm `好` hoặc Back quay lại kết quả `好`.
- Tìm mới từ ô Tra vẫn bắt đầu chuỗi mới.
- Không thêm popup `Bộ Nữ` vào breadcrumb vì popup không phải route riêng.

## Dữ liệu runtime mới

- `modules/hanzi-stroke/data/learning/radicals/radical_catalog.json`
- `modules/hanzi-stroke/data/learning/radicals/details/*.json` — 214 file
- Script tái tạo:
  - `modules/hanzi-stroke/scripts/build_radical_runtime_catalog.py`

## List test thủ công

### Bộ thủ

1. Mở trực tiếp `modules/hanzi-stroke/index.html?study=radicals`.
2. Danh sách phải hiện đủ 214 bộ, không cần chuyển tab qua lại.
3. Tìm `女`, `nữ`, `thủy`, `氵`.
4. Mở Bộ Nữ và xác nhận chi tiết được tải.
5. Đóng rồi mở lại Bộ Nữ; nội dung vẫn hiện.
6. Giả lập lỗi mạng hoặc đổi tạm tên catalog: phải hiện `Thử lại`, không treo vô hạn.
7. Khôi phục file và bấm `Thử lại`; danh sách phải tải lại.
8. Reload trực tiếp URL Bộ thủ.

### Tra và breadcrumb

1. Tra `好`.
2. Bấm Bộ Nữ.
3. Mở `Chữ ví dụ` rồi bấm `姐`.
4. Header phải hiện `中 → Tra → 好 → 姐`.
5. Bấm `好`, phải quay về kết quả `好`.
6. Mở lại `姐`, bấm Back, phải quay về `好`.
7. Từ `姐`, bấm tiếp một chữ liên quan; breadcrumb phải nối thêm cấp.
8. Nhập từ mới trong ô Tra; breadcrumb cũ phải được xóa và bắt đầu chuỗi mới.
9. Reload trực tiếp `?q=姐`; chỉ hiện `中 → Tra → 姐` vì lịch sử cha không tồn tại sau reload.
10. Kiểm tra nút mở Bút thuận vẫn hoạt động.

## Giới hạn kiểm thử môi trường

Chromium headless trong container không khởi động được do giới hạn DBus, inotify và NETLINK. Vì vậy cần kiểm tra hình ảnh cuối trên trình duyệt/điện thoại thật. Các kiểm tra cú pháp, dữ liệu, route HTTP và logic điều hướng mục tiêu đều đã chạy thành công.

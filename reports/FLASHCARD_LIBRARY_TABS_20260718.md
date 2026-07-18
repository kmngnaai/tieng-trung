# Flashcard Library Tabs — 2026-07-18

## Mục tiêu

Thu gọn trang Thẻ. Danh sách bộ tự tạo không còn render toàn bộ ngoài dashboard. Người dùng bấm hàng **Bộ tự tạo** mới mở màn danh sách riêng.

## Luồng mới

### Trang Thẻ chính

Chỉ hiển thị:

1. HSK & Giáo trình
2. Ôn hôm nay
3. Bộ tự tạo
4. Tổng quan học tập
5. Quản lý dữ liệu ở dạng thu gọn

### Màn Bộ tự tạo

Khi bấm **Bộ tự tạo**, ứng dụng mở màn con gồm:

- nút quay lại Thẻ;
- nút Tạo bộ;
- tìm kiếm;
- sắp xếp;
- danh sách các bộ tự tạo.

## Cải tiến nút bấm

- Mỗi bộ chỉ có một nút chính **Học bộ này**.
- Bấm tên bộ để mở chi tiết.
- Sửa và xóa chuyển vào menu `⋯`.
- Giảm nguy cơ bấm nhầm nút Xóa.
- Quản lý dữ liệu đóng gọn mặc định bằng `details`.

## Chức năng giữ nguyên

- tạo bộ;
- nhập nhanh và nhập thủ công;
- học bộ;
- xem chi tiết;
- sửa bộ;
- thùng rác và khôi phục;
- nhập/xuất JSON;
- tìm kiếm và sắp xếp;
- thống kê Dễ / Ôn / Khó / Mới;
- phiên học và lịch sử học.

## File thay đổi

- `modules/hanzi-stroke/app.js`
- `modules/hanzi-stroke/style.css`
- `modules/hanzi-stroke/index.html`
- `tests/test_ui_upgrade.py`

## Kiểm thử

- JavaScript syntax: đạt.
- Python test syntax: đạt.
- UI regression: 61/61 đạt.
- Cache asset mới: `20260718-librarytabs1`.

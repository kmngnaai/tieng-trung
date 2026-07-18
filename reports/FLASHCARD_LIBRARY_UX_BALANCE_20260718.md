# Flashcard Library UX Balance — 2026-07-18

## Mục tiêu

Cân bằng lại giao diện Thư viện bộ thẻ, giảm mật độ nút, thay bộ lọc mặc định và tách Quản lý dữ liệu thành màn riêng.

## Thay đổi chính

### Trang Thẻ
- Giữ ba lối vào HSK & Giáo trình, Ôn hôm nay, Bộ tự tạo.
- Quản lý dữ liệu trở thành một hàng điều hướng thống nhất, không bung các nút nhỏ ngay trên dashboard.

### Màn Bộ tự tạo
- Tiêu đề gọn hơn.
- Tìm kiếm dùng một ô rõ ràng.
- Bỏ `<select>` mặc định của trình duyệt.
- Nút Sắp xếp mở sheet tùy biến với các lựa chọn:
  - Mới sửa gần nhất
  - Học gần nhất
  - Tên A–Z
  - Nhiều thẻ nhất
  - Nhiều thẻ Khó nhất
  - Nhiều thẻ Ôn nhất

### Card bộ thẻ
- Bỏ viền xanh bên trái.
- Bỏ bốn ô thống kê đóng khung.
- Thống kê chuyển thành dòng chip nhẹ.
- Thêm một trạng thái ưu tiên: Cần ôn, Khó, Chưa học hoặc Đã học.
- Chỉ giữ một nút chính `Học bộ này`.
- Chi tiết, Sửa và Xóa tiếp tục nằm trong menu `⋯`.

### Màn Quản lý dữ liệu
- Tách thành màn riêng.
- Nhóm chức năng:
  - Sao lưu: Xuất dữ liệu, Nhập dữ liệu
  - Khôi phục: Thùng rác
  - Vùng nguy hiểm: Xóa lịch sử, Đặt lại phiên học dở
- Mỗi hành động là một hàng lớn, icon và mô tả thẳng hàng.

## Kiểm thử

- JavaScript syntax: đạt.
- Python test syntax: đạt.
- CSS braces: cân bằng.
- `python -m unittest tests.test_ui_upgrade`: 62/62 đạt.

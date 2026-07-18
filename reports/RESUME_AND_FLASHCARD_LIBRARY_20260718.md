# Học tiếp + Thư viện bộ thẻ

## Kết luận kiểm tra Học tiếp trước khi sửa

Phần `Học tiếp` trước đây chỉ là HTML tĩnh:

- luôn hiện `Chưa có nội dung gần đây`;
- không đọc localStorage;
- không ghi lại bài học hoặc công cụ vừa mở;
- không có liên kết tiếp tục thật.

Vì vậy trước bản sửa này, nó **chưa hoạt động**.

## Học tiếp sau khi sửa

Dữ liệu được lưu tại:

`tiengTrung.learning.recent.v1`

Các nội dung được ghi nhận:

- Giáo trình/HSK/YCT/Boya/301;
- Bộ thủ;
- Bút thuận;
- Thư viện bộ thẻ;
- Pinyin;
- Bộ thủ 50 tham khảo.

Trang chủ hiển thị mục gần nhất với:

- biểu tượng;
- tên bài/công cụ;
- ngữ cảnh;
- thời gian mở gần nhất;
- nút `Tiếp tục`.

### Flashcard đang học dở

Khi phiên Flashcard đã bắt đầu, Học tiếp lưu:

- tên phiên/bộ thẻ;
- chế độ học;
- vị trí thẻ hiện tại;
- URL có `resume=flashcard`.

Bấm Học tiếp sẽ mở lại phiên đã lưu thay vì chỉ mở trang Thẻ.

## Giao diện Thư viện bộ thẻ

### Thay đổi chính

- Đổi tiêu đề thành `Bộ thẻ của bạn`.
- Nút `Tạo bộ` gọn và không còn bị thanh tab che.
- Thêm 3 lối vào nhanh:
  - HSK & Giáo trình;
  - Tự tạo;
  - Ôn hôm nay.
- Thêm dải thống kê gọn:
  - Đã học;
  - Dễ;
  - Ôn;
  - Khó.
- Gom Xuất/Nhập/Thùng rác vào khu `Quản lý dữ liệu`.
- Xóa lịch sử và Đặt lại phiên dở được đưa thành thao tác bảo trì phụ.
- Danh sách bộ thẻ chuyển thành dạng hàng gọn trên mobile.
- Giữ tìm kiếm, sắp xếp, thống kê từng bộ và mọi nút chức năng hiện có.

## Kiểm thử

- JavaScript syntax: đạt.
- CSS cân bằng ngoặc: đạt.
- HTTP local: 3/3 route trả 200.
- UI regression: 60/60 test đạt.
- Headless Chromium không chạy được trong container do DBus/inotify/NETLINK; không dùng kết quả giả cho kiểm thử hình ảnh.

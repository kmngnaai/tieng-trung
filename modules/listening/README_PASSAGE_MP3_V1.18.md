# Listening V1.18 - MP3 toàn đoạn

## Thay đổi

- Chế độ `Chép đoạn` có nút **Nhập MP3 cho toàn đoạn**.
- Một file MP3 có thể gắn với toàn bộ passage/deck gồm nhiều câu.
- Chế độ từng câu vẫn giữ **Nhập MP3 cho câu hiện tại**.
- Audio IndexedDB được phân biệt bằng `scope`:
  - `passage`: MP3 toàn đoạn.
  - `card`: MP3 từng câu.
- Khi phát passage, app chỉ tìm MP3 `passage`; khi phát câu, app chỉ tìm MP3 `card`.
- Tương thích file MP3 đã nhập từ phiên bản cũ: bản ghi cũ được tự di chuyển sang khóa mới khi tìm thấy.

## Cách dùng

1. Nhập JSON có nhiều câu.
2. Chọn `Chép đoạn`.
3. Mở bánh răng.
4. Chọn `MP3 đã nhập` hoặc `Tự động`.
5. Nhấn `Nhập MP3 cho toàn đoạn`.
6. Chọn một file MP3 đọc toàn bộ hội thoại.
7. Đóng cài đặt và nhấn `Nghe toàn đoạn`.

Chế độ từng câu vẫn dùng một MP3 riêng cho mỗi câu khi cần.

# Listening MP3 toàn đoạn V1.19

## Sửa triệt để lỗi iPhone không phát sau khi nhập

- Dùng một `HTMLAudioElement` cố định thay vì tạo `new Audio()` sau khi đọc IndexedDB.
- Chuẩn bị Blob URL và metadata trước khi người dùng chạm nút Phát.
- `play()` được gọi trực tiếp trong sự kiện chạm trên Safari/iPhone.
- Hiển thị thời lượng và trạng thái: đang chuẩn bị, sẵn sàng, đang phát, tạm dừng, lỗi.
- Hiện lỗi Safari ngay trong thẻ âm thanh thay vì im lặng.
- Thêm Thay/Xuất/Xóa MP3 cho đúng phạm vi toàn đoạn hoặc từng câu.
- Giữ tương thích MP3 đã nhập ở V1.17/V1.18.
- Bump query version trong `index.html` để tránh cache cũ trên GitHub Pages/Safari.

## Kiểm tra nhanh

1. Mở Chép đoạn.
2. Nhập một MP3 toàn đoạn.
3. Đóng cài đặt.
4. Chờ dòng `MP3 đã sẵn sàng` và thời lượng hiện thật.
5. Chạm Phát.

Debug Console: `await ListeningAudioDebug.inspect()`

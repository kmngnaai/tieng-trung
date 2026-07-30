# Listening V1.21 — nút Tạm dừng / Phát tiếp khi đang gõ

## Cải tiến

- Thêm nút âm thanh nhỏ ngay trong phần **Nhập chữ Hán**.
- Thanh tiêu đề nhập liệu bám dưới header khi cuộn, nên luôn nhìn thấy nút.
- Nút tự đổi trạng thái: `Phát` → `Tạm dừng` → `Phát tiếp`.
- Dùng chung logic phát của nút lớn, không tạo thêm audio player.
- Khi dùng MP3 đã nhập, tạm dừng/phát tiếp không render lại toàn màn hình, giúp giữ vị trí cuộn và hạn chế đóng bàn phím iPhone.
- Nút có `pointerdown.preventDefault()` để không chủ động lấy focus khỏi ô nhập.

## Kiểm tra

1. Phát MP3 toàn đoạn.
2. Cuộn xuống phần chép chữ.
3. Chạm **Tạm dừng** ở thanh bám.
4. Gõ tiếp.
5. Chạm **Phát tiếp**; audio tiếp tục từ vị trí đã dừng.

# Listening V1.26 — cuộn trang khi bàn phím đang mở

- Bỏ `preventDefault()` khỏi vùng nhập.
- Phân biệt chạm nhẹ và kéo bằng ngưỡng 10 px.
- Chạm nhẹ mở/giữ bàn phím; kéo dọc cuộn trang bình thường.
- Tạm ngừng auto-scroll trong lúc người dùng đang kéo và 360 ms sau lần cuộn cuối.
- Chỉ tự cuộn nhẹ khi ô hiện tại bị che và người dùng tiếp tục nhập.
- Các nút −3s / Phát / +3s vẫn giữ focus input.
- CSS vùng nhập dùng `touch-action: pan-y`.

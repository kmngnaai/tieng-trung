# Listening V1.17 — bỏ Azure

## Đã thay đổi

- Gỡ toàn bộ Azure TTS, 5 giọng Azure và endpoint Azure Function.
- Giữ hai nguồn phát:
  - `Tự động`: MP3 đã nhập → giọng thiết bị.
  - `MP3 đã nhập`: chỉ phát file đã gắn cho câu.
  - `Thiết bị`: dùng `speechSynthesis` và danh sách giọng thật của iPhone/Android/Windows.
- Giữ IndexedDB, tự dọn sau 30 ngày hoặc khi vượt 300 MB.
- Tự xóa cache Azure cũ; không xóa MP3 do người dùng nhập.
- Tương thích MP3 đã nhập ở bản Azure cũ.
- Tốc độ: `0.5× / 0.75× / 1× / 1.25× / 1.5×`.
- Player có 5 nút: Từ đầu, Lùi, Phát/Dừng, Tiến, Câu sau.
- MP3 hiển thị thời gian hiện tại và tổng thời lượng.

## Điều kiện MP3

- Đuôi `.mp3`.
- MIME `audio/mpeg` hoặc `audio/mp3` nếu trình duyệt cung cấp MIME.
- Tối đa 20 MB.
- Thời lượng từ 0,3 đến 300 giây.
- Không DRM và trình duyệt phải đọc được metadata.

## Cài đặt thủ công

Sao lưu thư mục hiện tại rồi thay toàn bộ nội dung:

```text
<tieng-trung-web>\modules\listening
```

bằng thư mục `listening` trong gói này.

Sau đó chạy local và mở:

```text
http://localhost:8000/modules/listening/?v=17
```

Khi push GitHub Pages, dùng URL có `?v=17` hoặc tab InPrivate để tránh cache cũ.

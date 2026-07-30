# Font Hán Serif V2

Bản V2 giữ toàn bộ thay đổi font Hán của V1 và chỉ tinh chỉnh phần Flashcard:

- Chữ Hán ở mặt trước và mặt đáp án dùng cỡ cố định `34px`.
- Mọi thẻ ngắn hoặc dài đều dùng cùng một cỡ chữ; không còn `clamp()` hay co giãn theo chiều rộng màn hình.
- Cỡ Flashcard lớn hơn phần chữ Hán trong chế độ Gõ Pinyin (`28px`) đúng một mức vừa phải.
- Cho phép câu dài tự xuống dòng, không đổi kích thước thẻ, nút, Pinyin, tiếng Việt hoặc logic học.
- Các module Pinyin, Tra cứu, Bộ thủ, Bút thuận và Nghe giữ nguyên như V1.

Hãy chép đè vào thư mục repo, chạy local bằng `python -m http.server 8000`, kiểm tra Flashcard rồi mới commit.

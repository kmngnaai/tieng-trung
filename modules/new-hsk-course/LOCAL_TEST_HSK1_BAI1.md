# Test local — New 3.0 · HSK 1 Bài 1

## 1. Chạy web local

Tại thư mục gốc của repo:

```powershell
python -m http.server 8000
```

## 2. Mở bài

```text
http://localhost:8000/modules/new-hsk-course/index.html?level=1&lesson=1&view=book
```

## 3. Kiểm tra Bài học và Nội dung

- Hội thoại và bài vè có bộ `汉 / 拼 / Vi` riêng.
- Tab **Bài học** dùng danh sách từ; tab **Nội dung** có list/grid và 🎓 Flashcard.
- Chọn chip Bài đọc, Bài vè, Hội thoại… không làm thanh chip nhảy mất vị trí.
- Bấm từ mở popup tra; đóng popup quay lại đúng card và vị trí cuộn.

## 4. Kiểm tra Luyện tập

Mở:

```text
http://localhost:8000/modules/new-hsk-course/index.html?level=1&lesson=1&view=practice
```

Kiểm tra:

- Chọn **Tất cả** hoặc từng nguồn: Từ vựng, Danh từ riêng, Câu, Hội thoại, Đoạn/bài vè, Ngữ pháp.
- 🎓 Flashcard tổng hợp mở module thẻ chung; thẻ có lối tắt `构 Cấu tạo` và quay lại đúng bài.
- Nghe có **Xem tất cả câu nghe** và **Luyện nghe từng câu**.
- Điền từ có **Điền từ vựng** và **Điền từ trong câu**, gồm vị trí đã biên tập hoặc random có ưu tiên Ôn/Khó.
- Nối, Sắp xếp câu, Gõ câu/đoạn, Dịch hai chiều và Hội thoại dùng đúng nguồn đã chọn.
- `Cấu tạo & Bộ thủ` có bốn chế độ; chạm bộ thủ mở đúng chi tiết bộ, không mở danh sách chung.
- Trên điện thoại, thử cả kéo chữ và chạm chữ → chạm ô bộ thủ.

## 5. Kiểm tra tích hợp Listening

Trong **Luyện nghe từng câu**, bấm Play khi bàn phím đang mở. Bàn phím phải giữ nguyên; cuộn trang cũng không chủ động đóng bàn phím.

## 6. Chạy test

```powershell
python -m unittest discover -s tests -p "test_*.py"
node tests/new-hsk-course/test_renderer_runtime.js
node tests/test_listening_keyboard_audio_contract.js
node tests/test_mobile_practice_shell_contract.js
python scripts/test-new-hsk-course-browser.py
```

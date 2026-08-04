# Báo cáo cập nhật New 3.0 · AI Prompt Builder · Flashcard · Nghe

## Phạm vi

Bản cập nhật dựa trên repo đã áp dụng `PracticePlan v2`, không thay đổi dữ liệu New HSK 9 cấp hiện có.

## 1. AI Prompt Builder

- Thêm các profile: Bộ hoàn chỉnh, Cấu tạo chữ, Bài tập, Kiểm tra dữ liệu.
- Hỗ trợ chế độ Tạo mới, Bổ sung trường thiếu, Kiểm tra và đề xuất patch.
- Có phạm vi từ/ngữ pháp được phép, từ/ngữ pháp bắt buộc và giới hạn từ ngoài phạm vi.
- Prompt bắt buộc giữ `sourceRefs`, `generation`, `reviewStatus`, `confidence`.
- Phân biệt `dictionaryRadical`, `components`, vai trò âm–nghĩa và nhóm bài tập.
- Không mặc định tạo hội thoại; chỉ sinh đúng profile được chọn.
- Các profile chưa có bộ nhập tự động không xuất hiện trong màn hình Dán kết quả AI, tránh nhập sai schema.

## 2. Nguồn New 3.0 dùng chung

Tạo nguồn riêng:

- Nhãn: `New 3.0`
- Key kỹ thuật: `new_hsk_course`

Giữ nguyên nguồn:

- `new_hsk` = New HSK 9 cấp.

### Flashcard

Flashcard đọc trực tiếp manifest và lesson JSON của `modules/new-hsk-course/` rồi chuyển thành:

- từ vựng và danh từ riêng;
- câu hội thoại;
- câu bài vè/bài đọc;
- ghi chú/ngữ pháp.

### Nghe

Thêm thẻ nguồn `New 3.0` ở màn hình Nghe. Adapter chuyển cùng lesson JSON thành dữ liệu từ, câu, hội thoại và bài đọc, không sao chép thành thư viện thứ hai.

## 3. Hai cách học mới của Flashcard

### Sắp xếp câu

- Xếp từ/cụm từ thành câu, không xếp ký tự thành từ.
- Ưu tiên `answerTokens` của New 3.0.
- Với nguồn cũ, dùng `Intl.Segmenter` và từ nguồn làm gợi ý token.
- Chỉ cho luyện câu có ít nhất hai token và token ghép lại đúng câu.

### Xếp chữ vào bộ thủ

- New 3.0 ưu tiên dữ liệu `characterData` đã kiểm duyệt.
- Nguồn HSK/Giáo trình cũ dùng `radical-character-index.json` và `radical_catalog.json` làm fallback.
- Chỉ nhận chữ có một ánh xạ bộ thủ rõ ràng.
- Cần tối thiểu hai nhóm trước khi bắt đầu.
- Mobile dùng chạm chữ rồi chạm bộ thủ.

## 4. Cấu tạo & Bộ thủ

- Sửa chip Nội dung bị kéo cao: bỏ thủ thuật tăng `min-height`, cố định chiều cao chip và giữ neo trong viewport.
- Các lựa chọn ngang ở Luyện tập giữ vị trí sau khi render.
- Bấm chữ như `你` mở chi tiết giống từ vựng.
- `✍ Nét` mở thẳng route `study=lookup` với đúng chữ.
- Thành phần hiển thị tên Việt/Hán Việt: `亻 — Nhân`, `尔 — Nhĩ` thay vì `left · structural`.
- Từ trong bài có thể bấm mở chi tiết.
- Bài ghép thành phần không hiện đáp án trước; trả lời sai chỉ báo thử lại.
- Chi tiết Bộ thủ có hai hành động rõ nghĩa:
  - `← Tất cả bộ thủ`
  - `← Quay lại chữ 你` hoặc ngữ cảnh tương ứng.
- Loại bỏ nút nổi quay lại bị trùng khi đang mở đúng chi tiết bộ thủ.

## 5. Cache

Đã cập nhật cache token cho New 3.0, Flashcard và Nghe thành:

`20260804-ai-flashcard-new3-v1`

## 6. Kiểm tra

- JavaScript syntax: đạt cho AI templates, Flashcard, Listening, source adapter và New 3.0.
- Toàn bộ Node contract/runtime tests trong `tests/*.js`: đạt.
- Python tests: 71/71 đạt.
- New HSK course tests: 36/36 đạt.
- Adapter New 3.0 → Listening: hợp lệ, 13 từ, 12 câu, 4 nhóm.
- Course validator HSK 1 Bài 1: đạt.

Chromium trong môi trường thực thi chặn localhost bởi chính sách quản trị, nên cần kiểm tra hình ảnh cuối trên máy Windows của người dùng trước khi commit.

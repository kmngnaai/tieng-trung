# New 3.0 · HSK 1 Bài 1 — PracticePlan v2

## Phạm vi

Triển khai trên nền `tieng-trung-main (6)` và giữ phạm vi ở **HSK 1 Bài 1**. Không nhập Bài 2–15 và không refactor các module chung ngoài phần tích hợp cần thiết.

## Những phần đã thay đổi

### 1. Tab Luyện tập dùng chung một nguồn dữ liệu

`lesson-01.json` có `practicePlan.version = 2`, tham chiếu sáu nhóm nguồn:

- 12 từ vựng.
- 1 danh từ riêng.
- 10 câu.
- 3 hội thoại.
- 1 bài vè.
- 3 mục ôn ngữ pháp/ghi chú.

Mười hoạt động dùng các ID này, không sao chép nội dung sang bộ dữ liệu riêng:

1. 🎓 Flashcard.
2. Nghe.
3. Điền từ.
4. Nối.
5. Sắp xếp câu.
6. Gõ câu/đoạn.
7. Dịch Trung → Việt.
8. Dịch Việt → Trung.
9. Hội thoại.
10. Cấu tạo & Bộ thủ.

Mỗi hoạt động có bộ chọn nguồn riêng, chọn Tất cả hoặc nhiều nguồn, theo bài/xáo trộn, số lượng và bộ `汉 / 拼 / Vi` riêng khi phù hợp.

### 2. Flashcard tổng hợp và Cấu tạo chữ

Flashcard tổng hợp có tối đa 30 thẻ từ sáu nguồn. Dữ liệu được chuyển sang engine Flashcard hiện có.

- Thẻ có chữ Hán được gắn `structureUrl`.
- Mỗi thẻ có nút `构 Cấu tạo`.
- Màn hình hoàn thành có nút `构 Luyện cấu tạo các chữ trong bộ thẻ`.
- URL và phiên Flashcard giữ hai trường này khi lưu/khôi phục.
- Khi mở Cấu tạo từ bộ thẻ, New 3.0 chỉ hiển thị các chữ thuộc bộ thẻ đã chọn.

### 3. Nghe

- `Xem tất cả câu nghe`: audio theo sách và danh sách câu, có `汉 / 拼 / Vi`.
- `Luyện nghe từng câu`: chuyển dữ liệu sang module Listening chung.
- Hỗ trợ theo bài/xáo trộn và return context.
- Bản sửa giữ bàn phím khi bấm Play/tiến/lùi hoặc cuộn vẫn được giữ.

### 4. Điền từ, Nối, Sắp xếp, Gõ và Dịch

- Tách `Điền từ vựng` và `Điền từ trong câu`.
- Điền câu có vị trí đã biên tập hoặc random; random chỉ chọn token từ vựng/mục tiêu ngữ pháp và ưu tiên mục Ôn/Khó/sai nhiều.
- Nối dùng `matching-engine` chung cho Hán–Pinyin–Việt, câu hỏi–trả lời, người nói–câu và ngữ pháp–giải thích.
- Sắp xếp câu chỉ dùng `answerTokens`; không fallback tách từng chữ trong production.
- Gõ câu/đoạn và dịch hai chiều dùng cùng source graph.
- Trung → Việt dùng tự đối chiếu vì có thể có nhiều bản dịch đúng.

### 5. Cấu tạo & Bộ thủ

Dữ liệu biên tập có:

- 11 chữ.
- 5 chữ trọng tâm.
- 6 chữ nhận diện.
- 6 nhóm bộ thủ.
- 2 vòng xếp chữ.
- 5 bài ghép thành phần.

Bốn chế độ:

- Học cấu tạo chữ.
- Xếp chữ vào thành phần.
- Ghép thành phần thành chữ.
- Cấu tạo và bút thuận.

Xếp chữ hỗ trợ kéo trên desktop/mobile và chạm chữ → chạm bộ thủ. Chạm vào bộ thủ mở đúng `radicalId`, không mở danh sách 214 chung. Return context giữ bài, tab, hoạt động, vòng, điểm và vị trí cuộn.

### 6. Tab Nội dung

Khi đổi chip Từ vựng/Hội thoại/Bài đọc/Bài vè/Ngữ pháp/Bài tập:

- Chỉ vùng `[data-nhsk-content]` được cập nhật.
- Thanh chip giữ vị trí dọc và vị trí cuộn ngang.
- Chiều cao tối thiểu tạm thời ngăn trình duyệt ép `scrollY` khi nhóm mới ngắn.
- Không quay về `Tất cả` và không render lại toàn trang.

## Dữ liệu và validation

- Schema `new-hsk-course.v1` mở rộng cho `practicePlan v2`, character data, radical sort, character build và odd-one-out curated.
- Build script ghép Markdown + dialogue JSON + practice JSON thành một runtime JSON ổn định.
- Validator kiểm tra mọi sourceRef, activity source, curated exercise, character/radical ID, vòng và đáp án duy nhất.

## Kết quả kiểm tra

- 71 Python tests: đạt.
- Toàn bộ 21 Node contract/runtime tests: đạt.
- Browser mobile/desktop New 3.0: đạt.
- Course validator: đạt.
- JSON Schema: đạt.
- JavaScript syntax New 3.0, Listening và Hanzi Stroke: đạt.
- Bản apply thử trên repo sạch: xem trong test report đi kèm.

## Giới hạn có chủ ý

- Chỉ áp dụng HSK 1 Bài 1 để kiểm tra schema và UX trước khi chuyển Bài 2–15.
- Dịch Trung → Việt không chấm tuyệt đối từng ký tự.
- Dữ liệu cấu tạo chỉ dùng nội dung đã biên tập; không tự suy diễn biểu âm/biểu nghĩa chưa kiểm chứng.
- Không commit tự động.

# New 3.0 · HSK 1 Bài 1 — Practice UX v4

## Phạm vi

Bản này tiếp tục từ patch v3, chỉ nâng cấp phần luyện tập, cấu tạo/bộ thủ, deep-link Bút thuận và khả năng build/validate dữ liệu HSK 1 Bài 1.

## Thay đổi chính

### Xếp chữ vào bộ thủ

- Giao diện mobile được làm gọn: chữ và ô bộ thủ nhỏ hơn, hai cột, ít khoảng trống.
- Hỗ trợ cả hai chiều:
  - chọn chữ rồi chọn bộ thủ;
  - chọn bộ thủ rồi chọn chữ.
- Kéo/thả vẫn được giữ làm phương án bổ sung.
- Sai không làm mất chữ, không trừ điểm và không tính lại chữ đã hoàn thành.
- Sửa lỗi runtime khi mở bài xếp bộ thủ mà không có `returnCharacter`.
- Dữ liệu nguồn cũ của Flashcard chỉ được dùng khi xác định được đúng một bộ thủ; chữ chưa rõ bị loại thay vì gán sai để đủ vòng.
- Chữ như `客` tiếp tục thuộc Bộ Miên; dữ liệu không còn rơi về Bộ Nhất do fallback lỏng.

### Sắp xếp câu

- Mỗi lần chỉ hiện một câu trên mobile.
- Token ưu tiên từ/cụm từ có nghĩa; nguồn cũ dùng longest-match theo từ vựng thay vì ghép sai kiểu `是好`.
- Tự kiểm tra khi token cuối cùng được đặt.
- Không còn nút Kiểm tra lớn.
- Tự đề xuất:
  - đúng ngay: Dễ;
  - sai 1–2 lần: Ôn;
  - sai từ 3 lần: Khó.
- Người học vẫn có thể đổi Dễ/Ôn/Khó.

### Nghe rồi gõ

- Mặc định tắt cả `汉`, `拼`, `Vi` để không lộ đáp án.
- Người học chủ động bật gợi ý khi cần.
- Cài đặt này độc lập với các hoạt động khác.

### Cấu tạo chữ

- Thành phần rút gọn thành:
  - `亻 — Nhân` / `bên trái`;
  - `尔 — Nhĩ` / `bên phải`.
- Không lặp dòng “thành phần cấu tạo”.
- Mẹo nhớ của `你` được lưu riêng với loại `pedagogical` và trạng thái `needs-review`, không thay thế dữ liệu cấu tạo chuẩn `亻 + 尔`.
- Chạm chữ lớn và từ trong bài vẫn dùng popup tra cứu chung.

### Bút thuận và quay lại

- Nút `✍ Nét` tạo deep-link `study=lookup&chars=你`, mở thẳng Bút thuận với đúng chữ.
- Return context lưu tab Luyện tập, hoạt động, chế độ, character ID, vị trí card trong viewport và scrollY.
- Chi tiết Bộ thủ giữ hai hành động rõ ràng:
  - `← Tất cả bộ thủ`;
  - `← Quay lại chữ 你`.
- Không tạo thêm nút nổi trùng trong route chi tiết bộ thủ.

### Build và validation

- `build_course_data.py` tự tìm file practice cùng bài và merge vào runtime JSON.
- Build lại `lesson-01.json` cho kết quả giống hệt file runtime.
- Validator và schema hỗ trợ `practicePlan`, characters, radical sort và character build.
- Stats mới được kiểm tra thay vì bỏ qua.

## Lỗi được phát hiện trong browser test

Browser smoke test phát hiện một lỗi thật: `radicalDetailUrl(null)` đọc `.hanzi` từ `null`, khiến bấm Bắt đầu ở Xếp chữ vào bộ thủ không mở được phiên. Lỗi đã được sửa và thêm kiểm tra hồi quy.

## Tệp sửa

Xem `FILES_CHANGED.txt` trong ZIP.

# New 3.0 · HSK 1 Bài 1 — Luyện tập theo nội dung và xếp chữ vào bộ thủ

## Phạm vi đã chốt

- `Cautaobothu.zip` chỉ được dùng để định hướng bài tập **kéo/chạm chữ vào đúng bộ thủ**.
- Không biến mục này thành bài giảng dài về nguồn gốc hay cấu tạo chữ.
- Tab `Luyện tập` được tổ chức lại thành nơi ôn đúng dữ liệu của bài:
  - Từ vựng
  - Câu
  - Hội thoại
  - Đoạn / bài vè
  - Ngữ pháp
  - Bộ thủ
- Mỗi nhóm tái sử dụng dữ liệu gốc của `lesson-01.json`, không tạo bản sao nội dung học.

## Dữ liệu luyện tập mới

Nguồn biên tập riêng:

`modules/new-hsk-course/source/hsk1/practice/HSK1_Bai_01_practice.json`

Tệp này được builder ghép vào runtime và chứa:

- 4 bài điền từ có nguồn truy vết về câu/từ trong bài.
- `practicePlan` chia hoạt động theo nội dung cần ôn.
- 1 bài `radical-sort` đã kiểm duyệt.
- 6 nhóm bộ thủ, 11 chữ, 2 vòng.

### Nhóm bộ thủ của Bài 1

| Nhóm | Chữ dùng trong bài tập |
|---|---|
| 亻 / 人 · Bộ Nhân | 你, 们 |
| 女 · Bộ Nữ | 好, 妈 |
| 宀 · Bộ Miên | 家, 客 |
| 讠 / 言 · Bộ Ngôn | 语, 谢 |
| 口 · Bộ Khẩu | 吃, 骂 |
| 马 / 馬 · Bộ Mã | 马 |

Dữ liệu được đối chiếu với catalog và bảng phân giải bộ thủ đang có trong repo. Điểm cần lưu ý: `骂` được xếp vào **Bộ Khẩu**, không phải Bộ Mã.

## Tương tác bài xếp chữ

- Desktop: kéo thả bằng HTML5 drag/drop.
- Mobile: kéo bằng pointer event.
- Dự phòng: chạm chữ rồi chạm ô bộ thủ.
- Đúng: chữ chuyển vào ô, tăng điểm.
- Sai: phản hồi đỏ ngắn, không mất chữ, không trừ điểm.
- Có vòng, điểm, số lần sai, nút tiếp tục và làm lại.
- Có liên kết sang module `Bộ thủ 214` hiện có.

## Tab Luyện tập mới

### Từ vựng

- 🎓 Flashcard
- Nghe từ
- Điền từ
- Nối Hán/Pinyin/Việt

### Câu

- Nghe từng câu
- Điền từ trong câu
- Nối
- Sắp xếp câu
- Gõ câu

### Hội thoại

- Nghe audio nguồn
- Chọn vai và nhập vai hội thoại

### Đoạn / bài vè

- Nghe audio nguồn
- Đọc ba lớp Hán/Pinyin/Việt
- Gõ đoạn hoặc bài vè

### Ngữ pháp

- Ôn ghi chú ngôn ngữ và ghi chú từ vựng
- Làm bài điền có liên kết nguồn

### Bộ thủ

- Kéo/chạm chữ vào đúng bộ thủ theo dữ liệu đã kiểm duyệt

## Kiến trúc

- Runtime vẫn dùng một nguồn `lesson-01.json`.
- Builder hỗ trợ thêm đối số `--practice`.
- Schema `new-hsk-course.v1` kiểm tra `practicePlan` và `radicalSortExercises`.
- Validator kiểm tra:
  - ID tham chiếu tồn tại.
  - Mỗi chữ chỉ có một đáp án.
  - Bộ thủ đáp án phải có trong vòng.
  - Không lặp chữ giữa các vòng.
  - Các vòng bao phủ toàn bộ dữ liệu.
  - Số liệu thống kê khớp dữ liệu thực tế.

## Kết quả kiểm tra

- 71/71 Python tests đạt.
- Toàn bộ Node contract/runtime tests đạt.
- JSON Schema Draft 2020-12 đạt.
- Validator dữ liệu đạt.
- Build lại từ Markdown + hội thoại + practice overlay giống hệt runtime JSON.
- HSK 1 Bài 1 hiện có 6 nhóm ôn và 11 mục xếp bộ thủ.

## Giới hạn cần test trực tiếp

Môi trường container không ổn định khi chụp Chromium local. Cần kiểm tra cuối trên điện thoại hoặc DevTools mobile:

- Kéo chữ khi trang có thể cuộn.
- Chạm chữ rồi chạm ô bộ thủ.
- Phản hồi sai/đúng.
- Chuyển vòng.
- Không phát sinh cuộn ngang.

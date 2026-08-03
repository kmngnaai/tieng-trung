# Báo cáo độ phủ — HSK 1 Bài 1

## Truy vết

- **PDF gốc:** trang 15–18.
- **Trang sách:** 001–004.
- **Nguồn Markdown:** [`../HSK1_Bai_01.md`](../HSK1_Bai_01.md).
- **Dữ liệu tách câu:** [`../dialogues/HSK1_Bai_01_dialogues.json`](../dialogues/HSK1_Bai_01_dialogues.json).
- **Dữ liệu runtime:** [`../../../data/hsk1/lesson-01.json`](../../../data/hsk1/lesson-01.json).

## Kiểm tra độ phủ

| Hạng mục | Trong sách | Runtime |
|---|---:|---:|
| Mục tiêu | 2 | 2 |
| Bài khóa | 3 | 3 |
| Nhóm hội thoại | 3 | 3 |
| Câu thoại | 10 | 10 |
| Từ mới có STT | 12 | 12 |
| Danh từ riêng | 1 | 1 |
| Gợi ý của Tiểu Ngữ | 2 | 2 |
| Hoạt động | 4 | 4 |
| Bài vè | 1 | 1 |
| Nội dung mở rộng | 1 | 1 |
| Mã audio hội thoại | 3 | 3 |
| Mã audio từ mới | 3 | 3 |
| Mã audio bài vè | 1 | 1 |
| Mã video mở rộng | 1 | 1 |
| Mô tả hình có chức năng nội dung | 4 | 4 |

## Kiểm tra trình bày

- Hội thoại đọc theo ba lớp **Chữ Hán → Pinyin → Tiếng Việt**.
- Không hiển thị tiêu đề `Lượt 1`, `Lượt 2`.
- Từng câu vẫn giữ ID, người nói ba dạng và `answerTokens` trong JSON.
- `views.bookFlow` và `views.groupedIndex` chỉ tham chiếu cùng một kho thực thể.
- Truy vết nguồn nằm cuối luồng học, không chen giữa nội dung.

**Kết luận:** HSK 1 Bài 1 đủ nội dung văn bản và mô tả hình từ PDF trang 15–18 để thử nghiệm trên web. Audio/video chỉ giữ mã tham chiếu vì tệp phương tiện không có trong PDF.

# New 3.0 HSK 1–3 — Báo cáo hoàn tất

## Phạm vi

Đã mở rộng module `modules/new-hsk-course/` từ mẫu HSK 1 Bài 1 thành toàn bộ:

- HSK 1: 15/15 bài.
- HSK 2: 15/15 bài.
- HSK 3: 18/18 bài.
- Tổng cộng: 48/48 bài.

Mỗi bài dùng một JSON chuẩn duy nhất để dựng:

- Bài học theo trình tự sách.
- Nội dung gom theo phần.
- Luyện tập.
- Adapter dùng chung cho Thẻ và Nghe.

## Thống kê dữ liệu runtime

| Cấp | Bài | Từ vựng | Nhóm hội thoại | Lượt thoại | Bài đọc/đoạn | Ngữ pháp |
|---|---:|---:|---:|---:|---:|---:|
| HSK 1 | 15 | 316 | 47 | 211 | 6 | 49 |
| HSK 2 | 15 | 210 | 45 | 297 | 15 | 45 |
| HSK 3 | 18 | 479 | 55 | 379 | 17 | 60 |

## Audio sách

Đã nhập và chuẩn hóa ba bộ audio người dùng cung cấp:

- HSK 1: 93 MP3.
- HSK 2: 120 MP3.
- HSK 3: 144 MP3.
- Tổng: 357 MP3.
- Tổng thời lượng: 7.997,222 giây, khoảng 2 giờ 13 phút 17 giây.

Kết quả audit:

- Thiếu: 0.
- Không hợp lệ: 0.
- Ngoài danh sách dự kiến: 0.

Hiện không cần cung cấp thêm audio sách.

Lưu ý: MP3 sách là track theo bài khóa/từ mới/bài đọc. Khi người học bấm loa cho riêng một từ hoặc một câu mà sách không có file riêng, ứng dụng dùng giọng máy của thiết bị.

## Giao diện và điều hướng

- Có bộ chọn HSK 1 / HSK 2 / HSK 3.
- Có bộ chọn bài và nút trước/sau.
- Chuyển bài nội bộ, không tải lại app shell.
- Tên hiển thị thống nhất là `New 3.0`.
- Breadcrumb: `Học → New 3.0 → HSK n → Bài n`.
- Trình bày responsive đã kiểm tra tại 360×800, 390×844, 430×932 và 1280×900.

## Thẻ và Nghe

- Nguồn kỹ thuật: `new_hsk_course`.
- Giữ nguyên nguồn `new_hsk` của New HSK 9 cấp.
- Flashcard đọc danh sách 48 bài từ manifest.
- Nghe hiển thị HSK 1–3 và đọc cùng dữ liệu bài học, không sao chép sang một thư viện riêng.

## Build và validation

Các script chính:

```text
scripts/new-hsk-course/build_all_course_data.py
scripts/new-hsk-course/import_course_audio.py
scripts/new-hsk-course/validate_full_course.py
scripts/test-new-hsk-course-full-browser.py
scripts/test-new-hsk-course-full-local.ps1
```

Báo cáo máy đọc:

```text
modules/new-hsk-course/data/build-all-report.json
modules/new-hsk-course/data/audio-audit.json
modules/new-hsk-course/data/full-course-validation.json
```

## Ghi chú kiểm duyệt

Validation hiện xác nhận tính đầy đủ cấu trúc, tham chiếu, số lượt thoại, đường dẫn audio và khả năng render. Các bài tập cấu tạo/bộ thủ ngoài HSK 1 Bài 1 được sinh từ dữ liệu enrichment đã có trong repo; nên tiếp tục kiểm tra thủ công khi phát hiện một ánh xạ bộ thủ hoặc mẹo học chưa phù hợp, thay vì coi kết quả tự động là nguồn từ điển tuyệt đối.

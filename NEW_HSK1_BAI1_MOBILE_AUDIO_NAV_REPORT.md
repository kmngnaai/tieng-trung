# Báo cáo New HSK 1 Bài 1 — mobile, audio và điều hướng

## Phạm vi

Chỉ sửa phần liên quan đến New HSK 1 Bài 1 và các điểm điều hướng cần thiết. Không nhập thêm Bài 2–15.

## Ngôn ngữ hiển thị

- Ba nút độc lập: `汉`, `拼`, `Vi`.
- Mặc định lần đầu: Hán ngữ bật; Pinyin và tiếng Việt tắt.
- Cho phép mọi tổ hợp có ít nhất một ngôn ngữ, bao gồm bật cả ba.
- Trạng thái được lưu bằng `tiengTrung.newHskCourse.settings.v2`.
- Nút áp dụng cho các phần nội dung có ba lớp: tiêu đề, bối cảnh, hội thoại, từ mới, danh từ riêng, bài vè và nội dung song ngữ.
- Mục tiêu và nhãn điều hướng vẫn giữ tiếng Việt để người học không bị mất ngữ cảnh giao diện.

## Audio

Đã tích hợp 7 MP3 của Bài 1 tại:

```text
modules/new-hsk-course/assets/audio/hsk1/lesson-01/
```

Ánh xạ:

| Tệp | Nội dung |
|---|---|
| 1-1.mp3 | Hội thoại Bài khóa 1 |
| 1-2.mp3 | Từ mới Bài khóa 1 |
| 1-3.mp3 | Hội thoại Bài khóa 2 |
| 1-4.mp3 | Từ mới Bài khóa 2 |
| 1-5.mp3 | Hội thoại Bài khóa 3 |
| 1-6.mp3 | Từ mới Bài khóa 3 |
| 1-7.mp3 | Bài vè |

Các tệp trong `Audio Leason 1.zip` giống hệt các tệp Bài 1 trong `Audio HSK 3.0 Level 1.zip` theo SHA-256. Cả 7 tệp đều đọc được bằng ffprobe, thời lượng 6.37–18.30 giây.

Audio nguồn là track theo phần của sách, vì vậy nút `1-1`…`1-7` phát nguyên track. Nút loa cạnh từng từ và danh từ riêng dùng TTS tiếng Trung của thiết bị; không phát nguyên track từ vựng khi người dùng chỉ chạm một mục.

## Điều hướng

New HSK 3.0 được đặt thành mục độc lập, ngang cấp với Giáo trình, LDSN1-4, Bộ thủ, Thẻ và Bút thuận tại:

- Dãy tab trên màn hình Học.
- Các thẻ lựa chọn của khu Học.
- Khu Khám phá ở Trang chủ.
- Menu toàn ứng dụng.
- Điều hướng cũ trong `navigation.js` để tránh lệch giữa hai hệ thống.

Breadcrumb mới:

```text
Học → New HSK 3.0 → HSK 1 → Bài 1
```

Không còn đặt New HSK bên dưới Giáo trình.

## Kiểm tra

- Python: 93 test đạt, 54 subtest đạt.
- Node contract/runtime: toàn bộ test trong `tests/*.js` đạt.
- New HSK module: 18/18 test đạt.
- Breadcrumb runtime: 6/6 đạt.
- JavaScript syntax: đạt cho các tệp đã sửa.
- Audio: 7/7 MP3 tồn tại, hợp lệ và khớp nguồn.
- Runtime mô phỏng mobile bằng Playwright:
  - mặc định `汉=true`, `拼=false`, `Vi=false`;
  - bật cả ba thành công;
  - ẩn riêng Hán ngữ khi hai ngôn ngữ khác đang bật thành công;
  - 7 nút audio nguồn và nút loa danh từ riêng xuất hiện.

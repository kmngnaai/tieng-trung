# Báo cáo triển khai giao diện thống nhất — 2026-07-17

## Phạm vi đã thực hiện

Bản này sửa trực tiếp mã nguồn từ gói `tieng-trung-web(1).zip`, không chỉ dựng ảnh minh họa.

### App shell chung

- Header chung: `[中] Tiếng Trung`, nút `◐`, nút Menu.
- Mobile: bottom nav cố định đúng 4 mục `Trang chủ | Tra | Học | Menu`.
- Desktop từ 900px: dùng navigation trên header và ẩn bottom nav.
- Menu dùng một drawer chung cho toàn ứng dụng.
- Các trang chính không còn tải `modules/shared/navigation.js` hoặc `navigation.css`.

### Trang chủ và khu Học

- Trang chủ mới dùng cùng hệ token, card và app shell.
- Khu Học theo đúng thứ tự:
  1. Giáo trình
  2. Bộ thủ
  3. Thẻ
  4. Bút thuận
  5. Pinyin
- Màn tổng quan Học dùng card trước; thanh tab nội bộ được ẩn khi đang ở tổng quan.

### Giáo trình

- Thứ tự nguồn: `301 | HSK 6 cấp | HSK 9 cấp | YCT | Boya`.
- Lần đầu mở chọn 301.
- Lưu nguồn gần nhất bằng localStorage key `hanziStroke.lastCurriculum.v1`.
- 301 đọc danh sách thật từ `lessons-301-v2/lessons.json` gồm 40 bài.
- HSK/YCT/Boya đọc trạng thái bài, chủ đề và ngữ pháp từ `hsk_summary.json` và `grammar_summary.json`.
- Các cấp thiếu dữ liệu tiếp tục hiển thị trạng thái `PARTIAL`/số lượng thực, không tạo nội dung giả.

### Tra, Bộ thủ, Thẻ và Bút thuận

- Giữ nguyên logic hiện có.
- Chỉ đưa vào app shell và ánh xạ màu cũ sang token chung.
- Bộ thủ chính vẫn là Bộ thủ 214.
- Bộ thủ 50 được giữ tại `Menu → Tham khảo → Bộ thủ 50`; không chuyển Yêu thích/Đã học.

### Pinyin và mascot

- Pinyin vẫn giữ 5 tab thật: `Học | Nghe | Quiz | Ôn | Tiến độ`.
- Hình cũ trong hero đã được thay bằng ảnh koala Kei do người dùng cung cấp.
- Asset nằm riêng tại `assets/brand/mascot.png`.
- Không nhúng base64 và không viết cứng dữ liệu ảnh trong JavaScript.
- Muốn đổi mascot sau này: thay đúng file `assets/brand/mascot.png`.

### Xóa phần trình chiếu của 301

- Xóa nút/filter/render/listener/CSS dành riêng cho phần trình chiếu.
- Xóa các trường nguồn liên quan khỏi cả 40 file `lesson-*/data.json`.
- Xóa metadata và script xuất dữ liệu trình chiếu.
- Cập nhật builder để các lần build sau không tạo lại phần này.

## Tệp kiểm thử

- `tests/test_ui_upgrade.py`
- 14 kiểm tra hồi quy, gồm:
  - app shell trên 4 trang chính;
  - bottom nav và desktop navigation;
  - thứ tự khu Học và Giáo trình;
  - ghi nhớ Giáo trình gần nhất;
  - mascot là asset thay thế được;
  - Bộ thủ 50 chỉ là tham khảo;
  - dữ liệu 301 không còn phần trình chiếu;
  - dữ liệu HSK hiển thị dựa trên summary thật;
  - Pinyin còn đủ 5 tab;
  - palette cũ được ánh xạ sang token chung.

## Kết quả xác minh

- `node --check`: đạt cho toàn bộ file JavaScript.
- `python -m unittest tests/test_ui_upgrade.py -v`: 14/14 đạt.
- Kiểm tra parse JSON cho dữ liệu 301: đạt 40/40 bài.
- Kiểm tra liên kết local trong 4 HTML chính: không thiếu file.
- Kiểm tra HTTP local: Trang chủ, Học, Giáo trình, Pinyin, Bộ thủ 50, mascot và lessons index đều trả HTTP 200.
- CSS chính: cân bằng dấu ngoặc.
- HTML chính: không có ID trùng trong từng trang.

## Giới hạn xác minh trong môi trường hiện tại

Chromium headless trong container không tạo được ảnh chụp do giới hạn hệ thống DBus/inotify. Vì vậy phần kiểm tra tự động đã hoàn thành, nhưng vẫn cần mở bản này trên điện thoại và desktop thật để duyệt trực quan khoảng cách, font hệ thống, safe area và thao tác chạm.

## Checklist kiểm thử thủ công đề xuất

1. Mobile: mở lần lượt Trang chủ → Tra → Học → Menu; xác nhận bottom nav không đổi.
2. Desktop: xác nhận không còn bottom nav, navigation nằm trên header.
3. Học → Giáo trình: lần đầu mở 301, đổi sang HSK/YCT/Boya, reload và kiểm tra nhớ nguồn gần nhất.
4. Mở bài 301 từ Giáo trình; xác nhận đúng bài và không còn phần trình chiếu.
5. Pinyin: kiểm tra mascot koala và đủ 5 tab.
6. Bộ thủ 214: kiểm tra popup, từ và câu vẫn hoạt động như trước.
7. Menu → Tham khảo → Bộ thủ 50: kiểm tra Yêu thích/Đã học cũ vẫn độc lập.
8. Thẻ: kiểm tra IndexedDB, nhập/xuất JSON và khôi phục phiên sau reload.
9. Đổi sáng/tối từ header trên từng module.

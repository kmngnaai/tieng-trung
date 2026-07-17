# Patch thu gọn Học, Giáo trình, Bộ thủ, Thẻ và làm lại Trang chủ

Ngày: 2026-07-17

## Phạm vi đã sửa

1. Bỏ hoàn toàn hero lớn dùng chung trong khu Học:
   - `Học tiếng Trung / Học / 学`
   - `Học theo lộ trình / Giáo trình / 课`
   - `Nền tảng chữ Hán / Bộ thủ / 部`
   - `Ôn tập chủ động / Thẻ / 卡`
2. Màn Học chỉ giữ tiêu đề nhỏ `CHỌN NỘI DUNG`, bỏ dòng `Học theo cách phù hợp`.
3. Bỏ card giới thiệu lặp `Bộ thủ trong Tra chữ Hán`; Bộ thủ mở gần như trực tiếp vào tìm kiếm, nhóm và danh sách.
4. Đổi biểu tượng Bút thuận từ kính lúp sang `✍` tại:
   - tab Bút thuận;
   - card Bút thuận ở màn Học;
   - card Bút thuận ở Trang chủ;
   - Menu toàn ứng dụng.
5. Làm lại Trang chủ theo bố cục đã duyệt:
   - Tra nhanh;
   - Học tiếp;
   - Khám phá: Giáo trình, Bộ thủ, Thẻ, Bút thuận, Pinyin.
6. Tra nhanh gửi trực tiếp query đến `modules/lookup/index.html`, tức Tra C1.2.
7. Ô chọn chương trình 301 chỉ hiện một chữ `301`:
   - bỏ dòng `40 bài` trong ô chương trình;
   - bỏ badge CSS `301` bị lặp;
   - danh sách 40 bài bên dưới vẫn giữ nguyên.
8. Không thay đổi dữ liệu, route, IndexedDB, localStorage, nội dung HSK, Bộ thủ 214, Flashcard, Bút thuận hoặc Pinyin.

## File được thay đổi

- `index.html`
- `style.css`
- `modules/hanzi-stroke/index.html`
- `modules/hanzi-stroke/app.js`
- `modules/hanzi-stroke/style.css`
- `modules/shared/app-shell.js`
- `modules/shared/home-dashboard.js`
- `modules/lookup/index.html` — chỉ đổi cache version app shell
- `modules/pinyin/index.html` — chỉ đổi cache version app shell
- `modules/bo-thu-50/index.html` — chỉ đổi cache version app shell
- `tests/test_ui_upgrade.py`

## Kết quả tự động

- 25/25 Python regression tests: PASS.
- 6/6 JavaScript syntax checks: PASS.
- 9/9 route HTTP checks: HTTP 200.

Xem chi tiết tại `reports/UI_COMPACT_TEST_RESULTS_20260717.txt`.

## Danh sách test thủ công

### A. Trang chủ

1. Mở Trang chủ trên mobile.
2. Xác nhận không còn hero lớn cũ hoặc khu `Công cụ học` cũ.
3. Xác nhận thứ tự hiển thị:
   - Tra nhanh;
   - Học tiếp;
   - Khám phá.
4. Trong Khám phá phải có đúng:
   - Giáo trình;
   - Bộ thủ;
   - Thẻ;
   - Bút thuận;
   - Pinyin.
5. Icon Bút thuận phải là biểu tượng viết `✍`, không phải kính lúp.
6. Nhập `你好` tại Tra nhanh và bấm Tra.
7. URL phải mở `modules/lookup/index.html?q=你好` và hiện kết quả trong Tra C1.2.
8. Bấm card Bút thuận phải mở `modules/hanzi-stroke/index.html?study=writing`.

### B. Màn Học

1. Mở `?study=hub`.
2. Xác nhận không còn:
   - `Học tiếng Trung`;
   - mô tả dài;
   - chữ `学` lớn.
3. Chỉ còn tiêu đề nhỏ `CHỌN NỘI DUNG` rồi đến danh sách 5 mục.
4. Không còn dòng `Học theo cách phù hợp`.
5. Thứ tự card phải là:
   - Giáo trình;
   - Bộ thủ;
   - Thẻ;
   - Bút thuận;
   - Pinyin.

### C. Giáo trình và 301

1. Mở `?study=hsk`.
2. Xác nhận không còn hero `Học theo lộ trình / Giáo trình / 课`.
3. Trong thanh chương trình, ô 301 chỉ hiển thị duy nhất `301`.
4. Không được còn:
   - `301` lặp hai lần;
   - `40 bài` bên trong ô chương trình.
5. Bên dưới vẫn phải tải đủ danh sách 40 bài 301.
6. HSK 6 cấp, HSK 9 cấp, YCT và Boya vẫn mở bình thường.
7. Chương trình mở gần nhất vẫn được ghi nhớ sau khi reload.

### D. Bộ thủ

1. Mở `?study=radicals`.
2. Xác nhận không còn hero `Nền tảng chữ Hán / Bộ thủ / 部`.
3. Xác nhận không còn card `Bộ thủ trong Tra chữ Hán`.
4. Phần tìm bộ thủ và chọn nhóm phải xuất hiện gần đầu màn hình.
5. Tìm `力`, mở chi tiết và xác nhận dữ liệu vẫn hoạt động.

### E. Thẻ

1. Mở `?study=flashcards`.
2. Xác nhận không còn hero `Ôn tập chủ động / Thẻ / 卡`.
3. Thư viện bộ thẻ phải xuất hiện ngay.
4. Kiểm tra các nút:
   - Tạo bộ;
   - Xuất JSON;
   - Nhập JSON;
   - Ôn / Khó;
   - Xóa lịch sử.
5. Reload và xác nhận dữ liệu IndexedDB/lịch sử không bị mất.

### F. Bút thuận và điều hướng

1. Mở `?study=writing`.
2. Tab Bút thuận phải dùng icon `✍`.
3. Nhập một chữ và thử Phát nét/Luyện viết.
4. Breadcrumb phải có thể bấm quay lại:
   - Trang chủ → Học → Bút thuận;
   - Trang chủ → Học → Giáo trình;
   - Trang chủ → Học → Bộ thủ;
   - Trang chủ → Học → Thẻ.
5. Nút Back của trình duyệt/điện thoại phải trở về màn trước.

### G. Responsive

Kiểm tra tối thiểu tại:

- mobile 360 px;
- mobile 390 px;
- mobile 430 px;
- desktop từ 900 px.

Mobile phải có bottom nav `Trang chủ | Tra | Học | Menu`. Desktop không có bottom nav cố định và dùng navigation trên header.

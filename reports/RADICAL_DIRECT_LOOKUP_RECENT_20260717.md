# Bộ thủ tải trực tiếp và lịch sử Tra gần đây

Ngày: 2026-07-17

## Phạm vi

### Bộ thủ

- Gọi tải trực tiếp từ `setStudyTab('radicals')`, không còn phụ thuộc duy nhất vào custom event.
- Hỗ trợ cả `?study=radical` và `?study=radicals`.
- Tự kiểm tra khi module khởi tạo, khi view bỏ thuộc tính `hidden`, sau 250 ms, sau 1.200 ms, khi `popstate` và khi navigation thay đổi.
- Công khai API `window.HanziRadicals.ensureLoaded()` để route gọi trực tiếp.
- Catalog nhẹ lỗi thì fallback sang `radical_learning_notes.json`.
- Mỗi request có timeout; toàn bộ lượt tải có watchdog 32 giây.
- Khi lỗi hiển thị `Thử lại`, không giữ trạng thái “Đang tải…” vô hạn.
- Console có log bắt đầu, catalog nhẹ, fallback, hoàn tất và lỗi cuối.
- Nhóm bộ thủ lỗi thì dùng nhóm dự phòng, không làm hỏng toàn bộ danh sách.

### Tra gần đây

- Dùng chung khóa localStorage: `tiengTrung.lookup.recent.v1`.
- Lưu tối đa 10 target đã mở thành công.
- Không lưu query không có kết quả hoặc màn danh sách kết quả chưa chọn mục cụ thể.
- Không trùng; tra lại mục cũ đưa mục đó lên đầu.
- Trang chủ hiển thị 5 mục gần nhất.
- Tra C1.2 hiển thị 10 mục gần nhất và có `Xóa lịch sử`.
- Bấm mục gần đây mở trực tiếp Tra C1.2.
- Khi đi `好 → Bộ Nữ → 姐`, navigation stack vẫn giữ `好 → 姐`; lịch sử gần đây không thay thế breadcrumb.
- Khi Back về mục cha, lịch sử không bị tự động đảo thứ tự.

## Các file thay đổi

- `app.js`
- `index.html`
- `style.css`
- `modules/shared/lookup-history.js` (mới)
- `modules/shared/app-shell.js`
- `modules/lookup/app.js`
- `modules/lookup/index.html`
- `modules/lookup/style.css`
- `modules/hanzi-stroke/app.js`
- `modules/hanzi-stroke/index.html`
- `tests/test_ui_upgrade.py`

## List test thủ công

### A. Bộ thủ tải trực tiếp

1. Mở thẳng `modules/hanzi-stroke/index.html?study=radicals`.
2. Trong Network phải xuất hiện request `radical_catalog.json` mà không cần đổi tab.
3. Danh sách phải hiện đủ 214 bộ.
4. Mở thẳng `modules/hanzi-stroke/index.html?study=radical`.
5. Route số ít vẫn mở đúng Bộ thủ và tải dữ liệu.
6. Từ `Học → Thẻ`, chuyển sang `Bộ thủ`; catalog phải được gọi trực tiếp.
7. Reload khi đang ở Bộ thủ; danh sách phải tự hiện.
8. Tìm `女`, `nữ`, `氵`, `thủy`.
9. Mở Bộ Nữ và kiểm tra chi tiết.
10. Trong DevTools chặn `radical_catalog.json`; app phải thử fallback file đầy đủ.
11. Chặn cả catalog và file đầy đủ; app phải hiện lỗi cùng nút `Thử lại`.
12. Bỏ chặn, bấm `Thử lại`; danh sách phải tải lại.
13. Không được đứng “Đang tải dữ liệu bộ thủ…” vô thời hạn.
14. Console phải có log bắt đầu tải và hoàn tất hoặc lỗi cụ thể.

### B. Tra gần đây

1. Xóa lịch sử trước khi thử.
2. Tra `好`; mục `好` xuất hiện trong Tra gần đây.
3. Tra `姐`; thứ tự thành `姐, 好`.
4. Tra lại `好`; thứ tự thành `好, 姐`, không có hai mục `好`.
5. Tra `ni hao`; sau khi mở kết quả chính xác, lịch sử lưu target chuẩn hóa `你好`.
6. Nhập query không có kết quả; query đó không được lưu.
7. Tra hơn 10 mục; Tra chỉ giữ 10 mục mới nhất.
8. Về Trang chủ; chỉ hiện 5 mục mới nhất.
9. Bấm một mục tại Trang chủ; phải mở `modules/lookup/index.html?q=...`.
10. Tại Tra, bấm một mục gần đây; kết quả mở ngay trong Tra C1.2.
11. Bấm `Xóa lịch sử`; danh sách biến mất.
12. Về Trang chủ; lịch sử cũng phải biến mất.
13. Reload; lịch sử đã lưu vẫn còn nếu chưa xóa.

### C. Không ảnh hưởng chuỗi điều hướng

1. Tra `好`.
2. Mở Bộ Nữ.
3. Bấm chữ ví dụ `姐`.
4. Header phải là `中 → Tra → 好 → 姐`.
5. Tra gần đây có thể là `姐, 好`, nhưng breadcrumb vẫn giữ chuỗi trên.
6. Bấm Back; phải trở về `好`.
7. Lịch sử gần đây không được tự đảo `好` lên đầu chỉ vì Back.
8. Bấm `好` trong breadcrumb; phải mở lại đúng `好`.

## Kết quả tự động

- Python UI regression: 47/47 đạt.
- JavaScript syntax: 5/5 file đạt.
- Runtime localStorage history: đạt giới hạn 10, loại trùng và xóa.
- Radical data: catalog 214/214, detail 214/214.
- Local HTTP: 9/9 route và tài nguyên trả 200.
- Headless Chromium không chạy được trong container do giới hạn DBus/inotify/NETLINK; cần kiểm tra hiển thị trên Chrome thật.

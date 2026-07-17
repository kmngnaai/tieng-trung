# Báo cáo sửa breadcrumb cố định trên header

Ngày: 2026-07-17

## Phạm vi đã chốt

Thanh trên cùng ở trang con dùng cấu trúc:

```text
[中] [breadcrumb cuộn ngang] [◐] [☰]
```

- `中` luôn cố định và bấm về Trang chủ.
- Nút đổi giao diện và Menu luôn cố định bên phải.
- Chỉ vùng breadcrumb ở giữa được cuộn ngang.
- Mobile tự cuộn tới cuối để cấp gần nhất luôn được nhìn thấy trước.
- Không còn hàng breadcrumb riêng trong phần nội dung.
- Breadcrumb chỉ phản ánh cấp điều hướng thật.
- Không đưa tab nội dung như Từ vựng, Câu mẫu, Hội thoại, Chú thích vào breadcrumb.

## Nội dung đã sửa

### App shell chung

- Chuyển breadcrumb từ đầu nội dung lên giữa header.
- Header trang con rút gọn thương hiệu chỉ còn `中`.
- Trang chủ vẫn giữ chữ `Tiếng Trung` và desktop navigation như trước.
- Desktop trang con dùng `中 + breadcrumb + ◐ + ☰`.
- Mobile tiếp tục giữ bottom navigation `Trang chủ | Tra | Học | Menu`.
- Vùng breadcrumb dùng `overflow-x: auto`, không xuống dòng.
- Sau mỗi lần cập nhật, vùng breadcrumb tự cuộn tới cuối.
- Cấp hiện tại in đậm; các cấp cha là liên kết thật.

### 301

Chi tiết bài dùng đúng cấu trúc:

```text
中 → Học → Giáo trình → 301 → Bài N
```

Tên đầy đủ của bài vẫn nằm trong nội dung, header chỉ dùng `Bài N`.

### HSK, YCT và Boya

Breadcrumb động theo cấp thật:

```text
中 → Học → Giáo trình → HSK 6 cấp → HSK 1 → Bài 3
中 → Học → Giáo trình → HSK 9 cấp → HSK 2 → Chủ đề 4
中 → Học → Giáo trình → YCT → YCT 2 → Bài 5
中 → Học → Giáo trình → Boya → Quyển 3 → Bài 2
```

- URL lưu `curriculum`, `level`, `section` và `sectionMode` khi cần.
- Reload hoặc mở link trực tiếp khôi phục đúng nguồn, cấp và bài/chủ đề.
- Back/Forward của trình duyệt khôi phục lại trạng thái HSK tương ứng.
- Bấm vào cấp cha trong breadcrumb quay về đúng cấp đó.

### Các module khác

```text
中 → Học
中 → Học → Bộ thủ
中 → Học → Thẻ
中 → Học → Bút thuận
中 → Học → Pinyin
中 → Tra → 你好
中 → Menu → Tham khảo → Bộ thủ 50
```

Tra C1.2 phát sự kiện cập nhật header khi lịch sử kết quả hoặc từ khóa thay đổi.

## File chính đã thay đổi

- `modules/shared/app-shell.js`
- `modules/shared/app-shell.css`
- `modules/hanzi-stroke/app.js`
- `modules/lookup/app.js`
- `index.html`
- `modules/hanzi-stroke/index.html`
- `modules/lookup/index.html`
- `modules/pinyin/index.html`
- `modules/bo-thu-50/index.html`
- `UI_RULES_Tieng_Trung_Web.md`
- `tests/test_ui_upgrade.py`
- `tests/test_header_breadcrumb_runtime.js`

## Kết quả test tự động

- JavaScript syntax: 6/6 file đạt.
- Python regression: 36/36 test đạt.
- Header breadcrumb runtime: 5/5 tình huống đạt.
- CSS brace balance: 3/3 file đạt.
- Local HTML references: 5/5 trang đạt.
- HTTP routes: 9/9 route trả 200.

Headless Chromium không chạy được trong môi trường container vì hạn chế DBus, inotify và netlink. Do đó cần thực hiện list test giao diện thủ công trên trình duyệt thật sau khi ghi đè patch.

## List test thủ công

### Header chung

1. Mở Trang chủ: thấy `中 Tiếng Trung`.
2. Mở một trang con: chỉ còn `中` ở bên trái.
3. Bấm `中`: quay về Trang chủ.
4. Nút `◐` và `☰` luôn nhìn thấy.
5. Không còn breadcrumb riêng ở dưới header.
6. Trên mobile, breadcrumb không xuống dòng.
7. Kéo ngang vùng breadcrumb để thấy các cấp cũ.
8. Khi mở trang dài cấp, mặc định nhìn thấy cấp gần nhất.

### 301

1. Vào `Học → Giáo trình → 301 → Bài 1`.
2. Header hiện `Học → Giáo trình → 301 → Bài 1`.
3. Không có chữ `Trang chủ` trong breadcrumb.
4. Bấm `301`: về danh sách 40 bài.
5. Bấm `Giáo trình`: về màn Giáo trình.
6. Bấm `Học`: về Chọn nội dung.
7. Mở Bài 18: cấp cuối đổi thành `Bài 18`.
8. Back/Forward đổi đúng bài và breadcrumb.

### HSK 6 cấp

1. Chọn `HSK 6 cấp` và HSK 1.
2. Header hiện `Học → Giáo trình → HSK 6 cấp → HSK 1`.
3. Mở Bài 1: thêm cấp `Bài 1`.
4. Bấm `HSK 1`: quay về danh sách bài của HSK 1.
5. Bấm `HSK 6 cấp`: quay về nguồn HSK 6 cấp.
6. Chuyển HSK 2: cấp độ đổi thành `HSK 2`.
7. Reload vẫn mở đúng nguồn và cấp.
8. Back/Forward khôi phục đúng cấp/bài.

### HSK 9 cấp, YCT và Boya

1. HSK 9 cấp hiển thị đúng tên nguồn và cấp.
2. HSK 7–9 hiển thị rút gọn đúng.
3. YCT hiển thị `YCT → YCT N`.
4. Boya hiển thị `Boya → Quyển N`.
5. Bài học dùng `Bài N`; chủ đề dùng `Chủ đề N`.
6. Không có Từ vựng/Câu mẫu/Hội thoại trong breadcrumb.

### Các module khác

1. Bộ thủ: `Học → Bộ thủ`.
2. Thẻ: `Học → Thẻ`.
3. Bút thuận: `Học → Bút thuận`.
4. Pinyin: `Học → Pinyin`.
5. Tra `你好`: `Tra → 你好`.
6. Bộ thủ 50: `Menu → Tham khảo → Bộ thủ 50`.
7. Bottom nav mobile vẫn hoạt động đủ 4 mục.

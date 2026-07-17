# Báo cáo sửa breadcrumb chi tiết 301

## Lỗi tái hiện

Từ `Học → Giáo trình → 301`, khi mở Bài 1, trang chi tiết chỉ hiển thị:

`Trang chủ → Học`

Điều này làm mất cấp Giáo trình, chương trình 301 và bài đang mở.

## Kết quả sau sửa

Trang chi tiết hiển thị đầy đủ:

`Trang chủ → Học → Giáo trình → 301 → Bài 1`

Với bài khác, nhãn cuối thay đổi theo số bài, ví dụ:

`Trang chủ → Học → Giáo trình → 301 → Bài 18`

## Hành vi điều hướng

- `Trang chủ`: về trang chủ.
- `Học`: về màn Chọn nội dung.
- `Giáo trình`: về màn Giáo trình.
- `301`: về đúng chương trình 301 trong Giáo trình.
- `Bài N`: cấp hiện tại, không phải liên kết.
- Khi chọn bài khác, URL được cập nhật bằng History API.
- Back/Forward của trình duyệt hoặc điện thoại đổi lại đúng bài trước/sau.

## Phạm vi file

- `index.html`
- `app.js`
- `modules/shared/app-shell.js`
- `modules/hanzi-stroke/app.js`
- `tests/test_ui_upgrade.py`

Không thay đổi dữ liệu 301, nội dung bài, Tra C1.2, Bộ thủ, Thẻ, Bút thuận hoặc Pinyin.

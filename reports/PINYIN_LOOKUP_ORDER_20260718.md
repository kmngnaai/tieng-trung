# Pinyin lookup order — 2026-07-18

## Thay đổi
Chỉ chuyển block `Tra cứu` lên trước `renderGroupPickerV23(active)` và `renderGroupDetailV23(active)` trong màn Học Pinyin.

## Không thay đổi
- Không đổi `setTab('listen')` của Tra âm.
- Không đổi `setTab('chart')` của Bảng tổng.
- Không đổi `setTab('rules')` của Quy tắc.
- Không đổi nội dung Nhập môn Pinyin.
- Không đổi dữ liệu, tiến độ hoặc các tab Pinyin.

## Cache
`modules/pinyin/index.html` sử dụng `app.js?v=20260718-lookuporder1`.

## Kiểm thử
- JavaScript syntax: đạt.
- Python test syntax: đạt.
- Regression: 62/62 đạt.
- Test thứ tự mới xác nhận `Tra cứu` nằm trước Nhập môn/Danh sách nội dung.

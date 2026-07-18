# Flashcard deck multi-select

## Mục tiêu

Cho phép chọn nhiều bộ thẻ tự tạo rồi di chuyển vào cùng một nhóm.

## Cách vào chế độ chọn

- Bấm nút `Chọn` ở đầu màn Bộ tự tạo hoặc màn bên trong một nhóm.
- Hoặc nhấn giữ một card bộ thẻ khoảng 520 ms. Card đó được chọn ngay.

## Luồng sử dụng

1. Vào chế độ chọn.
2. Chạm các card để chọn hoặc bỏ chọn.
3. Có thể dùng `Chọn tất cả` cho các bộ đang hiển thị sau khi tìm kiếm/lọc.
4. Bấm `Di chuyển vào nhóm`.
5. Chọn nhóm đích, `Không phân nhóm`, hoặc tạo nhóm mới.

## Hành vi

- Card được chọn có viền và nền nhấn rõ ràng.
- Trong chế độ chọn, nút Học và menu ba chấm trên card tạm khóa để tránh bấm nhầm.
- Nhấn giữ không mở chi tiết sau khi kích hoạt chọn.
- Có thể di chuyển cả một lô bộ thẻ vào nhóm mới vừa tạo.
- Dữ liệu thẻ và lịch sử học không thay đổi; chỉ cập nhật `groupId` của bộ.
- Rời màn Bộ tự tạo hoặc đổi nhóm sẽ hủy lựa chọn hiện tại.

## File thay đổi

- `modules/hanzi-stroke/app.js`
- `modules/hanzi-stroke/style.css`
- `modules/hanzi-stroke/index.html`
- `tests/test_ui_upgrade.py`

## Cache

- `20260718-deckmultiselect1`

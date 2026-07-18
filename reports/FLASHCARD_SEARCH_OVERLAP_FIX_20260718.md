# Flashcard search overlap fix

## Nguyên nhân
Ô tìm kiếm đang có hai lớp hiển thị:
- wrapper `.flashcard-library-search` có border và bo góc;
- `input[type="search"]` vẫn giữ một phần giao diện native của trình duyệt.

Kết quả là input trông như một ô thứ hai nằm chồng bên trong wrapper.

## Bản sửa
- Chỉ giữ wrapper làm khung duy nhất.
- Tắt `appearance` native của search input.
- Xóa border, radius, background và box-shadow của input bên trong.
- Chia layout thành cột icon 18px và phần input linh hoạt.
- Ẩn nút search/cancel native WebKit để không đè placeholder.
- Thêm trạng thái focus bằng `:focus-within` trên wrapper.
- Đổi cache CSS sang `20260718-searchfix1`.

## File thay đổi
- `modules/hanzi-stroke/style.css`
- `modules/hanzi-stroke/index.html`
- `tests/test_ui_upgrade.py`

## Kiểm tra
- 63/63 test đạt.
- JavaScript syntax đạt.
- Python test syntax đạt.

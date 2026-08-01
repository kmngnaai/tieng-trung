# Mẫu nhập tab Nghe

- `nghe-mau-day-du.xlsx`: mỗi trường hợp nằm ở một sheet, có sheet `00_HUONG_DAN`.
- `nghe-mau-day-du.csv`: bảng dài UTF-8.
- `nghe-mau-day-du.txt`: bảng dài UTF-8, phân cách bằng tab.
- `nghe-mau-day-du.json`: cùng schema hàng với CSV/TXT.

Các dòng cùng `deck_id` tạo một bộ. Các bộ cùng `library_group_id` tạo một nhóm và có thể **Học toàn nhóm**. Không có sheet Ngữ pháp riêng trong phiên bản đầu; dùng `sentence_type` hoặc `tags`.

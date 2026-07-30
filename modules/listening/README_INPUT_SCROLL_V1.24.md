# Listening V1.24 — giữ đúng vị trí gõ trên iPhone

## Lỗi đã sửa

- Sau khi chọn chữ Hán đầu tiên, Safari tự cuộn sang vị trí khác trong đoạn dài.
- Nguyên nhân: input thật phủ toàn bộ chiều cao đoạn và danh sách ô bị dựng lại bằng `innerHTML` sau mỗi chữ.

## Cách sửa

- Trên mobile, input IME được giữ cố định trong vùng nhìn, không còn cao bằng toàn bộ đoạn.
- Chỉ cập nhật từng ô chữ và dấu câu, không dựng lại toàn bộ đoạn sau mỗi lần nhập.
- Chỉ tự cuộn khi ô đang gõ thật sự ra ngoài vùng nhìn phía trên bàn phím.
- Giữ nguyên bàn phím, focus, âm thanh và thanh điều khiển ±3 giây.
- Cache tài nguyên: `20260730-localaudio1-24`.

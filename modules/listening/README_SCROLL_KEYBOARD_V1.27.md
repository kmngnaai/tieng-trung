# Listening V1.27 — Native scroll with keyboard

- Bỏ toàn bộ `pointerdown` / `pointermove` / `pointerup` khỏi vùng chép đoạn.
- Chỉ dùng `click` để mở hoặc giữ bàn phím; vuốt dọc không phát click nên Safari cuộn tự nhiên.
- Giữ các listener theo dõi cuộn ở chế độ `passive`.
- Ép `html`, `body` và vùng chép dùng `touch-action: pan-y`.
- Giữ bàn phím khi bấm -3s / Phát / +3s.
- Cache: `20260730-localaudio1-27`.

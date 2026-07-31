# Test report — Thanh audio nổi theo ngữ cảnh V1

Ngày kiểm tra: 2026-07-31

## Phạm vi thay đổi

- Hợp nhất thanh audio nổi thành một component dùng chung.
- Mặc định ẩn.
- Hiện dạng thu gọn khi audio card chính ra khỏi viewport hoặc khi bàn phím nhập mở.
- Cho phép người học mở rộng khi cần.
- Nút quay về chỉ hiện khi active learning target đã rời viewport.
- Không thay schema dữ liệu giáo trình hoặc logic activity builders.

## File mã nguồn thay đổi

- `modules/listening/app.js`
- `modules/listening/style.css`
- `modules/listening/index.html`
- `modules/listening/LISTENING_EXPANSION_RULES.md`
- `tests/test_listening_architecture_contract.js`
- `scripts/test-listening-layout-browser.py`
- `scripts/test-listening-new-hsk-local.sh`

## Kết quả tự động

| Kiểm tra | Kết quả |
|---|---|
| JavaScript syntax | PASS |
| Python regression | 67/67 PASS |
| LDSN14 runtime regression | PASS |
| Lookup navigation regression | PASS |
| New HSK schema và activity builders | PASS |
| New HSK app integration contract | PASS |
| Learning UX contract | PASS |
| Architecture consolidation contract | PASS |
| Browser contextual floating audio | PASS |

## Browser assertions

### Mobile

- Thanh nổi ẩn khi audio card chính ở trong viewport: PASS.
- Cuộn audio card ra ngoài viewport → thanh nổi hiện dạng thu gọn: PASS.
- Mở rộng → thấy Lùi / Phát / Tiến: PASS.
- Cuộn lại audio card → thanh nổi tự ẩn: PASS.
- Khi nhập và active slot ra ngoài viewport → nút quay về hiện: PASS.
- Bấm quay về → active slot trở lại viewport và nút quay về ẩn: PASS.

### Desktop

- Không hiện thanh audio nổi: PASS.
- Cụm audio chính căn giữa: PASS.

Số đo:

```text
Mobile card center:     215 px
Mobile controls center: 215 px
Desktop card center:    640 px
Desktop controls center:640 px
```

## Kiến trúc đã kiểm tra

- Chỉ còn một renderer thanh audio nổi: PASS.
- Không còn `dictation-audio-float`: PASS.
- Không còn action `return-to-active-slot`: PASS.
- Không còn localStorage key riêng cho thanh nổi cũ: PASS.
- Mọi activity dùng `data-primary-audio` và `data-learning-target`: PASS.
- Khi đổi câu/bài, floating context được reset: PASS.

## Giới hạn còn cần test thiết bị thật

- Hành vi bàn phím Pinyin trên iPhone.
- Safe area ở thiết bị có tai thỏ.
- MP3 nhập thật và quyền autoplay của trình duyệt.
- Khả năng tua của từng giọng TTS thiết bị.

Không phát hiện lỗi hồi quy trong test tự động hiện có.

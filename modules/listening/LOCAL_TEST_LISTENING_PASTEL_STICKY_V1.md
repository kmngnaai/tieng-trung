# Local test — Listening Pastel Sticky V1

## Chuẩn bị

```powershell
python -m http.server 8000
```

Mở `http://localhost:8000/modules/listening/` rồi nhấn `Ctrl + F5`.

## Test tự động

```bash
bash scripts/test-listening-new-hsk-local.sh
```

Kỳ vọng: toàn bộ bước PASS, gồm 67/67 regression và browser test audio.

## Test thủ công

1. Mở `New HSK 1`.
   - Không còn thẻ “Phạm vi bản thử local”.
   - Subtitle là “Chọn bài học”.
2. Mở bài `我叫李文`.
   - Header hiển thị `New HSK 1 · 我叫李文`.
   - Dòng phụ hiển thị `15 từ · 60 câu phân biệt`.
3. Cuộn xuống Hội thoại và Đoạn văn.
   - Header luôn nằm ở đầu màn hình.
   - Nội dung đầu card không bị header che.
4. Kiểm tra màu.
   - Xanh lá vẫn là màu chủ đạo/active.
   - Từ: xanh mint.
   - Câu: vàng kem.
   - Bộ lọc: tím nhạt.
   - Hội thoại: cam đào.
   - Đoạn: xanh trời.
5. Kiểm tra mobile 430 x 932 và desktop.
   - Không tràn ngang.
   - Header không lệch khỏi khung app.
   - Bottom nav không bị ảnh hưởng.
6. Mở một activity nghe.
   - Audio, thanh nổi, nhập liệu và Next vẫn hoạt động như trước.

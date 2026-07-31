# Local Test — Listening Full Dictation & Caret V3

## 1. Chuẩn bị

Repo local:

```text
D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web
```

Mở PowerShell tại thư mục repo và chạy:

```powershell
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/listening/
```

Nhấn `Ctrl + F5` một lần sau khi chép file mới.

## 2. Test tự động

### Test chính

Chạy bằng Git Bash hoặc WSL:

```bash
sh scripts/test-listening-new-hsk-local.sh
```

Kết quả mong đợi:

```text
PASS: Listening New HSK local automated test list
```

### Browser smoke tùy chọn

Cần Python Playwright và Chromium/Chrome trong `PATH`:

```bash
python scripts/test-listening-full-dictation-browser.py
```

Kết quả mong đợi:

```text
PASS: browser smoke filters, full dialogue/passage, tap-to-correct and resume caret
```

Ảnh browser smoke được tạo tại:

```text
test-output/listening-full-dictation-caret/
```

## 3. Danh sách test thủ công

### A. Nguồn câu và bộ lọc

1. Mở `New HSK 1 → 我叫李文`.
2. Kiểm tra phần tóm tắt hiển thị:
   - 60 câu phân biệt.
   - 53 ví dụ từ vựng gốc.
   - 2 câu ngữ pháp riêng.
   - 5 câu biên soạn.
3. Chọn `Ví dụ từ vựng`: phải hiện `53/60`.
4. Chọn `Ngữ pháp`: phải hiện `3/60` vì có 1 câu đồng thời thuộc ví dụ từ vựng và ngữ pháp.
5. Chọn `Biên soạn`: phải hiện `5/60`.
6. Chọn `Toàn bộ`: phải trở lại `60/60`.
7. Mở `Xem trước nội dung`; mỗi câu phải có nhãn nguồn phù hợp:
   - Ví dụ từ vựng.
   - Ngữ pháp.
   - Biên soạn.

### B. Hai kiểu chép hội thoại

1. `Chép từng lượt` vẫn tồn tại.
2. Mỗi lượt được nghe và nhập riêng.
3. Ngữ cảnh toàn hội thoại vẫn hiển thị phía trên.
4. `Chép nguyên hội thoại` là lựa chọn riêng.
5. Khi mở `Chép nguyên hội thoại`:
   - Có đủ 8 lượt trên cùng màn hình.
   - A/B được hiện sẵn.
   - Người học không phải nhập tên người nói.
   - Bộ đếm tính tổng chữ của toàn hội thoại.
   - Không có nút `Câu sau` trong cụm audio toàn hội thoại.

### C. Hai kiểu chép đoạn văn

1. `Chép từng câu` vẫn tồn tại.
2. Mỗi câu được nghe và nhập riêng, có ngữ cảnh đoạn phía trên.
3. `Chép nguyên đoạn` là lựa chọn riêng.
4. Khi mở `Chép nguyên đoạn`:
   - Có đủ 4 dòng/câu trên cùng màn hình.
   - Chỉ có một tiến trình nhập liên tục từ đầu đến cuối.
   - Không bắt chuyển `Câu 1/4 → Câu 2/4`.
   - Không có nút `Câu sau` trong cụm audio toàn đoạn.

### D. Sửa chữ ở giữa câu/đoạn

Thực hiện trên cả:

- Chép từng câu.
- Chép từng lượt.
- Chép nguyên hội thoại.
- Chép nguyên đoạn.

Các bước:

1. Gõ ít nhất 4–6 chữ.
2. Chạm vào chữ thứ 2 hoặc thứ 3 đã gõ.
3. Chữ được chọn phải có nền/viền nổi bật.
4. Chọn một chữ Hán mới từ IME.
5. Chữ mới phải thay đúng vị trí đã chọn, không nối vào cuối.
6. Sau khi thay, con trỏ phải tự quay về vị trí đang gõ trước khi sửa.
7. Gõ tiếp một chữ mới; chữ phải nối ở vị trí tiếp tục, không chen vào chỗ vừa sửa.
8. Lặp lại với một chữ sai khác ở dòng khác của hội thoại/đoạn.
9. Chọn chữ rồi bấm Backspace; chỉ chữ được chọn bị xóa.
10. Không được bắt người học xóa toàn bộ phần phía sau để tới chữ sai.

### E. IME và thiết bị

1. Windows + Microsoft Pinyin:
   - Gõ pinyin.
   - Chọn chữ.
   - Sửa chữ giữa đoạn.
   - Tiếp tục gõ ở cuối.
2. Android + bàn phím Trung:
   - Chạm chính xác được ô chữ.
   - Bàn phím không đóng sau khi sửa.
3. iPhone/iPad:
   - Chạm chữ mở/giữ bàn phím.
   - Vuốt dọc vẫn cuộn trang.
   - Chọn ứng viên xong caret quay lại vị trí đang gõ.
4. Câu có chữ lặp phải sửa đúng ô được chạm, không sửa nhầm chữ giống nhau.

### F. Audio

1. Không có MP3: dùng TTS thiết bị.
2. Có MP3 nhập: MP3 vẫn được ưu tiên.
3. Chép nguyên hội thoại phát toàn hội thoại.
4. Chép nguyên đoạn phát toàn đoạn.
5. Tốc độ 0.5×–1.5× vẫn hoạt động.
6. Từ/Câu sau ở các chế độ từng mục vẫn tự phát mục mới.

### G. Không hồi quy

1. Chọn từ 4 đáp án vẫn hoạt động.
2. Mức khó 5 đáp án vẫn hoạt động.
3. Xếp từ không nhận câu dưới 3 token.
4. Xếp thứ tự hội thoại và xếp từ trong từng câu vẫn là hai hoạt động riêng.
5. Transcript, gợi ý, xem đáp án, Dễ/Ôn/Khó và Câu cần ôn không mất.
6. 301, bộ tự tạo và LDSN14 không bị ảnh hưởng bởi thay đổi nguồn New HSK.

## 4. Giới hạn cần biết

Patch này sửa vị trí caret trong phiên đang mở và thêm hai chế độ chép nguyên. Việc lưu toàn bộ chuỗi đang gõ dở qua thao tác tải lại trang chưa được mở rộng trong patch này; phiên vẫn lưu nguồn, hoạt động và vị trí mục theo cơ chế hiện có.

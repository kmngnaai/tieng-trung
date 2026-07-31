# Local Test – New HSK 1 Listening Sample

## 1. Chạy local

Tại thư mục gốc repo:

```powershell
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/listening/
```

Chạy test tự động trên Git Bash/WSL/macOS/Linux:

```bash
sh scripts/test-listening-new-hsk-local.sh
```

Trên PowerShell có thể chạy từng lệnh trong mục 3.

## 2. Luồng mở mẫu

1. Mở tab **Nghe**.
2. Chọn **New HSK 1 · Mẫu mở rộng**.
3. Chọn bài **我叫李文 – Tôi tên là Lý Văn**.
4. Kiểm tra đủ các nhóm: Từ, Câu, Hội thoại, Đoạn văn.

## 3. Test tự động

```powershell
node --check modules/listening/core.js
node --check modules/listening/source-adapters.js
node --check modules/listening/activity-builders.js
node --check modules/listening/app.js
python -m unittest discover -s tests -p "test_*.py"
node tests/test_ldsn14_runtime.js
node tests/test_lookup_navigation_context_runtime.js
node tests/test_listening_new_hsk_sample.js
node tests/test_listening_new_hsk_app_contract.js
```

## 4. Danh sách test thủ công

### Nguồn và schema

- **LST-01**: Thẻ New HSK mở được danh sách mẫu, không báo lỗi tải dữ liệu.
- **LST-02**: Bài mẫu hiển thị 15 từ, câu chuẩn hóa, 1 hội thoại và 1 đoạn văn.
- **LST-03**: Chuyển `Toàn bộ / Câu ví dụ / Ngữ pháp`; số câu thay đổi đúng. `Toàn bộ` mặc định có trộn ngữ pháp.
- **LST-04**: Không có nút/nguồn nào sử dụng URL audio HSK; audio chỉ lấy MP3 nhập hoặc TTS.

### Nghe từ

- **LST-05**: `Chọn từ nghe được` luôn có 4 lựa chọn, chỉ có một đáp án đúng.
- **LST-06**: `Chọn từ · Mức khó` có 5 lựa chọn.
- **LST-07**: Chọn sai hiển thị đáp án đúng; chọn đúng ghi nhận kết quả.
- **LST-08**: `Điền tay từ nghe được` vẫn nhập/chấm từng chữ như chức năng cũ.

### Câu

- **LST-09**: Xếp câu bằng chạm chọn token; chạm token đã chọn để trả lại.
- **LST-10**: `Làm lại`, `Kiểm tra`, `Hiện đáp án` hoạt động và token ghép đúng câu nguồn.
- **LST-11**: Chép từng câu giữ gợi ý chữ/từ, tự chấm, Dễ/Ôn/Khó và tự chuyển.
- **LST-12**: Transcript bật/tắt Hán tự, pinyin và nghĩa đúng.

### Hội thoại

- **LST-13**: Xếp thứ tự hội thoại hiển thị đúng 8 lượt và giữ nhãn A/B.
- **LST-14**: Xếp từng câu hội thoại chỉ mở lượt hiện tại, vẫn thấy ngữ cảnh trước/sau.
- **LST-15**: Chép hội thoại từng câu chuyển đủ 8 lượt; có thể nghe riêng câu hiện tại.
- **LST-16**: Nghe toàn hội thoại phát các câu theo thứ tự bằng MP3/TTS.

### Đoạn văn

- **LST-17**: Xếp câu trong đoạn hiển thị đúng 4 thẻ câu.
- **LST-18**: Xếp từng câu trong đoạn không xáo từ của cả đoạn cùng lúc.
- **LST-19**: Chép đoạn từng câu hiển thị hoàn thành/đang làm/chưa làm.
- **LST-20**: Có thể nghe lại toàn đoạn hoặc riêng câu hiện tại.

### MP3, TTS và phiên học

- **LST-21**: Nhập MP3 cho một câu; câu đó dùng lại MP3 trong chép câu, hội thoại hoặc đoạn nhờ canonical ID.
- **LST-22**: Không có MP3 thì TTS đọc được; tốc độ 0.5–1.5 vẫn hoạt động.
- **LST-23**: Reload giữa bài chọn từ không đổi bộ 4/5 đáp án.
- **LST-24**: Reload giữa xếp câu giữ activity, câu hiện tại và thứ tự token đã xáo.
- **LST-25**: Reload giữa hội thoại/đoạn quay lại đúng nhóm và đúng câu đang làm.
- **LST-26**: Dễ/Ôn/Khó, Câu cần ôn và tiến độ vẫn còn sau reload.

### Không hồi quy và responsive

- **LST-27**: Giáo trình 301 vẫn mở và chép/nghe như trước.
- **LST-28**: Bộ tự tạo, nhóm, nhập/xuất JSON vẫn hoạt động.
- **LST-29**: LDSN14 runtime test vẫn pass.
- **LST-30**: Desktop không tràn thẻ; mobile chạm chọn dễ, token xuống dòng, bàn phím không che ký tự đang nhập.
- **LST-31**: Dữ liệu thiếu group/token không làm app crash; hoạt động không khả dụng phải được ẩn theo capability.

## 5. Tiêu chí chấp nhận patch

- Toàn bộ test tự động của patch PASS.
- Không phát hiện hồi quy ở 301, bộ tự tạo, audio, Dễ/Ôn/Khó và Câu cần ôn.
- LST-01 đến LST-31 được ghi PASS/FAIL trên thiết bị local thực tế.
- Chỉ sau khi mẫu được chốt mới chuyển 301 và LDSN14 sang schema chung.

# Local Test — Listening Learning UX V2

## 1. Chạy local

Mở PowerShell tại thư mục repo:

```powershell
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/listening/
```

Chọn:

```text
New HSK 1 → 我叫李文
```

Nếu trình duyệt từng mở bản cũ, nhấn `Ctrl + F5` một lần. Bản này đã đổi cache key thành `20260731-listening-learning-ux-2`.

## 2. Test tự động

Trong Git Bash hoặc WSL:

```bash
sh scripts/test-listening-new-hsk-local.sh
```

Kỳ vọng cuối cùng:

```text
PASS: Listening New HSK local automated test list
```

## 3. Danh sách test thủ công

### A. Giao diện audio

- [ ] Mở **Chọn từ nghe được**.
- [ ] Ba nút `Từ đầu / Phát / Từ sau` nằm cùng một trục, không có nút rơi xuống hàng khác.
- [ ] Năm nút tốc độ có kích thước đều và không tràn ngang iPhone 430 px.
- [ ] Mở **Chép từng câu**; cụm 5 nút `Từ đầu / Lùi / Phát / Tiến / Câu sau` thẳng hàng.
- [ ] Nút cài đặt không đè tiêu đề hoặc nút phát.

### B. Next tự phát audio

- [ ] Trong **Chọn từ nghe được**, bấm `Từ sau` ở audio card: từ mới tự đọc.
- [ ] Bấm `Từ sau` ở thanh điều hướng dưới: từ mới tự đọc.
- [ ] Trong **Xếp từ thành câu**, bấm `Câu sau`: câu mới tự đọc.
- [ ] Trong **Chép từng câu**, bấm `Câu sau`: câu mới tự đọc và ô nhập được đặt lại.
- [ ] Bật tự chuyển; trả lời đúng: mục mới tự chuyển và tự đọc.
- [ ] Với chế độ `Tự động`, MP3 không có thì tự dùng TTS.
- [ ] Với MP3 đã nhập, mục mới ưu tiên MP3; nếu trình duyệt chặn tự phát thì chuyển sang TTS ở chế độ `Tự động`.

### C. Xếp thứ tự hội thoại

- [ ] Mở **Xếp thứ tự lượt thoại**.
- [ ] Chỉ có một vị trí tiếp theo cần chọn, không dựng 8 ô trống làm người học phải cuộn dài.
- [ ] Ngân hàng lượt thoại xuất hiện ngay bên dưới vị trí cần chọn.
- [ ] Mỗi thẻ hiển thị chữ Hán theo chiều ngang, không bị xếp dọc từng chữ.
- [ ] Chạm một lượt: lượt đó đi lên vị trí số 1.
- [ ] Chạm lại lượt đã chọn: lượt trở về ngân hàng.
- [ ] `Hoàn tác`, `Làm lại`, `Kiểm tra`, `Hiện đáp án` hoạt động đúng.
- [ ] Màn hình giải thích rõ đây là xếp **câu/lượt hoàn chỉnh**, không phải xếp từ.

### D. Xếp từng câu hội thoại

- [ ] Mở **Xếp từng câu hội thoại**.
- [ ] Phiên chỉ có 5 câu có từ 3 token trở lên; ba lượt quá ngắn không trở thành bài xếp từ.
- [ ] Ba lượt ngắn vẫn xuất hiện trong khối ngữ cảnh với nhãn `Ngữ cảnh`.
- [ ] Câu hiện tại hiển thị `Đang nghe…`, không để lộ đáp án.
- [ ] Câu phía sau hiển thị `Chưa mở`.
- [ ] Chỉ câu đã qua được hiện nội dung mặc định.
- [ ] `Xem đủ 8 lượt` mở toàn bộ danh sách nhưng vẫn không tự để lộ câu hiện tại/câu sau.
- [ ] `Xem toàn bộ nội dung` mới chủ động mở transcript đầy đủ.
- [ ] Vùng xếp câu xuất hiện sớm, không phải cuộn qua toàn bộ 8 lượt.
- [ ] Các ô trống cho biết còn bao nhiêu token cần chọn.

### E. Chép hội thoại từng câu

- [ ] Mở **Chép hội thoại từng câu**.
- [ ] Phía trên có khối **Toàn bộ hội thoại**.
- [ ] Nghe được riêng câu hiện tại.
- [ ] Nút `Nghe toàn bộ` đọc toàn hội thoại.
- [ ] Khối ngữ cảnh mặc định che câu hiện tại và câu phía sau.
- [ ] Có thể mở toàn bộ nội dung khi cần đối chiếu.
- [ ] Khi sang lượt mới, audio lượt mới tự phát.
- [ ] Dễ / Ôn / Khó, gợi ý, hiện đáp án và tự chuyển vẫn hoạt động.

### F. Đoạn văn

- [ ] **Xếp câu trong đoạn** chỉ xếp các câu hoàn chỉnh.
- [ ] Ngân hàng câu hiển thị ngang, xuống dòng tự nhiên.
- [ ] **Xếp từng câu trong đoạn** giữ toàn bộ đoạn làm ngữ cảnh và chỉ xếp token của câu hiện tại.
- [ ] **Chép đoạn từng câu** có toàn bộ đoạn phía trên, nghe riêng câu hiện tại và nghe toàn bộ.
- [ ] Câu hiện tại/câu sau không bị lộ mặc định.
- [ ] Bấm `Câu sau` tự phát câu mới.

### G. Mobile

Kiểm tra kích thước 390 × 844 và 430 × 932:

- [ ] Không có thanh cuộn ngang.
- [ ] Bottom navigation không che nút `Kiểm tra` hoặc vùng nhập.
- [ ] Thẻ câu dài xuống dòng ngang tự nhiên.
- [ ] Chạm chọn là thao tác chính; không cần kéo thả.
- [ ] Khi bàn phím mở, điều khiển audio nổi vẫn sử dụng được.
- [ ] Ngữ cảnh thu gọn giúp vùng trả lời xuất hiện trong khoảng cuộn hợp lý.

### H. Desktop

- [ ] Nội dung nằm giữa, không kéo rộng quá khó đọc.
- [ ] Không tràn ngang ở 1280 × 900.
- [ ] Thẻ câu và nút audio thẳng hàng.
- [ ] Ngân hàng câu không bị chữ Hán xếp dọc.

### I. Reload và lịch sử

- [ ] Chọn vài token rồi reload: phiên, câu và thứ tự xáo giữ nguyên.
- [ ] Reload trong chép hội thoại: quay lại đúng lượt.
- [ ] Reload trong chép đoạn: quay lại đúng câu.
- [ ] Câu đã bấm `Xem toàn bộ nội dung` được ghi nhận là đã dùng gợi ý/cần ôn.
- [ ] Dễ / Ôn / Khó và Câu cần ôn không mất.
- [ ] MP3 đã nhập vẫn gắn với câu chuẩn khi đổi hoạt động.

## 4. Điều kiện chấp nhận patch

Patch chỉ được chốt khi:

1. Test tự động đạt toàn bộ.
2. Mobile không tràn ngang và không còn chữ Hán xếp dọc.
3. Next tự phát được bằng TTS; MP3 được kiểm tra trên trình duyệt thật.
4. Câu dưới 3 token không xuất hiện trong hoạt động xếp từ.
5. Hội thoại/đoạn có ngữ cảnh nhưng không tự để lộ đáp án.
6. Các chức năng cũ như nhập tay, transcript, Dễ/Ôn/Khó, lịch sử và MP3 không hồi quy.

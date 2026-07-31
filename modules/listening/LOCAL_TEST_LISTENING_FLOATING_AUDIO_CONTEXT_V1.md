# Local test — Thanh audio nổi theo ngữ cảnh V1

## Mục tiêu

Kiểm tra một thanh audio nổi dùng chung cho mọi hoạt động luyện nghe:

- Mặc định ẩn khi audio card chính còn thuận tiện truy cập.
- Hiện dạng thu gọn khi audio card ra khỏi viewport hoặc bàn phím nhập mở.
- Người học có thể mở rộng để dùng Lùi 3 giây / Phát–Tạm dừng / Tiến 3 giây.
- Nút quay về chỉ hiện khi vùng học đang hoạt động đã rời viewport.
- Quay về đúng câu, lượt, vùng xếp hoặc chữ đang nhập.

## Khởi động local

Tại thư mục gốc repo:

```powershell
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/listening/
```

Nhấn `Ctrl + F5` sau khi ghi đè file.

## Test tự động

Git Bash hoặc WSL:

```bash
sh scripts/test-listening-new-hsk-local.sh
```

Hoặc chạy riêng browser smoke test:

```bash
python3 scripts/test-listening-layout-browser.py
```

## Danh sách test thủ công

### A. Trạng thái mặc định

1. Mở hoạt động Chọn từ nghe được.
2. Khi audio card chính vẫn đang nằm trong màn hình, thanh nổi bên phải phải ẩn.
3. Không được có hai bộ điều khiển audio cùng xuất hiện cạnh nhau.

### B. Audio card ra khỏi viewport

1. Cuộn xuống dưới audio card.
2. Thanh nổi xuất hiện ở trạng thái thu gọn.
3. Trạng thái thu gọn chỉ hiện nút mở rộng và nút Phát/Tạm dừng.
4. Thanh nổi không che nút Kiểm tra, Câu sau hoặc bottom navigation.

### C. Mở rộng và thu gọn

1. Bấm nút mở rộng.
2. Phải thấy Lùi 3 giây, Phát/Tạm dừng và Tiến 3 giây.
3. Các nút phải cùng trục dọc, cùng chiều rộng và dễ chạm.
4. Bấm thu gọn; thanh trở về dạng gọn, không lệch vị trí.

### D. Bàn phím mở

1. Mở hoạt động Chép câu hoặc Chép nguyên đoạn.
2. Chạm vào vùng nhập để mở bàn phím.
3. Thanh nổi phải hiện dạng thu gọn dù audio card vẫn có thể còn gần viewport.
4. Đóng bàn phím và cuộn về audio card; thanh nổi phải ẩn.

### E. Nút quay về

1. Trong Chép nguyên hội thoại/đoạn, nhập một vài chữ.
2. Cuộn ra xa chữ đang nhập.
3. Nút quay về phải xuất hiện trên thanh nổi.
4. Bấm nút quay về.
5. Màn hình cuộn đúng tới chữ/vị trí đang nhập; nút quay về sau đó phải ẩn.

### F. Các hoạt động không nhập chữ

Kiểm tra lần lượt:

- Chọn từ nghe được.
- Điền từ bằng lựa chọn.
- Xếp từ thành câu.
- Xếp lượt hội thoại.
- Xếp câu trong đoạn.

Khi vùng trả lời đang hoạt động rời viewport, nút quay về phải đưa người học về đúng vùng trả lời hiện tại.

### G. Desktop

1. Mở ở chiều rộng khoảng 1280 px.
2. Thanh audio nổi không xuất hiện.
3. Cụm audio chính vẫn căn giữa.
4. Không có khoảng trống hoặc spacer vô hình.

### H. Reload và chuyển câu

1. Để thanh nổi mở rộng rồi bấm Câu sau.
2. Context mới phải reset về trạng thái thu gọn khi thanh cần xuất hiện.
3. Reload giữa phiên.
4. Không được hiển thị thanh nổi sai vị trí hoặc giữ active target của câu cũ.

### I. MP3 và TTS trên thiết bị thật

1. Nhập MP3 cho một câu rồi kiểm tra Phát/Lùi/Tiến trên thanh nổi.
2. Với TTS thiết bị, kiểm tra nút nào thực sự hỗ trợ tua.
3. Không được báo đã tua nếu trình duyệt không hỗ trợ.
4. Kiểm tra iPhone với bàn phím Pinyin và safe area bên phải.

## Điều kiện đạt

- Chỉ một thanh audio nổi dùng chung.
- Mặc định ẩn.
- Hiện đúng điều kiện, mặc định thu gọn.
- Nút quay về chỉ hiện khi thực sự cần.
- Không che nội dung học.
- Không có khác biệt cấu trúc giữa từ, câu, hội thoại và đoạn.

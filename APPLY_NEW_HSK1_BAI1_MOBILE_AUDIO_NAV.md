# Áp dụng patch New HSK 1 Bài 1

Patch này được tạo trên nền `tieng-trung-main (6).zip`.

## Cách áp dụng

1. Giải nén ZIP patch.
2. Chép toàn bộ nội dung bên trong vào thư mục repo `tieng-trung-web`.
3. Chọn ghi đè các tệp trùng tên.
4. Chạy local server:

```powershell
cd "D:\00.KIMNGAN\98.Đọc thêm\Chinese\tieng-trung-web"; python -m http.server 8000
```

5. Mở:

```text
http://localhost:8000/modules/new-hsk-course/index.html?level=1&lesson=1&view=book
```

## Kiểm tra nhanh

- Lần đầu mở: chỉ nút `汉` bật; `拼` và `Vi` tắt.
- Có thể bật/tắt từng ngôn ngữ và bật cả ba.
- Không thể tắt ngôn ngữ cuối cùng còn hiển thị.
- Các nút audio `1-1` đến `1-7` phát MP3 nguồn.
- Danh từ riêng có nút loa đọc bằng giọng thiết bị.
- New HSK 3.0 xuất hiện độc lập tại Trang chủ, Học và Menu.

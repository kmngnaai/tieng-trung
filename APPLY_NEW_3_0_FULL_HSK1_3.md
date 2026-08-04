# Áp dụng New 3.0 đầy đủ HSK 1–3

## Điều kiện nền

Gói này áp dụng trên repo hiện tại đã có New 3.0 HSK 1 Bài 1 và các cải tiến Thẻ/Nghe đến bản mobile UI v7.

## Ghi đè

1. Sao lưu repo hoặc bảo đảm thay đổi hiện tại đã commit.
2. Giải nén ZIP patch.
3. Chép toàn bộ nội dung trong ZIP vào gốc repo:

```text
D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web
```

4. Chọn **Replace the files in the destination**.
5. Không xóa `localStorage` hoặc `IndexedDB`.

## Chạy local

```powershell
cd "D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web"
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/modules/new-hsk-course/index.html?level=1&lesson=1&view=book
```

Nhấn `Ctrl + F5` một lần.

## Kiểm tra tự động

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-new-hsk-course-full-local.ps1
```

## Kiểm tra nhanh bằng giao diện

- New 3.0 hiển thị HSK 1 đủ 15 bài, HSK 2 đủ 15 bài, HSK 3 đủ 18 bài.
- Mỗi bài mở được Bài học, Nội dung và Luyện tập.
- Nút audio hội thoại/từ mới/bài đọc phát MP3 sách.
- Thẻ → HSK & Giáo trình → New 3.0 hiển thị đủ ba cấp.
- Nghe → New 3.0 hiển thị HSK 1–3 và đủ 48 bài.
- Chuyển bài bằng nút trước/sau và danh sách bài không tải lại toàn trang.

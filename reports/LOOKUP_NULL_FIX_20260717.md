# Sửa lỗi Tra sau khi chuyển breadcrumb lên header

## Lỗi tái hiện

Sau khi nhập `你好`, Tra hiển thị:

```text
Cannot set properties of null (setting 'href')
```

Nguyên nhân: giao diện chung đã thay thanh điều hướng cũ, nhưng `modules/lookup/app.js` vẫn gán `href` trực tiếp cho hai liên kết cũ `#strokeNavLink` và `#menuStrokeLink`. Hai phần tử không còn tồn tại nên JavaScript dừng khi dựng kết quả.

## Thay đổi

- Chỉ cập nhật liên kết Bút thuận khi phần tử thực sự tồn tại.
- Giữ nút `Mở Bút thuận` trong kết quả hoạt động bình thường.
- Đưa breadcrumb động của Tra lên header chung.
- Đánh dấu breadcrumb cũ để app shell loại khỏi phần nội dung.
- Tăng phiên bản `modules/lookup/app.js` để tránh cache cũ.

## List test thủ công

1. Mở `Tra` từ bottom nav.
2. Nhập `你好` và bấm `Tra`.
3. Không được xuất hiện lỗi `Cannot set properties of null`.
4. Kết quả `你好` phải hiển thị đầy đủ.
5. Header hiển thị `中 → Tra → 你好`.
6. Không còn dòng breadcrumb thứ hai dưới header.
7. Bấm `中`, phải về Trang chủ.
8. Bấm `Tra` trên header, phải về màn chính của Tra.
9. Mở một chữ hoặc từ liên quan; breadcrumb phải thêm cấp gần nhất.
10. Kéo ngang breadcrumb trên mobile để xem các cấp trước.
11. Bấm `Mở Bút thuận`, phải mở đúng chữ trong `Học → Bút thuận`.
12. Tra tiếp `河`, `学习`, `ni hao`, `ni3 hao3`.
13. Bấm Back/Forward và xác nhận kết quả cùng breadcrumb cập nhật đúng.
14. Kiểm tra nhanh Trang chủ, Học, Giáo trình, Bộ thủ, Thẻ và Pinyin không thay đổi.

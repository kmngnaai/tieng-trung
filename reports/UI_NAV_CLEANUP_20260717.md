# Patch dọn điều hướng Học và nội dung 301

Ngày: 2026-07-17

## Phạm vi sửa

### 1. Bỏ tab lặp `学 Tổng quan`

Đã xóa tab `学 Tổng quan` khỏi thanh module trong Học chữ.

Lý do:

- breadcrumb đã thể hiện rõ `Trang chủ → Học → Giáo trình`;
- bấm `Học` trên breadcrumb hoặc điều hướng chính đã quay về màn tổng quan Học;
- tab `Tổng quan` lặp chức năng và chiếm chiều ngang trên mobile.

Các tab còn lại giữ nguyên:

- Bút thuận;
- Giáo trình;
- Bộ thủ;
- Thẻ được tạo bởi JavaScript như hiện tại.

### 2. Bỏ dòng hướng dẫn ở 301

Đã xóa câu:

`Chọn một bài để xem từ vựng, câu mẫu, hội thoại, chú thích và nội dung liên quan.`

Danh sách 301 bây giờ bắt đầu trực tiếp từ Bài 1. Không thay đổi:

- danh sách 40 bài;
- nội dung từng bài;
- route mở bài;
- chương trình mặc định và khả năng nhớ chương trình gần nhất.

### 3. Dọn CSS không còn dùng

Đã xóa selector `.hsk-dialogue301-note` vì phần tử tương ứng không còn được render.

### 4. Cache bust

Đã đổi version của `modules/hanzi-stroke/style.css` và `app.js` sang `20260717-navclean1` để trình duyệt không giữ file cũ.

## List test thủ công

### A. Màn Học

1. Mở `Học` từ bottom nav.
2. Xác nhận màn Học vẫn hiện `CHỌN NỘI DUNG` và 5 card.
3. Xác nhận không có tab `学 Tổng quan`.
4. Bấm Giáo trình, Bộ thủ, Bút thuận và Thẻ để kiểm tra từng mục vẫn mở được.

### B. Giáo trình

1. Mở `Học → Giáo trình`.
2. Breadcrumb phải hiện `Trang chủ → Học → Giáo trình`.
3. Thanh module không còn `学 Tổng quan`.
4. Bấm chữ `Học` trên breadcrumb phải quay về màn chọn nội dung.
5. Nút Back của trình duyệt/điện thoại phải quay về cấp trước.

### C. 301 Đàm thoại

1. Trong Giáo trình, chọn 301.
2. Danh sách phải bắt đầu trực tiếp bằng Bài 1.
3. Không còn câu hướng dẫn dài phía trên danh sách.
4. Xác nhận vẫn đủ 40 bài.
5. Mở Bài 1, sau đó quay lại bằng Back.
6. Reload và xác nhận 301 vẫn được nhớ nếu là chương trình mở gần nhất.

### D. Hồi quy nhanh

1. HSK 6 cấp mở được.
2. HSK 9 cấp mở được.
3. YCT và Boya mở được.
4. Bộ thủ 214 mở được.
5. Thẻ mở được và dữ liệu cũ không mất.
6. Bút thuận mở được.
7. Tra C1.2 vẫn là mục Tra toàn cục, không quay về Bút thuận.
8. Mobile vẫn có `Trang chủ | Tra | Học | Menu`.
9. Desktop vẫn dùng header navigation và không có bottom nav cố định.

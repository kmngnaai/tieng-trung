# Prototype Tra C1.2.3

## Cấu trúc điều hướng đã chốt

Thanh điều hướng toàn app:

`Trang chủ | Tra | Học | 301 | Menu`

Tab chức năng bên trong **Học**:

`Bút thuận | HSK | Bộ thủ | Thẻ`

Lưu ý: prototype này chỉ là màn hình **Tra** độc lập. Phần đổi tab đầu bên trong module Học từ `Tra` thành `Bút thuận` sẽ được áp dụng khi tích hợp vào app chính, không giả lập trong prototype Tra.

## Phần Cách viết trong Tra

- Ô luyện gọn 158–184 px, có lưới chữ.
- Giữ bốn thao tác: Phát nét, Luyện viết, Không viền, Viết lại.
- Nút `Mở đầy đủ trong Học` chuyển chữ đang chọn sang module Học.
- Trong module Học, chữ sẽ mở tại tab `Bút thuận`.

## Vị trí

Giải nén vào:

`modules/hanzi-stroke/prototypes/lookup-c1-2/`

## Chạy thử

Tại thư mục gốc repo:

```powershell
python -m http.server 8000
```

Mở:

`http://localhost:8000/modules/hanzi-stroke/prototypes/lookup-c1-2/`

## Test

- Tra `休`, `住`, `清`.
- Kiểm tra bốn nút luyện cơ bản.
- Bấm `Mở đầy đủ trong Học`.
- Bấm năm mục điều hướng và Menu.
- Kiểm tra ở 360, 390 và 430 px.

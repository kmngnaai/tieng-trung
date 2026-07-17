# Sửa lỗi Bộ thủ không thoát khỏi trạng thái Đang tải

## Nguyên nhân chính xác

Dữ liệu không phải nguyên nhân. Ảnh Network cho thấy trang `index.html?study=radicals` trả 200 nhưng không có request `radical_catalog.json`.

Trong `modules/hanzi-stroke/app.js`, hàm `restoreHskRouteFromLocation()` được khai báo bên trong IIFE chính của module HSK. Tuy nhiên listener sau lại bị đặt nhầm sang IIFE độc lập `initLearningLongPressCopy`:

```js
window.addEventListener('popstate', restoreHskRouteFromLocation);
```

IIFE `initLearningLongPressCopy` không nhìn thấy hàm nằm trong scope IIFE HSK, nên trình duyệt phát sinh:

```text
ReferenceError: restoreHskRouteFromLocation is not defined
```

Lỗi xảy ra ngay trước IIFE `initRadicalLearningTab`. JavaScript dừng tại đó, khiến:

- `window.HanziRadicals` không được tạo;
- `loadRadicals()` không được đăng ký;
- không có request `radical_catalog.json`;
- giao diện giữ nguyên `Đang tải...` vô thời hạn.

## Cách sửa

- Chuyển listener `popstate` về đúng IIFE HSK, trước khi IIFE này đóng.
- Xóa listener tham chiếu sai khỏi IIFE long-press.
- Tăng cache version của `modules/hanzi-stroke/app.js` thành `20260717-radicalscope1`.
- Thêm test hồi quy kiểm tra listener chỉ xuất hiện một lần và nằm trước IIFE long-press/radical.

## Kết quả runtime

Chromium runtime harness sử dụng chính `app.js` đã sửa và JSON thật:

- `window.HanziRadicals`: có;
- `isLoaded()`: `true`;
- số card render: `214`;
- trạng thái: `Tất cả 214 bộ: 214 bộ thủ.`;
- lỗi runtime: `0`;
- log: `Đã tải catalog nhẹ: 214 mục` và `Hoàn tất 214 bộ`.

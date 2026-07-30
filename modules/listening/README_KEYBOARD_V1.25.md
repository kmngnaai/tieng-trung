# V1.25 - iPhone keyboard focus fix

## Thay đổi

- Focus input ngay trong chính sự kiện `pointerdown`/`touchstart` của vùng nhập.
- Khi người dùng bấm mở chế độ chép chính tả, render và focus được thực hiện trong cùng call stack của cú chạm.
- Không dùng `requestAnimationFrame` cho lần focus cần mở bàn phím.
- Giữ duy nhất input hiện tại, không tạo lại input sau từng chữ.
- Input proxy trên mobile có kích thước thực 28x28px, font 16px và vẫn nằm trong viewport.
- Chạm bất kỳ vị trí nào trong vùng chữ sẽ mở lại bàn phím ngay.

## Giới hạn iOS

Safari không cho trang tự mở bàn phím khi tải trang mà không có thao tác người dùng. Bản này bảo đảm bàn phím mở ngay khi người dùng bấm vào chế độ học hoặc chạm vùng nhập.

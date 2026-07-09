# UI RULES — Tiếng Trung Web

## 1. Mục tiêu giao diện

Giao diện của dự án `tieng-trung` phải đi theo hướng:

- Mobile-first.
- Ấm, sáng, nhẹ.
- Giống app học tập, không giống dashboard doanh nghiệp.
- Tập trung học tiếng Trung cho người Việt.
- Dễ đọc, dễ bấm, ít rối.
- Không làm mất chức năng hiện có.

Trang chủ hiện tại là chuẩn style chính của toàn app.

---

## 2. Tông màu chung

Tông màu phải giữ theo hệ hiện tại:

- Nền kem nhạt.
- Card trắng / trắng ấm.
- Viền be nhẹ.
- Chữ chính xanh đen.
- Chữ phụ xám xanh.
- Màu nhấn cam nhẹ.
- Icon chữ Hán dùng pastel nhẹ.

Không tự ý đổi sang:

- Nâu/vàng đậm.
- Dashboard doanh nghiệp.
- Màu quá tối.
- Màu quá chói.
- Full-width trắng xóa.

---

## 3. Design token

Mọi màu, shadow, radius nên lấy từ `assets/css/theme.css`.

Ưu tiên dùng các biến:

```css
--app-bg
--app-bg-soft
--app-card
--app-card-warm
--app-text
--app-muted
--app-primary
--app-primary-soft
--app-accent
--app-accent-soft
--app-border
--app-border-strong
--app-shadow-soft
--app-shadow
--app-radius-sm
--app-radius
--app-radius-lg
--app-font
--app-font-zh
```

Không viết màu rải rác trong từng module nếu chưa thật cần.

Nếu cần thêm màu mới, thêm vào `theme.css` trước rồi mới dùng.

---

## 4. Layout chung toàn app

Mọi trang/module nên đi theo cấu trúc:

```text
.app-frame
  app-header
  app-main
    module content
  bottom-nav mobile
```

### Mobile

- App width khoảng `430px`.
- Nội dung giống app điện thoại.
- Bottom nav cố định ở dưới.
- Card công cụ có thể dùng 2 cột nếu đủ rộng.
- Không có scroll ngang toàn trang.

### Desktop

- Max width khoảng `1120px`.
- Có thể mở rộng 2–3 cột.
- Vẫn giữ cảm giác app, không biến thành dashboard nặng.
- Không để nội dung kéo full-width quá rộng.

---

## 5. Header

Header chuẩn:

```text
[中] Tiếng Trung                  [search] [menu]
```

Quy tắc:

- Logo nằm bên trái.
- Tên app là `Tiếng Trung`.
- Không dùng subtitle trong brand, ví dụ không dùng `Học gọn mỗi ngày`.
- Không thêm icon nếu chưa có chức năng thật.
- Mobile ưu tiên header gọn.
- Desktop có thể hiện nav ngang gọn.

Desktop nav nếu dùng:

```text
Trang chủ | Pinyin | Bút thuận | 301 Đàm thoại
```

Không dùng link gạch chân kiểu HTML mặc định.

---

## 6. Bottom nav

Bottom nav mobile thống nhất:

```text
Trang chủ | Pinyin | Bút thuận | 301
```

Quy tắc:

- Chỉ hiện trên mobile.
- Fixed ở dưới màn hình.
- Tab hiện tại phải active nhẹ bằng màu cam.
- Nội dung trang phải có padding-bottom đủ lớn để không bị bottom nav che.
- Không thêm quá nhiều tab.

---

## 7. Card

Tất cả card phải có cảm giác cùng hệ:

```css
background: var(--app-card);
border: 1px solid var(--app-border);
border-radius: 18px - 24px;
box-shadow: var(--app-shadow-soft);
```

Quy tắc:

- Card không được giống text list.
- Link card không được gạch chân.
- Toàn bộ card có thể bấm nếu là module có thật.
- Module chưa có thì làm mờ nhẹ, không cần badge.
- Không dùng badge trạng thái như `Đang có`, `Cơ bản`, `Sắp có` trên trang chủ.

Module card chuẩn:

```text
[icon chữ Hán]
Tên module
Mô tả ngắn
›
```

Ví dụ:

```text
写
Bút thuận
Xem nét và luyện viết.
›
```

---

## 8. Typography

### Chữ Việt

- Rõ, dễ đọc.
- Không dùng quá nhiều uppercase.
- Title đậm vừa, không quá to.

### Chữ Hán

- Dùng font Trung Quốc rõ nét.
- Kích thước lớn hơn text thường.
- Không chen chúc.

### Cấp bậc đề xuất

```text
Page title: 26–32px mobile
Section title: 18–22px
Card title: 15–18px
Body text: 13–15px
Muted text: 12–14px
Hanzi lớn: tùy ngữ cảnh, thường 28–42px
```

---

# Rules riêng cho 301 Đàm thoại

## 9. Mục tiêu của 301

301 Đàm thoại là trang học bài, không phải dashboard.

Mục tiêu:

- Mở bài nhanh.
- Xem từ vựng gọn.
- Câu mẫu dễ đọc.
- Hội thoại rõ vai A/B.
- Slide/bảng gốc chỉ là tham khảo.
- Không làm vỡ mobile.

---

## 10. Layout 301 mobile chuẩn

Mobile nên đi theo bố cục:

```text
301 Đàm thoại
Từ vựng · Câu mẫu · Hội thoại · Slide

[Tìm bài học...]

[Bài 1 · 你好] [Bài 2 · 你身体好吗] ...

Bài 1 · 你好

[Tất cả] [Từ vựng] [Câu mẫu] [Hội thoại] [Slide]

1. Từ vựng
你      nǐ      bạn      🔊
好      hǎo     tốt      🔊
我      wǒ      tôi      🔊

2. Câu mẫu
你好！
Nǐ hǎo!
Xin chào!

3. Hội thoại
A: 你好！
B: 你好！

4. Slide gốc
```

Không nên hiện quá nhiều bài dọc trước nội dung vì sẽ đẩy bài học xuống quá xa.

---

## 11. Lesson list

Lesson card phải hiển thị sạch:

```text
Bài 1
第一课 · 你好
```

Không hiển thị rối:

```text
1第一课-你好
1 第一课 - 你好
Bài 1 1第一课...
```

Cần format title:

```text
1第一课-你好 → 第一课 · 你好
```

Active lesson:

- Border cam nhẹ.
- Nền cam rất nhạt.
- Không dùng xanh chói.
- Không dùng nâu đậm.

---

## 12. Tabs 301

Tabs chuẩn:

```text
Tất cả | Từ vựng | Câu mẫu | Hội thoại | Slide
```

Quy tắc:

- Dạng pill.
- Mobile scroll ngang nếu không đủ chỗ.
- Active tab dùng màu cam.
- Không sticky nếu gây che nội dung.

---

## 13. Từ vựng 301

Phương án chốt: dùng compact row list.

```text
1. Từ vựng                         Xem tất cả >

你        nǐ        bạn          🔊
好        hǎo       tốt          🔊
我        wǒ        tôi          🔊
吗        ma        trợ từ       🔊
你们      nǐmen     các bạn      🔊
妈妈      māma      mẹ           🔊
```

Lý do chọn dạng này:

- Gọn hơn grid ô vuông.
- Có đủ nghĩa tiếng Việt.
- Dễ thêm nút nghe.
- Dễ đọc trên mobile.
- Ít chiếm chiều cao.

Quy tắc:

- Không dùng bảng HTML thô cho từ vựng chính.
- Không dùng grid 6 ô quá to nếu có nghĩa tiếng Việt.
- Mỗi dòng gồm: Hanzi | Pinyin | Nghĩa | Audio.
- Nếu chưa có audio thật thì icon loa có thể disabled hoặc ẩn.

Kích thước đề xuất:

```text
Row height: 56–64px
Hanzi: 28–32px
Pinyin: 15–16px
Nghĩa: 14–15px
Audio button: 32–36px
```

---

## 14. Câu mẫu 301

Không dùng bảng lớn trên mobile.

Dùng list/card:

```text
2. Câu mẫu

1
你好！
Nǐ hǎo!
Xin chào!

2
你好吗？
Nǐ hǎo ma?
Bạn khỏe không?
```

Desktop có thể dùng table nhẹ, nhưng mobile phải dễ đọc theo list.

---

## 15. Hội thoại 301

Hiển thị rõ vai:

```text
A:
你好！
Nǐ hǎo!
Xin chào!

B:
你好！
Nǐ hǎo!
Xin chào!
```

Quy tắc:

- Vai A/B rõ.
- Có thể dùng màu cam cho `A:` và `B:`.
- Không nhồi hội thoại vào bảng.

---

## 16. Slide / bảng gốc

Slide và bảng gốc chỉ là tham khảo.

Quy tắc:

- Luôn nằm dưới cùng.
- Có tiêu đề `Slide gốc` hoặc `Bảng gốc`.
- Bảng phải nằm trong wrapper `overflow-x:auto`.
- Không làm body tràn ngang.
- Không ưu tiên hơn Từ vựng / Câu mẫu / Hội thoại.

---

# Rules riêng cho các module khác

## 17. Bút thuận

Bút thuận là module tra chữ + luyện viết.

Ưu tiên layout:

```text
Ô nhập chữ
Preview chữ / nét
Nút chính: Phát nét | Luyện viết | Thứ tự nét
Dictionary panel
Giải thích bằng AI
Cài đặt nâng cao
```

Quy tắc:

- Preview chữ/nét là trung tâm.
- Cài đặt nâng cao cho vào accordion/collapse.
- Không để quá nhiều control kỹ thuật ở đầu trang.
- Dictionary là dữ liệu chính.
- AI explanation chỉ là tham khảo.

---

## 18. Pinyin

Pinyin nên theo flow học:

```text
Học | Nghe | Bảng | Quiz | Ôn
```

Quy tắc:

- Tab dùng pill style.
- Bảng rộng phải `overflow-x:auto`.
- Nút nghe/audio đồng bộ style.
- Không đổi localStorage key nếu chỉ sửa UI.

---

## 19. Bộ thủ 50

Bộ thủ nên dễ học trên mobile.

Quy tắc:

- Giảm quá nhiều tab nếu làm rối.
- Card bộ thủ gồm chữ lớn, Hán Việt, pinyin, nghĩa ngắn.
- Yêu thích / Đã học dùng icon nhỏ.
- Không làm bảng quá rộng trên mobile.

---

# Quy tắc kỹ thuật khi sửa UI

## 20. Không làm ảnh hưởng chức năng

Khi chỉ sửa giao diện:

- Không đổi JSON.
- Không đổi localStorage key.
- Không đổi route nếu không cần.
- Không đổi logic audio.
- Không đổi cấu trúc dữ liệu bài học.
- Không sửa Pinyin/Hanzi Stroke nếu task chỉ là 301.

---

## 21. Commit nhỏ

Mỗi lần chỉ nên sửa một mảng:

```text
Commit 1: homepage polish
Commit 2: dialogue 301 layout
Commit 3: hanzi stroke polish
Commit 4: pinyin polish
Commit 5: bo thu polish
```

Không gộp quá nhiều module vào một commit.

---

## 22. Checklist trước khi commit UI

```text
[ ] Mobile 360px không tràn ngang.
[ ] Mobile 430px nhìn ổn.
[ ] Desktop không full-width xấu.
[ ] Bottom nav không che nội dung.
[ ] Card không bị gạch chân link.
[ ] Bảng rộng có overflow-x:auto.
[ ] Chức năng cũ vẫn chạy.
[ ] node --check app.js pass nếu có sửa JS.
[ ] Không add nhầm file zip/data chưa cần.
```

---

## 23. Hướng ưu tiên hiện tại

Thứ tự cải tiến đề xuất:

```text
1. Hoàn thiện 301 Đàm thoại.
2. Polish Bút thuận thành tra chữ + luyện viết.
3. Đồng bộ Pinyin với app shell.
4. Đồng bộ Bộ thủ 50.
5. Sau đó mới thêm AI Gemini / SRS / chức năng mới.
```

---

## 24. AI Explanation

AI explanation chỉ là phần tham khảo.

Quy tắc:

- Không thay thế dữ liệu từ điển chính.
- Không gọi Gemini trực tiếp từ frontend nếu dùng API key thật.
- Nếu dùng Gemini, phải qua proxy/serverless để không lộ key.
- Luôn có cảnh báo: nội dung AI có thể không chính xác, chỉ để tham khảo.
- Giữ nút `Copy prompt` và `Tạo lại` nếu có.


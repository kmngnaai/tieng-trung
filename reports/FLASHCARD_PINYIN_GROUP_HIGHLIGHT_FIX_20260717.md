# Flashcard Pinyin — sửa tô đúng nhóm chữ Hán

## Nguyên nhân

Logic trước dùng `currentIndex` của nhóm pinyin làm chỉ số trực tiếp của chữ Hán. Điều này chỉ đúng khi mỗi nhóm pinyin tương ứng đúng một chữ.

Ví dụ:

- `学生` có dữ liệu pinyin `xuésheng`
- `我们` có dữ liệu pinyin `wǒmen`
- `学校` có dữ liệu pinyin `xuéxiào`

Mỗi cụm trên là một mục nhập, nhưng lại tương ứng hai chữ Hán. Vì vậy mã cũ tô nhầm một chữ đứng trước hoặc chỉ tô một nửa cụm.

## Cách sửa

- Bổ sung danh sách 409 âm tiết Pinyin chuẩn từ dữ liệu local của dự án.
- Tách nội bộ mỗi cụm pinyin liền thành số âm tiết thực tế.
- Tạo `answerTokenHanCounts` để biết mỗi nhóm pinyin phủ bao nhiêu chữ Hán.
- Tính vị trí bắt đầu và kết thúc của nhóm đang nhập trước khi tô nền.
- Giữ nguyên cách nhập hiện tại: người dùng vẫn nhập cả cụm liền như `xuesheng`.

## Kết quả mong đợi

- `wǒmen` → tô cùng lúc `我们`
- `xǐhuan` → tô cùng lúc `喜欢`
- `jīntiān` → tô cùng lúc `今天`
- `xuésheng` → tô cùng lúc `学生`
- `xuéxiào` → tô cùng lúc `学校`
- `diànshì` → tô cùng lúc `电视`

## Xử lý sai vẫn giữ

Ví dụ đang nhập `xuesheng`:

- nhập đúng `xuesh` → giữ nguyên
- nhập sai ký tự tiếp theo → ký tự sai bị loại bỏ, phần đúng trước đó vẫn còn
- ô nhập đỏ ngắn rồi cho nhập tiếp

## Cache

`index.html` đã đổi cache version thành:

`20260717-pinyingroup1`

# Tiếng Trung Web V1

## Mục tiêu

- Nâng `bo-thu-50` thành một module trong web Tiếng Trung lớn hơn.
- Tạo module Pinyin mới theo style đồng bộ hơn.
- Copy audio Kimma sang `modules/pinyin/audio`.
- Tạo `audio_manifest.json`.
- Tạo `radical_audio.json` để đọc tên 50 bộ thủ.

## Local test

```powershell
cd "D:\01.AutobyNgan\00.Build.App\12.Obsidian\Tieng-Trung\tieng-trung-web"
python -m http.server 8000
```

Mở:

```text
http://localhost:8000/
```

## Ghi chú

- File Pinyin HTML cũ được giữ trong `modules/pinyin/source-reference` để tham khảo.
- Giao diện Pinyin mới chưa bê toàn bộ 18 bảng/quy tắc, đây là V1 để kiểm tra kiến trúc và audio dùng chung.

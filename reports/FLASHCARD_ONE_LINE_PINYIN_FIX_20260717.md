# Flashcard Gõ Pinyin — giữ chữ Hán một dòng

## Nguyên nhân
CSS trước đó đặt mỗi chữ Hán thành một ô riêng với `gap`, `padding`, `min-width` và `flex-wrap: wrap`. Vì vậy câu dài bị giãn và xuống dòng.

## Đã sửa
- `flex-wrap: nowrap`
- `white-space: nowrap`
- bỏ `gap` giữa các chữ
- bỏ `min-width` dư thừa
- giảm padding từng chữ
- bỏ nền riêng của chữ đã hoàn thành để câu không bị chia thành nhiều ô
- giữ nền chỉ cho chữ đang nhập
- thêm `fitFlashcardTypingPromptHanzi()` để đo chiều rộng thật và giảm font đến khi vừa một dòng
- dùng font Trung hệ thống: PingFang SC / Microsoft YaHei / Noto Sans SC / Source Han Sans SC
- đổi cache sang `20260717-pinyinfit1`

## Logic gõ từng chữ vẫn giữ nguyên
- 每个汉字对应一个拼音音节
- `学生` → 学/xue → 生/sheng
- `我们都是学生` → 我/wo → 们/men → 都/dou → 是/shi → 学/xue → 生/sheng

## Kết quả test
- JavaScript syntax: đạt
- UI regression: 56/56 đạt

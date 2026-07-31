# Listening Dataset Schema V1

Đây là schema duy nhất mà tab **Nghe** sử dụng sau khi dữ liệu nguồn đi qua adapter.
UI và activity builders không được đọc trực tiếp cấu trúc riêng của New HSK, 301, LDSN14, HSK 6 cấp, YCT hoặc Boya.

## Dataset

```js
{
  schemaVersion: 1,
  source: {
    id,
    curriculum,
    levelId,
    levelName
  },
  unit: {
    id,
    sectionType,
    sectionOrder,
    title,
    titleZh,
    status
  },
  words: [],
  sentences: [],
  grammar: [],
  groups: [],
  capabilities: {},
  diagnostics: [],
  stats: {},
  rules: {}
}
```

Không lưu thêm `dialogues` hoặc `passages` ở cấp dataset. Hai danh sách này là view dẫn xuất từ `groups`:

```js
const dialogues = dataset.groups.filter(group => group.kind === 'dialogue');
const passages = dataset.groups.filter(group => group.kind === 'passage');
```

Quy tắc này tránh hai bản dữ liệu bị lệch nhau.

## Word

```js
{
  id,
  text,
  pinyin,
  meaning,
  wordType,
  sourceId,
  lessonId,
  origin: { file, path, routeId }
}
```

Không đưa URL audio nguồn vào Word. Audio luôn được tìm bằng `canonicalItemId`: MP3 người dùng nhập trước, sau đó TTS thiết bị.

## Sentence

```js
{
  id,
  text,
  pinyin,
  meaning,
  tokens: [{ text }],
  sentenceType,
  originType: 'source' | 'curated' | 'authored',
  origin: { file, path, routeId },
  grammarId,
  alsoGrammarExample
}
```

`tokens` khi ghép lại phải bằng đáp án chữ Hán sau khi bỏ dấu câu theo `Core.answerUnits()`.

## Group

```js
{
  id,
  kind: 'dialogue' | 'passage',
  title,
  originType,
  sourceId,
  lessonId,
  items: [
    {
      id,
      canonicalSentenceId,
      text,
      pinyin,
      meaning,
      tokens,
      speaker,
      groupIndex
    }
  ]
}
```

- `dialogue`: giữ speaker và thứ tự lượt thoại.
- `passage`: giữ thứ tự câu.
- Mỗi group có ít nhất 2 items.
- Mỗi item phải có `canonicalSentenceId` để dùng chung MP3, lịch sử và câu cần ôn.

## Capabilities

UI chỉ hiển thị hoạt động có capability tương ứng bằng `true`.

```js
{
  wordChoice,
  wordTyping,
  sentenceDictation,
  sentenceTranscript,
  sentenceOrdering,
  dialogueTurnOrdering,
  dialogueSentenceOrdering,
  dialogueDictation,
  dialogueFullDictation,
  passageSentenceOrdering,
  passageSentenceTokenOrdering,
  passageDictation,
  passageFullDictation
}
```

## Activity item

Activity builders chỉ nhận dataset/group chuẩn và trả item có:

```js
{
  id,
  canonicalItemId,
  activityType,
  text,
  pinyin,
  meaning
}
```

Tùy hoạt động có thêm `choices`, `tokens`, `shuffledTokens`, `cards`, `shuffledCards`, `groupContext`, `segments`.

## Quy tắc phiên học

- `id`: định danh của activity item.
- `canonicalItemId`: định danh nội dung gốc dùng chung giữa các hoạt động.
- Thứ tự đã xáo phải được tạo xác định và lưu khi reload.
- Không tạo activity xếp từ nếu dưới 3 token.
- Chép từng câu/lượt và chép nguyên group là hai activity khác nhau.

## Validation

`SourceAdapters.validateDataset(dataset)` phải chạy trước khi đưa dataset vào UI. Dataset không hợp lệ không được mở phiên học.

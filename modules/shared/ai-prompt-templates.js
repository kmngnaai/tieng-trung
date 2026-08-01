(() => {
  'use strict';

  const TYPE_META = Object.freeze({
    vocabulary: {
      label: 'Từ vựng',
      icon: '词',
      inputLabel: 'Danh sách từ hoặc chủ đề nguồn',
      inputPlaceholder: 'Ví dụ:\n你好\n认识\n名字\nhoặc: Chủ đề giới thiệu bản thân',
      countLabel: 'Số từ cần tạo'
    },
    sentence: {
      label: 'Câu',
      icon: '句',
      inputLabel: 'Từ vựng/mẫu câu bắt buộc',
      inputPlaceholder: 'Mỗi từ hoặc mẫu một dòng. AI phải dùng các mục này để tạo câu.',
      countLabel: 'Số câu cần tạo'
    },
    grammar: {
      label: 'Ngữ pháp',
      icon: '法',
      inputLabel: 'Mẫu ngữ pháp hoặc chủ đề',
      inputPlaceholder: 'Ví dụ:\nS + 是 + N\n也\n吗\nHoặc chỉ nhập chủ đề để AI tự chọn tối đa N mẫu.',
      countLabel: 'Số ví dụ cho mỗi mẫu'
    },
    dialogue: {
      label: 'Hội thoại',
      icon: '话',
      inputLabel: 'Từ khóa và nội dung bắt buộc',
      inputPlaceholder: 'Ví dụ: giới thiệu tên, hỏi quốc tịch, dùng 认识 và 高兴',
      countLabel: 'Số lượt thoại'
    },
    passage: {
      label: 'Đoạn văn',
      icon: '段',
      inputLabel: 'Từ khóa và ý bắt buộc',
      inputPlaceholder: 'Ví dụ: giới thiệu bản thân, gia đình, nơi học; mỗi từ khóa một dòng.',
      countLabel: 'Số câu trong đoạn'
    }
  });

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  function sourceMode(fields) {
    const input = clean(fields.inputText);
    if (!input) return 'none';
    const lines = input.split(/\r?\n/).map(clean).filter(Boolean);
    const looksLikeGrammar = lines.some(line => /[+＝=]|\bS\b|\bV\b|\bN\b|主语|谓语|宾语|\.{3}|…/i.test(line));
    return looksLikeGrammar ? 'patterns' : 'list';
  }

  function baseRules(fields) {
    const level = clean(fields.level) || 'HSK 1';
    const topic = clean(fields.topic) || 'giao tiếp hằng ngày';
    const extra = clean(fields.requirements);
    return [
      `Trình độ mục tiêu do người dùng khai báo: ${level}.`,
      `Chủ đề: ${topic}.`,
      'Chỉ dùng tiếng Trung phù hợp trình độ và dữ liệu nguồn; tránh từ khó không cần thiết.',
      'Không tự khẳng định một từ hoặc cấu trúc thuộc đúng cấp HSK nếu không chắc chắn; khi chưa chắc, thêm cảnh báo vào quality_notes.',
      'Nếu người dùng cung cấp danh sách từ, chỉ dùng các từ đó làm dữ liệu chính và phải giữ nguyên chữ Hán.',
      'Chỉ khi thật sự cần để câu tự nhiên mới dùng từ ngoài danh sách; mọi từ ngoài phải được liệt kê trong extra_words, không được giấu.',
      'Pinyin phải có dấu thanh, tách âm tiết rõ ràng; không dùng số thanh.',
      'Nghĩa tiếng Việt tự nhiên, ngắn gọn và đúng ngữ cảnh.',
      'ID phải ổn định, dùng chữ thường không dấu, số, dấu gạch ngang hoặc gạch dưới; không trùng trong cùng kết quả.',
      extra ? `Yêu cầu bổ sung: ${extra}` : ''
    ].filter(Boolean);
  }

  function commonWrapper(type) {
    return [
      'Trả về đúng một đối tượng JSON thuần, không đặt trong Markdown và không giải thích ngoài JSON.',
      `Đối tượng gốc phải có: format="tieng-trung-ai-result-v1", type="${type}", level, topic, extra_words, quality_notes, items.`,
      'extra_words là mảng các đối tượng {hanzi, pinyin, meaning, reason}; để [] nếu không dùng từ ngoài nguồn.',
      'quality_notes là mảng chuỗi; để [] nếu không có cảnh báo.',
      'items là mảng dữ liệu chính.'
    ];
  }

  function tokenRules() {
    return [
      'tokens phải là mảng từ hoặc cụm ngữ pháp tự nhiên theo đúng thứ tự câu.',
      'Không gộp cả một chủ ngữ dài hoặc gần như cả câu thành một token chỉ để giảm số token.',
      'Không tách một từ hai âm tiết thành hai token.',
      'Khi bỏ dấu câu và khoảng trắng, ghép tokens phải khớp nội dung hanzi.'
    ];
  }

  function outputContract(type) {
    if (type === 'vocabulary') {
      return commonWrapper(type).concat([
        'Mỗi phần tử items có đúng các trường: id, hanzi, pinyin, meaning, word_type, tags.',
        'tags là mảng chuỗi.'
      ]);
    }
    if (type === 'sentence') {
      return commonWrapper(type).concat([
        'Mỗi phần tử items có đúng các trường: id, hanzi, pinyin, meaning, tokens, tags, source_word_ids, grammar_ids.',
        'source_word_ids và grammar_ids là mảng ID tham chiếu; để [] nếu không có.',
        ...tokenRules(),
        'Không tạo hai câu trùng nội dung.'
      ]);
    }
    if (type === 'grammar') {
      return commonWrapper(type).concat([
        'Mỗi phần tử items có đúng các trường: id, topic, pattern, explanation, tips, attentions, examples.',
        'examples là mảng; mỗi ví dụ gồm id, hanzi, pinyin, meaning, tokens, source_word_ids, grammar_ids.',
        'grammar_ids của mỗi ví dụ phải chứa ID mẫu ngữ pháp hiện tại.',
        ...tokenRules(),
        'Giải thích bằng tiếng Việt, súc tích và dễ học.'
      ]);
    }
    if (type === 'dialogue') {
      return commonWrapper(type).concat([
        'items phải chứa đúng một đối tượng hội thoại có các trường: id, title, kind="dialogue", items.',
        'Mỗi lượt trong items của hội thoại gồm id, order, speaker, hanzi, pinyin, meaning, tokens, source_word_ids, grammar_ids.',
        'source_word_ids và grammar_ids là mảng ID tham chiếu; để [] nếu không có.',
        ...tokenRules(),
        'Lượt thoại phải liên kết tự nhiên, không phải các câu rời ghép lại.'
      ]);
    }
    return commonWrapper(type).concat([
      'items phải chứa đúng một đối tượng đoạn văn có các trường: id, title, kind="passage", items.',
      'Mỗi câu trong items của đoạn gồm id, order, hanzi, pinyin, meaning, tokens, source_word_ids, grammar_ids.',
      'source_word_ids và grammar_ids là mảng ID tham chiếu; để [] nếu không có.',
      ...tokenRules(),
      'Các câu phải tạo thành một đoạn văn mạch lạc, không phải danh sách câu rời.'
    ]);
  }

  function taskLines(type, fields) {
    const count = number(fields.count, type === 'grammar' ? 3 : 10);
    const input = clean(fields.inputText);
    const sourceBlock = input ? `\nDữ liệu đầu vào bắt buộc:\n${input}` : '\nKhông có danh sách bắt buộc; tự chọn nội dung đúng chủ đề và ghi rõ trong quality_notes nếu cấp độ chưa chắc chắn.';
    if (type === 'vocabulary') {
      return [
        `Hãy tạo hoặc chuẩn hóa ${count} mục từ vựng tiếng Trung.`,
        'Nếu đầu vào đã có từ, phải giữ đúng chữ Hán và chỉ bổ sung dữ liệu còn thiếu.',
        'Nếu đầu vào chỉ là chủ đề, chọn các từ hữu ích nhất và không tuyên bố chắc cấp HSK khi không có nguồn kiểm chứng.',
        sourceBlock
      ];
    }
    if (type === 'sentence') {
      return [
        `Hãy tạo ${count} câu tiếng Trung mới để luyện thẻ và luyện nghe.`,
        'Mỗi từ hoặc mẫu bắt buộc cần xuất hiện hợp lý; không lặp lại một cấu trúc quá nhiều.',
        'Câu phải độc lập, tự nhiên, đủ ngắn để học trên điện thoại và có thể đọc bằng TTS.',
        'Gắn source_word_ids và grammar_ids để chỉ rõ dữ liệu nguồn đã dùng trong từng câu.',
        sourceBlock
      ];
    }
    if (type === 'grammar') {
      const mode = sourceMode(fields);
      return [
        mode === 'patterns'
          ? 'Đầu vào có mẫu ngữ pháp: chỉ phân tích các mẫu được cung cấp, không tự tạo thêm mẫu ngoài danh sách.'
          : `Đầu vào chỉ là chủ đề hoặc chưa có mẫu rõ ràng: tự chọn tối đa ${Math.max(1, Math.min(5, number(fields.grammarPatternCount, 3)))} mẫu phù hợp nhất với chủ đề và trình độ.`,
        `Mỗi mẫu tạo ${count} ví dụ khác nhau.`,
        'Nêu rõ mẫu, cách dùng, mẹo nhớ, lỗi thường gặp và ví dụ.',
        'Mỗi ví dụ phải tham chiếu grammar_ids và source_word_ids khi có.',
        sourceBlock
      ];
    }
    if (type === 'dialogue') {
      return [
        `Hãy viết một hội thoại gồm ${count} lượt.`,
        'Dùng 2–3 nhân vật; tên người nói phải nhất quán.',
        'Mỗi lượt ngắn gọn, phản hồi hợp logic với lượt trước và phù hợp màn hình điện thoại.',
        'Mỗi lượt phải có source_word_ids hoặc grammar_ids nếu đã dùng dữ liệu nguồn.',
        sourceBlock
      ];
    }
    return [
      `Hãy viết một đoạn văn gồm khoảng ${count} câu.`,
      'Đoạn có mở đầu, triển khai và kết thúc ngắn; các câu liên kết tự nhiên.',
      'Không chuyển thành hội thoại; mỗi câu đủ ngắn để luyện nghe và chép trên điện thoại.',
      'Mỗi câu phải có source_word_ids hoặc grammar_ids nếu đã dùng dữ liệu nguồn.',
      sourceBlock
    ];
  }

  function build(type, fields = {}) {
    const normalizedType = TYPE_META[type] ? type : 'vocabulary';
    const meta = TYPE_META[normalizedType];
    return [
      `Bạn là biên tập viên dữ liệu học tiếng Trung. Nhiệm vụ: tạo nội dung loại “${meta.label}” để nhập vào ứng dụng học.`,
      '',
      'YÊU CẦU NỘI DUNG',
      ...baseRules(fields).map(line => `- ${line}`),
      '',
      'NHIỆM VỤ',
      ...taskLines(normalizedType, fields).map(line => line.startsWith('\n') ? line : `- ${line}`),
      '',
      'ĐỊNH DẠNG ĐẦU RA',
      ...outputContract(normalizedType).map(line => `- ${line}`),
      '',
      'Chỉ trả về dữ liệu theo hợp đồng trên. Không giải thích thêm.'
    ].join('\n');
  }

  window.TiengTrungAiPromptTemplates = Object.freeze({ TYPE_META, build });
})();

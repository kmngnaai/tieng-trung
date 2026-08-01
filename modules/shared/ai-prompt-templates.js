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
      inputLabel: 'Mẫu ngữ pháp cần giải thích',
      inputPlaceholder: 'Ví dụ:\nS + 是 + N\n也\n吗\nMỗi mẫu một dòng.',
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

  function baseRules(fields) {
    const level = clean(fields.level) || 'HSK 1';
    const topic = clean(fields.topic) || 'giao tiếp hằng ngày';
    const extra = clean(fields.requirements);
    return [
      `Trình độ mục tiêu: ${level}.`,
      `Chủ đề: ${topic}.`,
      'Chỉ dùng tiếng Trung phù hợp trình độ; tránh từ khó không cần thiết.',
      'Không thêm thông tin ngoài yêu cầu nếu không cần cho tính tự nhiên.',
      'Pinyin phải có dấu thanh, tách âm tiết rõ ràng.',
      'Nghĩa tiếng Việt tự nhiên, ngắn gọn và đúng ngữ cảnh.',
      extra ? `Yêu cầu bổ sung: ${extra}` : ''
    ].filter(Boolean);
  }

  function outputContract(type) {
    if (type === 'vocabulary') {
      return [
        'Trả kết quả dưới dạng JSON thuần, không đặt trong Markdown.',
        'Mỗi phần tử có đúng các trường: id, hanzi, pinyin, meaning, word_type, tags.',
        'id dùng chữ thường không dấu hoặc số, không trùng.',
        'tags là mảng chuỗi.'
      ];
    }
    if (type === 'sentence') {
      return [
        'Trả kết quả dưới dạng JSON thuần, không đặt trong Markdown.',
        'Mỗi phần tử có đúng các trường: id, hanzi, pinyin, meaning, tokens, tags.',
        'tokens là mảng các cụm từ theo đúng thứ tự câu, tối thiểu 3 cụm khi câu đủ dài.',
        'Không tạo hai câu trùng nội dung.'
      ];
    }
    if (type === 'grammar') {
      return [
        'Trả kết quả dưới dạng JSON thuần, không đặt trong Markdown.',
        'Mỗi mục có đúng các trường: id, topic, pattern, explanation, tips, attentions, examples.',
        'examples là mảng; mỗi ví dụ gồm hanzi, pinyin, meaning.',
        'Giải thích bằng tiếng Việt, súc tích và dễ học.'
      ];
    }
    if (type === 'dialogue') {
      return [
        'Trả kết quả dưới dạng JSON thuần, không đặt trong Markdown.',
        'Kết quả có các trường: id, title, kind="dialogue", items.',
        'Mỗi item gồm id, order, speaker, hanzi, pinyin, meaning, tokens.',
        'Lượt thoại phải liên kết tự nhiên, không phải các câu rời ghép lại.'
      ];
    }
    return [
      'Trả kết quả dưới dạng JSON thuần, không đặt trong Markdown.',
      'Kết quả có các trường: id, title, kind="passage", items.',
      'Mỗi item gồm id, order, hanzi, pinyin, meaning, tokens.',
      'Các câu phải tạo thành một đoạn văn mạch lạc, không phải danh sách câu rời.'
    ];
  }

  function taskLines(type, fields) {
    const count = number(fields.count, type === 'grammar' ? 3 : 10);
    const input = clean(fields.inputText);
    const sourceBlock = input ? `\nDữ liệu đầu vào bắt buộc:\n${input}` : '\nKhông có danh sách bắt buộc; tự chọn nội dung đúng chủ đề.';
    if (type === 'vocabulary') {
      return [
        `Hãy tạo hoặc chuẩn hóa ${count} mục từ vựng tiếng Trung.`,
        'Nếu đầu vào đã có từ, phải giữ đúng chữ Hán và chỉ bổ sung dữ liệu còn thiếu.',
        'Nếu đầu vào là chủ đề, chọn các từ hữu ích nhất cho người học.',
        sourceBlock
      ];
    }
    if (type === 'sentence') {
      return [
        `Hãy tạo ${count} câu tiếng Trung mới để luyện thẻ và luyện nghe.`,
        'Mỗi từ/mẫu bắt buộc cần xuất hiện hợp lý; không lặp lại một cấu trúc quá nhiều.',
        'Câu phải độc lập, tự nhiên và có thể đọc bằng TTS.',
        sourceBlock
      ];
    }
    if (type === 'grammar') {
      return [
        'Hãy phân tích từng mẫu ngữ pháp trong đầu vào.',
        `Mỗi mẫu tạo ${count} ví dụ khác nhau.`,
        'Nêu rõ mẫu, cách dùng, lưu ý sai thường gặp và ví dụ.',
        sourceBlock
      ];
    }
    if (type === 'dialogue') {
      return [
        `Hãy viết một hội thoại gồm ${count} lượt.`,
        'Dùng 2–3 nhân vật; tên người nói phải nhất quán.',
        'Mỗi lượt ngắn gọn, phản hồi hợp logic với lượt trước.',
        sourceBlock
      ];
    }
    return [
      `Hãy viết một đoạn văn gồm khoảng ${count} câu.`,
      'Đoạn có mở đầu, triển khai và kết thúc ngắn; các câu liên kết tự nhiên.',
      'Không chuyển thành hội thoại.',
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

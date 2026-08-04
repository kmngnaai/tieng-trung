(() => {
  'use strict';

  const TYPE_META = Object.freeze({
    package: {
      label: 'Bộ hoàn chỉnh', icon: '全', importable: false,
      inputLabel: 'Nguồn bài học hoặc dữ liệu hiện có',
      inputPlaceholder: 'Dán Markdown, JSON, danh sách từ/câu hoặc nội dung bài học cần chuẩn hóa.',
      countLabel: 'Số mục mục tiêu'
    },
    vocabulary: {
      label: 'Từ vựng', icon: '词', importable: true,
      inputLabel: 'Danh sách từ hoặc chủ đề nguồn',
      inputPlaceholder: 'Ví dụ:\n你好\n认识\n名字\nhoặc: Chủ đề giới thiệu bản thân',
      countLabel: 'Số từ cần tạo'
    },
    sentence: {
      label: 'Câu', icon: '句', importable: true,
      inputLabel: 'Từ vựng/mẫu câu bắt buộc',
      inputPlaceholder: 'Mỗi từ hoặc mẫu một dòng. AI phải dùng các mục này để tạo câu.',
      countLabel: 'Số câu cần tạo'
    },
    grammar: {
      label: 'Ngữ pháp', icon: '法', importable: true,
      inputLabel: 'Mẫu ngữ pháp hoặc chủ đề',
      inputPlaceholder: 'Ví dụ:\nS + 是 + N\n也\n吗\nHoặc chỉ nhập chủ đề để AI tự chọn tối đa N mẫu.',
      countLabel: 'Số ví dụ cho mỗi mẫu'
    },
    dialogue: {
      label: 'Hội thoại', icon: '话', importable: true,
      inputLabel: 'Từ khóa và nội dung bắt buộc',
      inputPlaceholder: 'Ví dụ: giới thiệu tên, hỏi quốc tịch, dùng 认识 và 高兴',
      countLabel: 'Số lượt thoại'
    },
    passage: {
      label: 'Đoạn văn', icon: '段', importable: true,
      inputLabel: 'Từ khóa và ý bắt buộc',
      inputPlaceholder: 'Ví dụ: giới thiệu bản thân, gia đình, nơi học; mỗi từ khóa một dòng.',
      countLabel: 'Số câu trong đoạn'
    },
    character: {
      label: 'Cấu tạo chữ', icon: '构', importable: false,
      inputLabel: 'Danh sách chữ hoặc dữ liệu từ chứa chữ',
      inputPlaceholder: 'Ví dụ:\n你\n好\n们\nCó thể dán JSON từ vựng để AI chỉ bổ sung dữ liệu chữ còn thiếu.',
      countLabel: 'Số chữ cần xử lý'
    },
    practice: {
      label: 'Bài tập', icon: '练', importable: false,
      inputLabel: 'Entity nguồn để tạo bài tập',
      inputPlaceholder: 'Dán từ vựng, câu, hội thoại, đoạn, ngữ pháp và ID nguồn.',
      countLabel: 'Số bài tập cần tạo'
    },
    review: {
      label: 'Kiểm tra dữ liệu', icon: '审', importable: false,
      inputLabel: 'JSON cần kiểm tra và đề xuất patch',
      inputPlaceholder: 'Dán JSON hiện có. AI không được tự sửa âm thầm.',
      countLabel: 'Số lỗi tối đa cần liệt kê'
    }
  });

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
  }
  function bool(value, fallback = false) {
    if (value === true || value === 'true' || value === '1' || value === 'yes') return true;
    if (value === false || value === 'false' || value === '0' || value === 'no') return false;
    return fallback;
  }
  function sourceMode(fields) {
    const input = clean(fields.inputText);
    if (!input) return 'none';
    const lines = input.split(/\r?\n/).map(clean).filter(Boolean);
    return lines.some(line => /[+＝=]|\bS\b|\bV\b|\bN\b|主语|谓语|宾语|\.{3}|…/i.test(line)) ? 'patterns' : 'list';
  }

  function coreRules(fields) {
    const level = clean(fields.level) || 'HSK 1';
    const topic = clean(fields.topic) || 'giao tiếp hằng ngày';
    const maxOut = number(fields.maxOutOfScopeWords, 0);
    const allowedVocabulary = clean(fields.allowedVocabulary);
    const allowedGrammar = clean(fields.allowedGrammar);
    const requiredVocabulary = clean(fields.requiredVocabulary);
    const requiredGrammar = clean(fields.requiredGrammar);
    const requirements = clean(fields.requirements);
    const operation = clean(fields.operation) || 'create';
    return [
      `operation=${operation}: create=tạo mới; enrich=chỉ bổ sung trường còn thiếu; review=kiểm tra và đề xuất patch.`,
      `Trình độ mục tiêu: ${level}.`,
      `Chủ đề/bài: ${topic}.`,
      'Không mặc định tạo hội thoại. Chỉ tạo đúng loại dữ liệu người dùng chọn.',
      'Bảo toàn chữ Hán, pinyin, nghĩa, ID, thứ tự và sourceRefs đã có; không viết lại trường nguồn nếu operation=enrich.',
      'Một entity chỉ có một nguồn chuẩn. Bài tập, thẻ và nghe phải tham chiếu entity bằng ID thay vì sao chép nội dung.',
      'Chỉ dùng tiếng Trung phù hợp trình độ và dữ liệu nguồn; nếu người dùng cung cấp danh sách từ thì chỉ dùng các từ đó làm dữ liệu chính; tránh từ khó không cần thiết.',
      `Số từ ngoài phạm vi tối đa: ${maxOut}. Mọi từ ngoài phải nằm trong validation.outOfScopeWords kèm lý do.`,
      'Pinyin phải có dấu thanh, tách âm tiết rõ; không dùng số thanh.',
      'Nghĩa tiếng Việt tự nhiên, ngắn gọn và đúng ngữ cảnh.',
      'ID ổn định, không trùng; ưu tiên giữ ID nguồn.',
      'Mọi entity AI sinh phải có sourceRefs, generation, reviewStatus="needs-review" và confidence.',
      'Không bịa nguồn gốc chữ, Hán Việt, bộ thủ, thành phần biểu âm/biểu nghĩa hoặc pinyin tên riêng.',
      'Phân biệt dictionaryRadical, components, vai trò semantic/phonetic/structural và exerciseGroup.',
      'Thông tin không chắc phải dùng reviewStatus="needs-review", confidence="low" hoặc role="uncertain".',
      'Trước khi trả kết quả phải tự kiểm tra JSON, ID, tham chiếu, tokens, cấp độ, pinyin, nghĩa và dữ liệu cấu tạo.',
      allowedVocabulary ? `Từ được phép dùng:\n${allowedVocabulary}` : '',
      allowedGrammar ? `Ngữ pháp được phép dùng:\n${allowedGrammar}` : '',
      requiredVocabulary ? `Từ bắt buộc:\n${requiredVocabulary}` : '',
      requiredGrammar ? `Ngữ pháp bắt buộc:\n${requiredGrammar}` : '',
      requirements ? `Yêu cầu bổ sung:\n${requirements}` : ''
    ].filter(Boolean);
  }

  function generationFields() {
    return 'generation gồm method="ai", profile, promptVersion, generatedAt; reviewStatus mặc định needs-review; confidence là low|medium|high.';
  }
  function tokenRules() {
    return [
      'tokens phải là mảng từ hoặc cụm ngữ pháp tự nhiên theo đúng thứ tự câu.',
      'Không gộp cả một chủ ngữ dài hoặc gần như cả câu thành một token chỉ để giảm số token.',
      'Không tách một từ hai âm tiết thành hai token.',
      'Bỏ dấu câu và khoảng trắng, ghép tokens phải khớp hanzi.',
      'Nếu chưa tách chắc chắn, thêm ID vào validation.needsReview; không giả vờ đã kiểm duyệt.'
    ];
  }
  function commonWrapper(type) {
    return [
      'Trả về đúng một đối tượng JSON thuần, không Markdown và không giải thích ngoài JSON.',
      `Đối tượng gốc có format="tieng-trung-ai-result-v1", type="${type}", level, topic, extra_words, quality_notes, items.`,
      'extra_words là mảng {hanzi,pinyin,meaning,reason}; quality_notes là mảng chuỗi.',
      generationFields()
    ];
  }

  function outputContract(type) {
    if (type === 'package') return [
      'Trả object gồm schemaVersion, meta, vocabulary, sentences, grammar, dialogues, passages, characters, practicePlan, validation.',
      'Các mảng không được yêu cầu để []. Không tự tạo hội thoại nếu không được chọn.',
      'validation gồm errors, warnings, outOfScopeWords, needsReview, coverage.',
      generationFields(), ...tokenRules()
    ];
    if (type === 'character') return [
      'Trả object gồm schemaVersion, generatedEntities.characters, updatedEntities.characters, validation.',
      'Mỗi chữ có id,hanzi,pinyin,meaningsVi,sourceRefs,studyPriority,structure,dictionaryRadical,components,strokes,pedagogy,reviewStatus,confidence,generation.',
      'dictionaryRadical có glyph,radicalId,nameVi,pinyin,hanViet. components có glyph,nameVi,pinyin,hanViet,position,positionVi,role,roleVi,reviewStatus.',
      'role chỉ là semantic|phonetic|semantic-phonetic|structural|uncertain. Không ép component thành radical.',
      'validation phải nêu dữ liệu chưa kiểm chứng.'
    ];
    if (type === 'practice') return [
      'Trả object gồm schemaVersion, generatedEntities.exercises, practicePlan, validation.',
      'Hỗ trợ multiple-choice,fill-vocabulary,fill-sentence,matching,sentence-ordering,typing,translation-zh-vi,translation-vi-zh,dialogue-roleplay,radical-sort,component-build,writing.',
      'Bài tập chỉ lưu source entity IDs, cấu hình, đáp án, acceptedAnswers và reviewStatus; không sao chép entity nguồn.',
      'sentence-ordering phải dùng tokens theo từ/cụm. radical-sort mỗi chữ chỉ có một đáp án curated.',
      'validation phải kiểm tra mơ hồ, lộ đáp án và tham chiếu.'
    ];
    if (type === 'review') return [
      'Trả đúng object {valid,errors,warnings,patch,validation}.',
      'patch là mảng thao tác {op,path,value,reason}; không tự sửa âm thầm.',
      'Kiểm tra pinyin, nghĩa, ID, sourceRefs, tokens, từ/ngữ pháp vượt cấp, speaker, audioText, radical/component và reviewStatus.'
    ];
    if (type === 'vocabulary') return commonWrapper(type).concat([
      'Mỗi items: id,hanzi,pinyin,meaning,word_type,tags,sourceRefs,generation,reviewStatus,confidence.'
    ]);
    if (type === 'sentence') return commonWrapper(type).concat([
      'Mỗi items: id,hanzi,pinyin,meaning,tokens,tags,source_word_ids,grammar_ids,sourceRefs,audioText,acceptedAnswers,generation,reviewStatus,confidence.',
      ...tokenRules(), 'Không tạo hai câu trùng nội dung.'
    ]);
    if (type === 'grammar') return commonWrapper(type).concat([
      'Mỗi items: id,topic,pattern,explanation,tips,attentions,examples,sourceRefs,generation,reviewStatus,confidence.',
      'Mỗi example có id,hanzi,pinyin,meaning,tokens,source_word_ids,grammar_ids,audioText,sourceRefs.',
      ...tokenRules(), 'Giải thích tiếng Việt súc tích; ví dụ không vượt cấp không cần thiết.'
    ]);
    if (type === 'dialogue') return commonWrapper(type).concat([
      'items có đúng một object id,title,kind="dialogue",context,speakers,items.',
      'Mỗi lượt: id,order,speaker,speakerId,hanzi,pinyin,meaning,tokens,source_word_ids,grammar_ids,audioText,sourceRefs.',
      ...tokenRules(), 'Tên người nói không nằm trong audioText. Lượt phải phản hồi tự nhiên.'
    ]);
    return commonWrapper(type).concat([
      'items có đúng một object id,title,kind="passage",items,sourceRefs.',
      'Mỗi câu: id,order,hanzi,pinyin,meaning,tokens,source_word_ids,grammar_ids,audioText,sourceRefs.',
      ...tokenRules(), 'Các câu phải tạo thành đoạn mạch lạc và tách được để nghe/gõ/dịch.'
    ]);
  }

  function taskLines(type, fields) {
    const count = number(fields.count, type === 'grammar' ? 3 : 10);
    const input = clean(fields.inputText);
    const sourceBlock = input ? `\nDỮ LIỆU NGUỒN BẮT BUỘC:\n${input}` : '\nChưa có dữ liệu nguồn. Chỉ được tự chọn nội dung khi operation=create; phải ghi cảnh báo phạm vi.';
    if (type === 'package') return [
      `Tạo/chuẩn hóa một bộ dữ liệu học hoàn chỉnh, mục tiêu khoảng ${count} entity chính.`,
      'Chỉ tạo các nhóm nội dung được yêu cầu. Liên kết từ→câu→hội thoại/đoạn→ngữ pháp→nghe→bài tập bằng ID.',
      'Tạo practicePlan từ entity IDs; không nhân bản dữ liệu.', sourceBlock
    ];
    if (type === 'character') return [
      `Phân tích hoặc bổ sung tối đa ${count} chữ Hán.`,
      'Ưu tiên dữ liệu dùng được cho học cấu tạo, xếp chữ vào bộ thủ/thành phần và bút thuận.',
      'Không suy đoán vai trò biểu âm/biểu nghĩa. Nếu chưa chắc, role=uncertain và needs-review.', sourceBlock
    ];
    if (type === 'practice') return [
      `Tạo tối đa ${count} bài tập từ entity nguồn.`,
      'Ưu tiên dữ liệu có một đáp án rõ. Không tự tạo kẻ xâm nhập hoặc radical-sort mơ hồ.',
      'Điền từ random phải ưu tiên hard/review/wrongBefore và content word hoặc grammar target.', sourceBlock
    ];
    if (type === 'review') return [
      `Kiểm tra dữ liệu và liệt kê tối đa ${count} vấn đề quan trọng.`,
      'Không viết lại toàn bộ dữ liệu. Trả patch nhỏ, có reason và giữ dữ liệu đúng nguyên trạng.', sourceBlock
    ];
    if (type === 'vocabulary') return [`Tạo hoặc chuẩn hóa ${count} mục từ.`, 'Nếu đầu vào đã có từ, giữ nguyên chữ Hán và chỉ bổ sung trường thiếu.', sourceBlock];
    if (type === 'sentence') return [`Tạo ${count} câu mới dùng được cho thẻ, nghe, điền, xếp câu, gõ và dịch.`, 'Gắn source_word_ids và grammar_ids. Câu ngắn, tự nhiên, TTS đọc tốt.', sourceBlock];
    if (type === 'grammar') return [sourceMode(fields) === 'patterns' ? 'Chỉ phân tích mẫu được cung cấp.' : `Chọn tối đa ${Math.max(1, Math.min(5, number(fields.grammarPatternCount, 3)))} mẫu phù hợp.`, `Mỗi mẫu tạo ${count} ví dụ.`, sourceBlock];
    if (type === 'dialogue') return [`Viết một hội thoại ${count} lượt.`, 'Chỉ dùng metadata nhân vật đủ để câu tự nhiên; trọng tâm là dữ liệu chuẩn, tham chiếu và khả năng luyện.', sourceBlock];
    return [`Viết một đoạn khoảng ${count} câu.`, 'Đoạn có mạch, mỗi câu tách được thành entity riêng.', sourceBlock];
  }

  function build(type, fields = {}) {
    const normalizedType = TYPE_META[type] ? type : 'vocabulary';
    const meta = TYPE_META[normalizedType];
    return [
      'Bạn là chuyên gia biên soạn dữ liệu học tiếng Trung cho người Việt và là trình kiểm tra dữ liệu có cấu trúc.',
      `PROFILE: ${normalizedType} — ${meta.label}.`,
      '', 'NGUYÊN TẮC BẮT BUỘC', ...coreRules(fields).map(line => `- ${line}`),
      '', 'NHIỆM VỤ', ...taskLines(normalizedType, fields).map(line => line.startsWith('\n') ? line : `- ${line}`),
      '', 'HỢP ĐỒNG ĐẦU RA', ...outputContract(normalizedType).map(line => `- ${line}`),
      '', 'TỰ KIỂM TRA TRƯỚC KHI TRẢ',
      '- JSON hợp lệ; ID không trùng; sourceRefs tồn tại; pinyin và nghĩa khớp; tokens ghép đúng; không vượt phạm vi quá giới hạn.',
      '- Không lộ đáp án trước khi làm bài; audioText tự nhiên; dữ liệu phỏng đoán không được gắn reviewed.',
      '- Chỉ trả JSON thuần. Không giải thích thêm.'
    ].join('\n');
  }

  window.TiengTrungAiPromptTemplates = Object.freeze({ TYPE_META, build });
})();

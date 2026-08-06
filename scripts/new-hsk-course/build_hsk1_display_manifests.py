#!/usr/bin/env python3
"""Build HSK1 learner-facing display metadata from reviewed course JSON.

PDF/PPT trace data remains in JSON, while display flags, structured warmups,
grammar layers and learning summaries are generated for the web renderer.
"""
from __future__ import annotations
import argparse
import json, re, unicodedata
from pathlib import Path
from collections import defaultdict

REPO: Path
MODULE: Path
DATA: Path
SOURCE: Path
CJK_RE = re.compile(r'[\u3400-\u9fff]')

EDITORIAL_VI = {
    '这是我（　　　）。': 'Đây là (___) của tôi.',
    '请问，你（　　　）叫什么名字？': 'Xin hỏi, (___) của bạn tên là gì?',
    '今天5月1号。': 'Hôm nay là ngày 1 tháng 5.',
    '我妹妹12岁。': 'Em gái tôi 12 tuổi.',
    '我们下午三点见吧。': 'Chúng ta gặp nhau lúc ba giờ chiều nhé.',
    '你去超市买吧。': 'Bạn hãy đến siêu thị mua nhé.',
    '我们去西安饭店吃晚饭吧。': 'Chúng ta đến Nhà hàng Tây An ăn tối nhé.',
    '我们（　　）点见？': 'Chúng ta gặp nhau lúc mấy giờ?',
    '我们下午（　　）见吧。': 'Chúng ta gặp nhau vào buổi chiều (___) nhé.',
    '你上午去上课，是吗？': 'Buổi sáng bạn đi học, đúng không?',
    '对，我（　　）有课。': 'Đúng, tôi có tiết học vào (___).',
    '我们（　　）去超市吧。': 'Chúng ta (___) đi siêu thị nhé.',
    '对不起，我（　　）有课。': 'Xin lỗi, tôi có tiết học vào (___).',
    '我明天下午两点还上课呢。': 'Ngày mai lúc hai giờ chiều tôi vẫn còn có tiết học đấy.',
    '妹妹会做两个菜呢。': 'Em gái biết nấu hai món đấy.',
    '你们今天下午两点（　　）上课？': 'Hôm nay lúc hai giờ chiều các bạn học ở (___)?',
    '在学校。': 'Ở trường.',
    '你们（　　）在超市买什么呢？': 'Các bạn (___) mua gì ở siêu thị vậy?',
    '买菜呢。': 'Đang mua rau đấy.',
    '第 + Số từ': 'Thứ + số từ.',
    '第 + Số từ + Lượng từ + (Danh từ)': 'Thứ + số từ + lượng từ + (danh từ).',
    '我很喜欢，也不贵。': 'Tôi rất thích, cũng không đắt.',
    '这本书怎么样？': 'Cuốn sách này thế nào?',
    '这个菜怎么样？': 'Món này thế nào?',
    '这个菜不太好吃，我不喜欢。': 'Món này không ngon lắm, tôi không thích.',
    '他去哪儿了？你知道不知道？': 'Anh ấy đi đâu rồi? Bạn có biết không?',
    '昨天你去没去书店？': 'Hôm qua bạn có đi hiệu sách không?',
    '这件衣服贵不贵？': 'Bộ quần áo này có đắt không?',
    '不贵。': 'Không đắt.',
    '在/正在 + Động từ': '在/正在 + động từ: đang thực hiện hành động.',
    '在/正在 + Động từ + 呢': '在/正在 + động từ + 呢: đang thực hiện hành động.',
    'Động từ + 呢': 'Động từ + 呢: đang thực hiện hành động.',
    '学生们在/正在上课呢。': 'Các học sinh đang học.',
    '我们读书呢。': 'Chúng tôi đang đọc sách.',
    '我去看电影，你去不去？': 'Tôi đi xem phim, bạn có đi không?',
    '我在学习呢，不想去。': 'Tôi đang học, không muốn đi.',
    '你在买菜吗？': 'Bạn đang mua rau à?',
    '我没买菜，买水果呢。': 'Tôi không mua rau, đang mua hoa quả.',
    '弟弟起床了吗？': 'Em trai đã thức dậy chưa?',
    '没起床呢。': 'Vẫn chưa thức dậy.',
    '我可以坐吗？': 'Tôi có thể ngồi không?',
    '可以，请坐！': 'Được, mời ngồi!',
    '你去哪儿（　　）？': 'Bạn đi đâu (___)?',
    '我今天有课，去学校上（　　）课，还在那儿吃（　　）午饭。': 'Hôm nay tôi có tiết học, đến trường học (___) tiết, còn ăn (___) bữa trưa ở đó.',
    '我昨天看（　　）电影，（　　）去超市。你呢？': 'Hôm qua tôi xem (___) bộ phim, (___) đi siêu thị. Còn bạn?',
    '我昨天去（　　）超市，（　　）看电影。': 'Hôm qua tôi đi (___) siêu thị, (___) xem phim.',
}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def clean_inline(value: str) -> str:
    value = re.sub(r'\*\*(.+?)\*\*', r'\1', value)
    value = re.sub(r'`(.+?)`', r'\1', value)
    value = re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'\1', value)
    return value.strip()


def parse_md_table(markdown: str):
    lines = markdown.splitlines()
    tables=[]; i=0
    while i < len(lines):
        line=lines[i].strip()
        if line.startswith('|') and i+1<len(lines) and re.match(r'^\|?\s*:?-{3,}', lines[i+1].strip().lstrip('|')):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i+=1
            if len(rows)>=2:
                tables.append((rows[0],rows[2:]))
            continue
        i+=1
    return tables


def build_translation_map():
    result = {}
    roots = [REPO / 'modules/new-hsk-course/data', REPO / 'modules/hanzi-stroke/data/learning', REPO / 'modules/listening/data']
    def walk(obj):
        if isinstance(obj, dict):
            hanzi = next((str(obj.get(key)).strip() for key in ('hanzi','zh','chinese','word','sentence') if isinstance(obj.get(key), str) and CJK_RE.search(obj.get(key))), '')
            vi = next((str(obj.get(key)).strip() for key in ('vi','meaningVi','vietnamese','translationVi','meaning_vi') if isinstance(obj.get(key), str) and obj.get(key).strip()), '')
            if hanzi and vi:
                result.setdefault(hanzi, vi)
                result.setdefault(hanzi.rstrip('。！？!?'), vi)
            generated_keys = {'grammarDisplay', 'warmupDisplay', 'summaryDisplay', 'sourceVisuals', 'sourceTasks'}
            for key, value in obj.items():
                if key not in generated_keys: walk(value)
        elif isinstance(obj, list):
            for value in obj: walk(value)
    for root in roots:
        if not root.exists(): continue
        for path in root.rglob('*.json'):
            try: walk(json.loads(path.read_text(encoding='utf-8')))
            except Exception: continue
    return result


def build_phrase_map(lessons):
    phrase={}
    def add(h,p):
        h=str(h or '').strip(); p=str(p or '').strip()
        if not h or not p or not CJK_RE.search(h): return
        h=re.sub(r'[\s，。！？；：、,.!?;:“”‘’（）()]+$','',h)
        p=re.sub(r'[\s，。！？；：、,.!?;:“”‘’（）()]+$','',p).strip()
        if h and p and h not in phrase: phrase[h]=p
    for d in lessons:
        e=d.get('entities',{})
        for key in ['vocabulary','properNouns']:
            for row in e.get(key,[]): add(row.get('hanzi'),row.get('pinyin'))
        for dia in e.get('dialogues',[]):
            for turn in dia.get('turns',[]): add(turn.get('hanzi'),turn.get('pinyin'))
        for passage in e.get('passages',[]):
            hz=str(passage.get('hanzi','')).splitlines(); py=str(passage.get('pinyin','')).splitlines()
            for h,p in zip(hz,py): add(h,p)
        for g in e.get('grammar',[]):
            md=g.get('markdown','')
            lines=md.splitlines()
            for i,line in enumerate(lines):
                m=re.search(r'\*\*([^*]*[\u3400-\u9fff][^*]*)\*\*',line)
                if not m: continue
                for j in range(i+1,min(i+4,len(lines))):
                    p=re.search(r'`([^`]+)`|\*([^*\u3400-\u9fff]+)\*',lines[j])
                    if p:
                        add(m.group(1),p.group(1) or p.group(2)); break
    # Character/word dictionary gives fallback and phrase coverage.
    chars_dir=REPO/'modules/hanzi-stroke/data/chars'
    if chars_dir.exists():
        for path in chars_dir.glob('*.json'):
            try: row=read_json(path)
            except Exception: continue
            add(row.get('char'),row.get('pinyin'))
            for rel in row.get('relatedWords',[]) or []: add(rel.get('word'),rel.get('pinyin'))
    return phrase


def normalize_pinyin(value: str) -> str:
    value=re.sub(r'\s+',' ',value.strip())
    return value


def pinyinize(text: str, phrase_map: dict[str,str]) -> str:
    if not text: return ''
    raw_exact=re.sub(r'^[AB][:：]\s*','',text.strip())
    terminal=''
    if raw_exact and raw_exact[-1] in '。！？!?': terminal={'。':'.','！':'!','？':'?'}.get(raw_exact[-1],raw_exact[-1])
    exact=re.sub(r'[。！？!?]$','',raw_exact)
    if exact in phrase_map:
        out=normalize_pinyin(phrase_map[exact]).lower()
        out=re.sub(r'[,.!?;:]+$','',out).strip()+terminal
        out=re.sub(r'([,.!?;:])\1+',r'\1',out)
        return out[:1].upper()+out[1:] if out else out
    keys=sorted((k for k in phrase_map if not re.search(r'[，。！？；：、,.!?;:“”‘’（）()]',k)),key=len,reverse=True)
    out=[]; i=0
    while i<len(text):
        ch=text[i]
        if CJK_RE.match(ch):
            match=None
            for key in keys:
                if text.startswith(key,i): match=key; break
            if match:
                py=normalize_pinyin(phrase_map[match]).lower()
                out.append(py); i+=len(match); continue
            out.append(ch); i+=1; continue
        if ch in '，、': out.append(',')
        elif ch in '。': out.append('.')
        elif ch in '！': out.append('!')
        elif ch in '？': out.append('?')
        elif ch in '；': out.append(';')
        elif ch in '：': out.append(':')
        elif ch in '“”‘’': out.append(ch)
        elif ch.isspace():
            if out and not str(out[-1]).endswith(' '): out.append(' ')
        else: out.append(ch)
        i+=1
    value=' '.join(str(x).strip() for x in out if str(x).strip())
    value=re.sub(r'\s+([,.!?;:])',r'\1',value)
    value=re.sub(r'([“‘])\s+',r'\1',value)
    value=re.sub(r'\s+([”’])',r'\1',value)
    value=re.sub(r'\s+',' ',value).strip()
    value=re.sub(r'\.\s*,',',',value)
    value=re.sub(r'([,.!?;:])\1+',r'\1',value)
    # Capitalize first roman letter only.
    for idx,c in enumerate(value):
        if c.isalpha() and ord(c)<128 or c in 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü':
            value=value[:idx]+c.upper()+value[idx+1:]; break
    return value


def split_sections(markdown: str):
    lines=markdown.splitlines(); sections=[]; title=''; buf=[]
    for line in lines:
        m=re.match(r'^###\s+(.+?)\s*$',line.strip())
        if m:
            sections.append((title,'\n'.join(buf).strip()))
            title=re.sub(r'^\d+(?:\.\d+)*\.\s*','',m.group(1)).strip(); buf=[]
        else: buf.append(line)
    sections.append((title,'\n'.join(buf).strip()))
    return sections


def extract_example_rows(block: str, phrase_map):
    lines=block.splitlines(); examples=[]; i=0
    while i<len(lines):
        line=lines[i].strip()
        m=re.match(r'^(?:(\d+)\.\s+|([AB])[:：]\s*)(.+)$',line)
        if not m:
            i+=1; continue
        label=m.group(2) or (m.group(1) if m.group(1) else '')
        content=m.group(3).strip()
        # A numbered item can itself start with A: / B:.
        inner=re.match(r'^([AB])[:：]\s*(.+)$',content)
        if inner: label=inner.group(1); content=inner.group(2)
        bolds=re.findall(r'\*\*([^*]*[\u3400-\u9fff][^*]*)\*\*',content)
        hanzi=bolds[0].strip() if bolds else ''
        if not hanzi and CJK_RE.search(clean_inline(content)):
            hanzi=clean_inline(content)
            hanzi=re.split(r'\s+-\s+|\s+—\s+',hanzi,1)[0].strip()
        vi=''
        sep=re.split(r'\s+-\s+|\s+—\s+', content, maxsplit=1)
        if len(sep)>1: vi=clean_inline(sep[1])
        pinyin=''; j=i+1
        continuation=[]
        while j<len(lines):
            nxt=lines[j].strip()
            if re.match(r'^(?:\d+\.\s+|[AB][:：]\s*)',nxt) or re.match(r'^###\s+',nxt): break
            if nxt:
                continuation.append(nxt)
            j+=1
        for nxt in continuation:
            p=re.fullmatch(r'`([^`]+)`|\*([^*\u3400-\u9fff]+)\*',nxt)
            if p and not pinyin:
                pinyin=clean_inline(p.group(1) or p.group(2)); continue
            if not vi and not CJK_RE.search(clean_inline(nxt)) and not re.match(r'^[-*>|]',nxt):
                vi=clean_inline(nxt)
        if hanzi:
            if not pinyin: pinyin=pinyinize(hanzi,phrase_map)
            examples.append({
                'id': f'example-{len(examples)+1:02d}',
                'order': len(examples)+1,
                'label': label if label in {'A','B'} else '',
                'hanzi': hanzi,
                'pinyin': pinyin,
                'vi': vi,
                'pinyinStatus': 'source' if pinyin and any('`' in x or re.fullmatch(r'\*[^*\u3400-\u9fff]+\*',x) for x in continuation) else 'derived-local-dictionary'
            })
        i=max(i+1,j)
    return examples


def remove_example_lines(block: str):
    lines=block.splitlines(); kept=[]; skipping=False
    i=0
    while i<len(lines):
        line=lines[i].strip()
        if re.match(r'^(?:\d+\.\s+|[AB][:：]\s*)',line):
            i+=1
            while i<len(lines):
                nxt=lines[i].strip()
                if not nxt: i+=1; continue
                if re.match(r'^(?:\d+\.\s+|[AB][:：]\s*)',nxt) or re.match(r'^###\s+',nxt): break
                if re.fullmatch(r'`[^`]+`|\*[^*\u3400-\u9fff]+\*',nxt) or (not CJK_RE.search(clean_inline(nxt)) and not nxt.startswith(('-', '*', '>', '|'))):
                    i+=1; continue
                break
            continue
        kept.append(lines[i]); i+=1
    return '\n'.join(kept).strip()


def grammar_display(markdown: str, phrase_map, translation_map):
    sections=split_sections(markdown)
    intro=[]; groups=[]
    for title,block in sections:
        examples=extract_example_rows(block,phrase_map)
        for example in examples:
            if example.get('vi'):
                example['viStatus'] = 'source'
                continue
            hanzi = example.get('hanzi', '')
            translated = translation_map.get(hanzi) or translation_map.get(hanzi.rstrip('。！？!?'))
            if translated:
                example['vi'] = translated
                example['viStatus'] = 'repo-source'
            elif hanzi in EDITORIAL_VI:
                example['vi'] = EDITORIAL_VI[hanzi]
                example['viStatus'] = 'editorial-completion'
            else:
                example['viStatus'] = 'missing-source'
        prose=remove_example_lines(block)
        normalized=title.lower()
        if not title:
            if prose: intro.append(prose)
            if examples: groups.append({'title':'Đọc to','introMarkdown':'','examples':examples})
            continue
        if examples:
            group_title=title
            if group_title.lower() in {'đọc to','đọc to hội thoại','đọc to và viết bằng số'}:
                group_title=group_title
            groups.append({'title':group_title,'introMarkdown':prose,'examples':examples})
        else:
            # Keep explanatory sub-sections, but avoid duplicated generic headings.
            if prose:
                if normalized in {'nội dung','chức năng','nội dung trong sách'}:
                    intro.append(prose)
                else:
                    groups.append({'title':title,'introMarkdown':prose,'examples':[]})
    # Deduplicate examples across split groups.
    seen=set()
    for group in groups:
        uniq=[]
        for ex in group['examples']:
            key=(ex['hanzi'],ex.get('vi',''))
            if key in seen: continue
            seen.add(key); ex['id']=f'example-{len(seen):02d}'; ex['order']=len(seen); uniq.append(ex)
        group['examples']=uniq
    groups=[g for g in groups if g['introMarkdown'] or g['examples']]
    return {'introMarkdown':'\n\n'.join(x for x in intro if x).strip(),'groups':groups}


def warmup_display(markdown: str, phrase_map):
    lines=[x.rstrip() for x in markdown.splitlines()]
    hanzi=''; vi=''
    for i,line in enumerate(lines):
        m=re.search(r'\*\*([^*]*[\u3400-\u9fff][^*]*)\*\*',line)
        if m:
            hanzi=m.group(1).strip()
            tail=clean_inline(line[m.end():]).strip()
            if tail: vi=tail
            if not vi:
                for j in range(i+1,min(i+4,len(lines))):
                    c=clean_inline(lines[j]).strip()
                    if c and not c.startswith('|') and not CJK_RE.search(c): vi=c; break
            break
    choices=[]
    for headers,rows in parse_md_table(markdown):
        lower=[clean_inline(h).lower() for h in headers]
        if not any('lựa chọn' in h or 'ký hiệu' in h for h in lower): continue
        def idx(*terms):
            for term in terms:
                for k,h in enumerate(lower):
                    if term in h: return k
            return -1
        li=idx('lựa chọn','ký hiệu'); hi=idx('từ/cụm từ','từ'); reading_i=idx('cách đọc'); time_i=idx('thời gian'); pi=idx('pinyin'); vi_i=idx('nghĩa tiếng việt','nghĩa')
        for row in rows:
            letter=clean_inline(row[li] if li>=0 and li<len(row) else '')
            if not re.fullmatch(r'[A-F]',letter): continue
            word=clean_inline(row[hi] if hi>=0 and hi<len(row) else '')
            reading=clean_inline(row[reading_i] if reading_i>=0 and reading_i<len(row) else '')
            time_value=clean_inline(row[time_i] if time_i>=0 and time_i<len(row) else '')
            choice_hanzi=word or reading or time_value
            pinyin=clean_inline(row[pi] if pi>=0 and pi<len(row) else '')
            if not pinyin and CJK_RE.search(choice_hanzi): pinyin=pinyinize(choice_hanzi,phrase_map)
            choice_vi=clean_inline(row[vi_i] if vi_i>=0 and vi_i<len(row) else '') or time_value
            choices.append({'key':letter,'hanzi':choice_hanzi,'pinyin':pinyin,'vi':choice_vi})
        if choices: break
    return {'instructionHanzi':hanzi,'instructionVi':vi or 'Chọn hình tương ứng với các từ/cụm từ sau.','choices':choices}


def summary_display(markdown: str, section_id: str):
    assessment=[]
    for headers,rows in parse_md_table(markdown):
        lower=[clean_inline(h).lower() for h in headers]
        if not any('hiểu' in h for h in lower): continue
        content_idx=next((i for i,h in enumerate(lower) if 'nội dung' in h),0)
        example_idx=next((i for i,h in enumerate(lower) if 'ví dụ' in h),-1)
        for row in rows:
            content=clean_inline(row[content_idx] if content_idx<len(row) else '')
            example=clean_inline(row[example_idx] if example_idx>=0 and example_idx<len(row) else '')
            if not example:
                split=re.split(r'[,，]?\s*ví dụ\s*:\s*',content,maxsplit=1,flags=re.I)
                if len(split)==2:
                    content,example=split[0].strip(' ,，'),split[1].strip()
            if not content: continue
            assessment.append({'id':f'{section_id}-item-{len(assessment)+1:02d}','order':len(assessment)+1,'content':content,'example':example})
        if assessment: break
    return {'items':assessment,'notePrompt':'Những điểm tôi cần cố gắng'}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, required=True)
    args = parser.parse_args()
    global REPO, MODULE, DATA, SOURCE
    REPO = args.repo.resolve()
    MODULE = REPO / 'modules/new-hsk-course'
    DATA = MODULE / 'data/hsk1'
    SOURCE = MODULE / 'source/hsk1'
    lessons=[read_json(DATA/f'lesson-{n:02d}.json') for n in range(1,16)]
    phrase_map=build_phrase_map(lessons)
    translation_map=build_translation_map()
    visual_manifest=read_json(SOURCE/'visual-manifest.json')
    display={'version':1,'course':'new-hsk-course','level':1,'lessons':{}}
    for d in lessons:
        lesson_entry={'sections':{}}
        visual_sections=((visual_manifest.get('lessons',{}).get(d['id'],{}) or {}).get('sections',{}))
        for section in d['entities'].get('contentSections',[]):
            cfg={}; kind=section.get('kind','')
            if kind=='warmup': cfg['warmupDisplay']=warmup_display(section.get('markdown',''), phrase_map)
            if kind=='grammar': cfg['grammarDisplay']=grammar_display(section.get('markdown',''),phrase_map,translation_map)
            if section.get('title','').lower().startswith('tổng kết học tập'):
                cfg['summaryDisplay']=summary_display(section.get('markdown',''),section['id'])
            visuals=visual_sections.get(section['id'],section.get('sourceVisuals',[]))
            if visuals:
                out=[]
                for visual in visuals:
                    visual=dict(visual)
                    src=str(visual.get('src',''))
                    visible=(visual.get('sourceType')=='ppt' and kind in {'warmup','lesson-text','activity'} and not src.endswith(('ppt-extension.webp','ppt-summary.webp')))
                    # Future sourceType=pdf-crop is explicitly allowed, full-page PDF remains hidden.
                    if visual.get('sourceType')=='pdf-crop': visible=True
                    visual['displayInLesson']=visible
                    if visible:
                        visual['assetPolicy']='learner-visual'
                    else:
                        visual.pop('src', None)
                        visual['assetPolicy']='trace-only'
                    out.append(visual)
                cfg['sourceVisuals']=out
                section['sourceVisuals']=out
            for key in ('warmupDisplay','grammarDisplay','summaryDisplay'):
                if key in cfg: section[key]=cfg[key]
            if cfg: lesson_entry['sections'][section['id']]=cfg
        d['stats']['visibleSourceVisuals']=sum(sum(1 for v in s.get('sourceVisuals',[]) if v.get('displayInLesson')) for s in d['entities'].get('contentSections',[]))
        (DATA/f"lesson-{d['lessonNumber']:02d}.json").write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        display['lessons'][d['id']]=lesson_entry
    # Persist the normalized trace manifest too: hidden full-page sources keep
    # page/source metadata but no binary asset path.
    for lesson_entry in visual_manifest.get('lessons', {}).values():
        for visuals in (lesson_entry.get('sections', {}) or {}).values():
            for visual in visuals:
                src=str(visual.get('src',''))
                source_type=visual.get('sourceType')
                visible=source_type=='ppt' and bool(src) and not src.endswith(('ppt-extension.webp','ppt-summary.webp'))
                if source_type=='pdf-crop': visible=True
                if visible:
                    visual['assetPolicy']='learner-visual'
                else:
                    visual.pop('src', None)
                    visual['assetPolicy']='trace-only'
    (SOURCE/'visual-manifest.json').write_text(json.dumps(visual_manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (SOURCE/'display-manifest.json').write_text(json.dumps(display,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('wrote',SOURCE/'display-manifest.json','phrase map',len(phrase_map),'translation map',len(translation_map))
    return 0

if __name__=='__main__':
    raise SystemExit(main())

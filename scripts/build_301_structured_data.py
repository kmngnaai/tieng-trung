from __future__ import annotations

import argparse
import json
import re
import shutil
import zipfile
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any

# -----------------------------------------------------------------------------
# build_301_structured_data.py (v2)
#
# Muc tieu:
# 1) Tach du 40 bai 301 tu nguon Markdown/PDF.
# 2) Phan loai lesson_type.
# 3) Tao JSON moi co sentences/dialogue/vocabulary ro rang nhat co the.
# 4) Tao debug_report + preview.md de kiem tra bang mat.
# 5) Khong dua du lieu trinh chieu vao output.
#
# Dat file tai:
#   tieng-trung-web/scripts/build_301_structured_data.py
# Chay:
#   cd "D:\\01.AutobyNgan\\00.Build.App\\12.Obsidian\\Tieng-Trung\\tieng-trung-web"
#   python scripts\\build_301_structured_data.py
# -----------------------------------------------------------------------------

SCRIPT_PATH = Path(__file__).resolve()
WEB_ROOT = SCRIPT_PATH.parents[1]
SOURCE_ROOT = WEB_ROOT.parent
DEFAULT_OUT_DIR = WEB_ROOT / "lessons-301-v2"
DEFAULT_WORK_DIR = WEB_ROOT / ".work_301_structured"

CJK_RE = re.compile(r"[\u3400-\u9fff]")
PINYIN_LETTERS_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ſƀ-ɏǍǎǏǐǑǒǓǔǕ-ǜḀ-ỿÜü]")
PINYIN_TONE_RE = re.compile(r"[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛüÜ]")
PUNCT_END_RE = re.compile(r"[。！？!?]$")

SECTION_ALIASES = {
    "生词": "vocabulary",
    "词语": "vocabulary",
    "句子": "sentences",
    "课文": "dialogue",
    "会话": "dialogue",
    "对话": "dialogue",
    "注释": "notes",
    "注释:": "notes",
    "替换与扩展": "extension",
    "扩展": "extension",
    "语音": "grammar",
    "语法": "grammar",
    "练习": "practice",
    "练习与运用": "practice",
    "Mẫu câu": "sentences",
    "Đàm thoại": "dialogue",
    "Chú thích": "notes",
    "Chú thích:": "notes",
    "Mở rộng": "extension",
    "Mở rộng:": "extension",
    "Từ vựng Tiếng Trung": "vocabulary",
    "Từ vựng": "vocabulary",
    "Ngữ pháp Tiếng Trung": "grammar",
    "Ngữ pháp": "grammar",
    "Luyện tập Ngữ âm Ngữ điệu": "practice",
    "Luyện tập Ngữ âm Ngữ điệu Tiếng Trung": "practice",
    "Luyện tập": "practice",
}

SECTION_ORDER = ["vocabulary", "sentences", "dialogue", "notes", "extension", "grammar", "practice"]
SECTION_LABELS = {
    "vocabulary": "Từ vựng",
    "sentences": "Mẫu câu",
    "dialogue": "Đàm thoại",
    "notes": "Chú thích",
    "extension": "Mở rộng",
    "grammar": "Ngữ pháp / Ngữ âm",
    "practice": "Luyện tập",
}

NOISE_PREFIXES = (
    "lOMoARcPSD|",
    "TRUNG TÂM TIẾNG TRUNG",
    "Hotline:",
    "301 Câu Đàm thoại Tiếng Hoa",
    "messages.",
)
NOISE_EXACT = {
    "Minliang", "minliang", "目录", "THE END", "The End", "BÀI", "Bài", "–", "-",
    "T", "PPDDFF--330011 CCââuu đđààmm tthhooạạii ttiiếếnngg HHooaa",
}

@dataclass
class LessonSource:
    lesson_no: int
    lesson_id: str
    title_raw: str
    title_zh: str
    ordinal_zh: str
    md_name: str = ""
    md_text: str = ""


def has_cjk(text: str) -> bool:
    return bool(CJK_RE.search(str(text or "")))


def is_probably_pinyin(text: str) -> bool:
    s = str(text or "").strip()
    if not s or has_cjk(s):
        return False
    if not PINYIN_LETTERS_RE.search(s):
        return False
    # Neu co dau thanh pinyin thi uu tien xem la pinyin.
    # Tranh nham cac am nhu baba/mama co dau thanh voi tieng Viet.
    if PINYIN_TONE_RE.search(s):
        return True
    low = s.lower()
    vi_markers = ["bạn", "tôi", "không", "chào", "cảm", "thầy", "cô", "anh", "chị", "ông", "sức khỏe", "tạm biệt"]
    if any(re.search(rf"(^|\W){re.escape(x)}($|\W)", low) for x in vi_markers):
        return False
    return True


def is_probably_vietnamese(text: str) -> bool:
    s = str(text or "").strip()
    if not s or has_cjk(s):
        return False
    low = s.lower()
    vi_markers = [
        "bạn", "tôi", "không", "chào", "cảm", "thầy", "cô", "anh", "chị", "em", "ông", "bà",
        "rất", "khỏe", "hôm", "ngày", "mua", "đến", "đi", "là", "có", "được", "vậy", "nào",
        "tiếng", "trung", "sinh", "nhật", "chúc", "mừng", "việc", "công", "phải", "xin", "hỏi",
    ]
    return any(x in low for x in vi_markers) or bool(re.search(r"[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]", low))


def split_speaker(text: str) -> tuple[str, str]:
    s = str(text or "").strip()
    m = re.match(r"^(.{1,30}?)[：:](.+)$", s)
    if not m:
        return "", s
    return m.group(1).strip(), m.group(2).strip()


def decode_zip_u_name(name: str) -> str:
    # zip cua user co filename dang #U4f60; doi ve unicode de title de doc.
    def repl(m: re.Match) -> str:
        try:
            return chr(int(m.group(1), 16))
        except Exception:
            return m.group(0)
    return re.sub(r"#U([0-9A-Fa-f]{4})", repl, name)


def clean_filename_title(stem: str) -> tuple[int, str, str, str]:
    decoded = decode_zip_u_name(stem)
    decoded = decoded.replace("＿", "_")
    m = re.match(r"^(\d+)", decoded)
    lesson_no = int(m.group(1)) if m else 0
    rest = decoded[len(m.group(1)):] if m else decoded
    rest = rest.strip(" _-—–")
    ordinal = ""
    title = rest
    m2 = re.match(r"^([^_\-—–]*?课)\s*[_\-—–]?\s*(.*)$", rest)
    if m2:
        ordinal = m2.group(1).strip()
        title = m2.group(2).strip() or ordinal
    return lesson_no, decoded, title, ordinal


def normalize_line(line: str) -> str:
    s = str(line or "").replace("\u000b", " ").replace("\ufeff", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def is_noise_line(line: str) -> bool:
    s = normalize_line(line)
    if not s:
        return False
    if s in NOISE_EXACT:
        return True
    if any(s.startswith(p) for p in NOISE_PREFIXES):
        return True
    if set(s) <= {"_", "-", " ", "|"}:
        return True
    stripped = s.strip(" \"'\u201c\u201d\u2018\u2019")
    if stripped.startswith("Đạt được tri thức"):
        return True
    if re.fullmatch(r"\d{2}", s):
        return True
    return False


def clean_zh_leading_number(text: str) -> str:
    s = normalize_line(text)
    s = re.sub(r"^\(?\d+\)?[\.、)]\s*", "", s).strip()
    return s


def clean_lines(text: str, keep_tables: bool = True) -> list[str]:
    out: list[str] = []
    for raw in str(text or "").splitlines():
        line = normalize_line(raw)
        if not line:
            if out and out[-1] != "":
                out.append("")
            continue
        if line.startswith("<!--") and line.endswith("-->"):
            continue
        if line.startswith("### Notes"):
            continue
        if line.startswith("![") or line.startswith("![](") or re.match(r"^!\[.*\]\(.+\)$", line):
            continue
        if is_noise_line(line):
            continue
        out.append(line)
    while out and out[-1] == "":
        out.pop()
    return out


def split_markdown_sections(text: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {k: [] for k in SECTION_ORDER}
    current = ""
    for line in clean_lines(text):
        key = SECTION_ALIASES.get(line.rstrip(":")) or SECTION_ALIASES.get(line)
        if key:
            current = key
            continue
        if current:
            sections[current].append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items() if "\n".join(v).strip()}


def parse_pipe_rows(text: str) -> list[list[str]]:
    rows = []
    for line in str(text or "").splitlines():
        line = normalize_line(line)
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if cells and all(re.fullmatch(r":?-{2,}:?", c or "") for c in cells):
            continue
        if any(cells):
            rows.append(cells)
    return rows


def table_header_indexes(header: list[str]) -> dict[str, int]:
    norm = [re.sub(r"\s+", " ", c.lower()).strip() for c in header]
    def find_any(keys: list[str]) -> int:
        for i, c in enumerate(norm):
            c0 = c.replace("đ", "d")
            for key in keys:
                if key in c or key in c0:
                    return i
        return -1
    return {
        "no": find_any(["stt", "so", "số"]),
        "zh": find_any(["tiếng trung", "tieng trung", "中文", "han", "từ", "tu"]),
        "pinyin": find_any(["phiên âm", "phien am", "pinyin"]),
        "type": find_any(["từ loại", "tu loai", "loại từ", "loai tu"]),
        "vi": find_any(["nghĩa", "nghia", "tiếng việt", "tieng viet", "việt", "viet"]),
    }


def parse_vocab_from_tables(text: str) -> list[dict[str, Any]]:
    rows = parse_pipe_rows(text)
    out: list[dict[str, Any]] = []
    pending_zh = ""
    header_idx = -1
    indexes: dict[str, int] = {}

    for idx, row in enumerate(rows):
        joined = " ".join(row)
        if ("STT" in joined or "Tiếng Trung" in joined or "Phiên âm" in joined) and ("---" not in joined):
            header_idx = idx
            indexes = table_header_indexes(row)
            continue
        if header_idx < 0 or not indexes:
            continue
        # Bo qua dong separator da duoc loc, bo qua header lap lai
        if any("---" in c for c in row):
            continue
        max_i = max([i for i in indexes.values() if i >= 0] or [0])
        while len(row) <= max_i:
            row.append("")
        zh = row[indexes.get("zh", -1)].strip() if indexes.get("zh", -1) >= 0 else ""
        pinyin = row[indexes.get("pinyin", -1)].strip() if indexes.get("pinyin", -1) >= 0 else ""
        vi = row[indexes.get("vi", -1)].strip() if indexes.get("vi", -1) >= 0 else ""
        word_type = row[indexes.get("type", -1)].strip() if indexes.get("type", -1) >= 0 else ""
        no_text = row[indexes.get("no", -1)].strip() if indexes.get("no", -1) >= 0 else ""
        no_match = re.search(r"\d+", no_text)
        no = int(no_match.group()) if no_match else (len(out) + 1)
        # Truong hop PDF/table vo: zh nam chung trong cot STT hoac dong truoc.
        if not zh:
            m = re.search(r"\d+\s*([\u3400-\u9fff][\u3400-\u9fff\w（）()·、]*)", no_text)
            if m:
                zh = m.group(1)
        if not zh and pending_zh:
            zh = pending_zh
            pending_zh = ""
        if zh and not pinyin and is_probably_pinyin(vi):
            pinyin, vi = vi, ""
        if zh or pinyin or vi:
            out.append({
                "id": f"v{len(out)+1:03d}",
                "no": no,
                "zh": zh,
                "pinyin": pinyin,
                "word_type": word_type,
                "vi": vi,
                "source": "md_table",
                "confidence": "high" if zh and pinyin else "medium",
            })
    # Khử trùng lặp theo zh+pinyin+vi
    seen = set()
    uniq = []
    for item in out:
        key = (item.get("zh", ""), item.get("pinyin", ""), item.get("vi", ""))
        if key in seen:
            continue
        seen.add(key)
        item["id"] = f"v{len(uniq)+1:03d}"
        item["no"] = len(uniq) + 1
        uniq.append(item)
    return uniq


def parse_pinyin_vi_line(line: str) -> tuple[str, str] | None:
    s = normalize_line(line)
    m = re.match(r"^/?([^/]+?)/?\s*[-–—]\s*(.+)$", s)
    if m and is_probably_pinyin(m.group(1)):
        return m.group(1).strip(), m.group(2).strip()
    return None


def parse_triple_items(text: str, source: str, allow_dialogue: bool = False) -> list[dict[str, Any]]:
    lines = [l for l in clean_lines(text) if l and "|" not in l and not l.startswith("###")]
    items = []
    i = 0
    while i < len(lines):
        zh = clean_zh_leading_number(lines[i])
        if not has_cjk(zh):
            i += 1
            continue
        pinyin = ""
        vi = ""
        if i + 1 < len(lines) and is_probably_pinyin(lines[i + 1]):
            pinyin = lines[i + 1]
            if i + 2 < len(lines) and is_probably_vietnamese(lines[i + 2]):
                vi = lines[i + 2]
                i += 3
            else:
                i += 2
        else:
            # Dang /pinyin/ - vi gom rieng o dau section; xu ly o ham sentences rieng.
            i += 1
            continue
        speaker_zh = speaker_pinyin = speaker_vi = ""
        zh_body = zh
        pinyin_body = pinyin
        vi_body = vi
        if allow_dialogue:
            speaker_zh, zh_body = split_speaker(zh)
            speaker_pinyin, pinyin_body = split_speaker(pinyin)
            speaker_vi, vi_body = split_speaker(vi)
        items.append({
            "id": "",
            "zh": zh_body,
            "pinyin": pinyin_body,
            "vi": vi_body,
            "speaker_zh": speaker_zh,
            "speaker_pinyin": speaker_pinyin,
            "speaker_vi": speaker_vi,
            "source": source,
            "confidence": "high" if zh_body and pinyin_body and vi_body else "medium",
        })
    for idx, item in enumerate(items, start=1):
        item["id"] = f"d{idx:03d}" if allow_dialogue else f"s{idx:03d}"
        if allow_dialogue:
            item["turn"] = idx
    return items


def parse_sentences_from_md_section(text: str, source: str = "lesson_md") -> list[dict[str, Any]]:
    lines = [l for l in clean_lines(text) if l and "|" not in l]
    pinyin_vi = []
    zh_lines = []
    for line in lines:
        pv = parse_pinyin_vi_line(line)
        if pv:
            pinyin_vi.append(pv)
        elif has_cjk(line) and not split_speaker(line)[0] and line not in SECTION_ALIASES:
            zh_lines.append(clean_zh_leading_number(line))
    out = []
    if zh_lines and pinyin_vi:
        n = min(len(zh_lines), len(pinyin_vi))
        for idx in range(n):
            out.append({
                "id": f"s{idx+1:03d}",
                "zh": zh_lines[idx],
                "pinyin": pinyin_vi[idx][0],
                "vi": pinyin_vi[idx][1],
                "source": source,
                "confidence": "high",
            })
        return out
    return parse_triple_items(text, source=source, allow_dialogue=False)


def parse_dialogue_from_md_section(text: str, source: str = "lesson_md") -> list[dict[str, Any]]:
    lines = [l for l in clean_lines(text) if l and "|" not in l]
    out = []
    i = 0
    while i < len(lines):
        zh = clean_zh_leading_number(lines[i])
        if not has_cjk(zh) or "：" not in zh and ":" not in zh:
            i += 1
            continue
        pinyin = ""
        if i + 1 < len(lines) and is_probably_pinyin(lines[i + 1]):
            pinyin = lines[i + 1]
            i += 2
        else:
            i += 1
        speaker_zh, zh_body = split_speaker(zh)
        speaker_pinyin, pinyin_body = split_speaker(pinyin)
        out.append({
            "id": f"d{len(out)+1:03d}",
            "turn": len(out) + 1,
            "speaker_zh": speaker_zh,
            "speaker_pinyin": speaker_pinyin,
            "speaker_vi": "",
            "zh": zh_body,
            "pinyin": pinyin_body,
            "vi": "",
            "source": source,
            "confidence": "medium" if pinyin_body else "low",
        })
    return out


def parse_numbered_notes(text: str, source: str) -> list[dict[str, Any]]:
    lines = [l for l in clean_lines(text) if l]
    groups: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if re.match(r"^\d+[\.、)]\s*", line) and current:
            groups.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        groups.append(current)
    out = []
    for idx, g in enumerate(groups, start=1):
        title_line = g[0]
        title = re.sub(r"^\d+[\.、)]\s*", "", title_line).strip()
        vi_title = ""
        # Tach 2 cum trong ngoac kep neu co.
        quotes = re.findall(r"[“\"]([^”\"]+)[”\"]", title)
        if len(quotes) >= 2:
            title, vi_title = quotes[0], quotes[1]
        out.append({
            "id": f"n{idx:03d}",
            "no": idx,
            "title": title,
            "vi_title": vi_title,
            "content": "\n".join(g[1:]).strip(),
            "source": source,
            "confidence": "medium",
        })
    return out


def parse_generic_groups(text: str, source: str, prefix: str = "g") -> list[dict[str, Any]]:
    lines = [l for l in clean_lines(text) if l]
    groups: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if re.match(r"^\d+[\.、)]\s*", line) and current:
            groups.append(current)
            current = [line]
        else:
            current.append(line)
    if current:
        groups.append(current)
    out = []
    for idx, g in enumerate(groups, start=1):
        title = re.sub(r"^\d+[\.、)]\s*", "", g[0]).strip()
        out.append({
            "id": f"{prefix}{idx:03d}",
            "no": idx,
            "title": title[:120] if title else f"Mục {idx}",
            "content": "\n".join(g[1:] if len(g) > 1 else g).strip(),
            "source": source,
            "confidence": "medium",
        })
    return out


def parse_extension(text: str, source: str) -> list[dict[str, Any]]:
    items = parse_triple_items(text, source=source, allow_dialogue=False)
    if items:
        for idx, item in enumerate(items, start=1):
            item["id"] = f"e{idx:03d}"
        return items
    return parse_generic_groups(text, source, prefix="e")


def split_pdf_lessons(pdf_text: str) -> dict[Any, str]:
    lines = str(pdf_text or "").splitlines()
    lessons: dict[Any, list[str]] = {}
    current_key: Any = None
    current: list[str] = []
    pat = re.compile(r"^\.\s*(\d+)(?:\s*\+\s*(\d+)(?:\s*\+\s*(\d+))?(?:\s*\+\s*(\d+))?)?\s*\.\s*$")
    for raw in lines:
        line = normalize_line(raw)
        m = pat.match(line)
        if m:
            if current_key is not None:
                lessons[current_key] = current
            nums = [int(x) for x in m.groups() if x]
            current_key = tuple(nums) if len(nums) > 1 else nums[0]
            current = []
            continue
        if current_key is not None:
            current.append(raw)
    if current_key is not None:
        lessons[current_key] = current
    return {k: "\n".join(v) for k, v in lessons.items()}


def split_pdf_sections(text: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {k: [] for k in SECTION_ORDER}
    sections.update({"reading_zh": [], "reading_pinyin": [], "reading_vi": [], "main": []})
    current = "main"
    for line in clean_lines(text):
        key = SECTION_ALIASES.get(line.rstrip(":")) or SECTION_ALIASES.get(line)
        if key:
            current = key
            continue
        if line.startswith("Bản Tiếng Trung"):
            current = "reading_zh"; continue
        if line.startswith("Bản phiên âm"):
            current = "reading_pinyin"; continue
        if line.startswith("Bản dịch"):
            current = "reading_vi"; continue
        if line == "BÀI":
            continue
        sections.setdefault(current, []).append(line)
    return {k: "\n".join(v).strip() for k, v in sections.items() if "\n".join(v).strip()}


def parse_pdf_vocab(text: str) -> list[dict[str, Any]]:
    # Su dung parser table chung; PDF md co bang vo nen ket qua co the medium.
    rows = parse_vocab_from_tables(text)
    for r in rows:
        r["source"] = "pdf_md"
        if not r.get("vi"):
            r["confidence"] = "low"
    return rows


def parse_phrase_list(text: str, source: str) -> list[dict[str, Any]]:
    out = []
    lines = [l for l in clean_lines(text) if l]
    # Chu Han cach nhau: 圣 诞 快 乐; pinyin latin o cuoi.
    for line in lines:
        m = re.match(r"^(\d+)\.\s*(.+)$", line)
        if not m:
            continue
        no = int(m.group(1))
        rest = m.group(2).strip()
        chars = re.findall(r"[\u3400-\u9fff]", rest)
        if not chars:
            continue
        first_cjk = re.search(r"[\u3400-\u9fff]", rest)
        if not first_cjk:
            continue
        vi = rest[:first_cjk.start()].strip()
        tail = rest[first_cjk.start():].strip().rstrip(".")
        # Tach pinyin la phan sau chu Han cuoi.
        last_cjk_pos = max(m.end() for m in re.finditer(r"[\u3400-\u9fff]", tail))
        zh = re.sub(r"\s+", "", tail[:last_cjk_pos])
        pinyin = tail[last_cjk_pos:].strip()
        out.append({
            "id": f"p{len(out)+1:03d}",
            "no": no,
            "zh": zh,
            "pinyin": pinyin,
            "vi": vi,
            "source": source,
            "confidence": "high" if zh and pinyin and vi else "medium",
        })
    return out


def markdown_table_from_vocab(vocab: list[dict[str, Any]]) -> str:
    if not vocab:
        return ""
    lines = ["| STT | Tiếng Trung | Phiên âm | Từ loại | Nghĩa của từ |", "| --- | --- | --- | --- | --- |"]
    for item in vocab:
        lines.append(f"| {item.get('no','')} | {item.get('zh','')} | {item.get('pinyin','')} | {item.get('word_type','')} | {item.get('vi','')} |")
    return "\n".join(lines)


def markdown_table_from_items(items: list[dict[str, Any]], include_speaker: bool = False) -> str:
    if not items:
        return ""
    if include_speaker:
        lines = ["| STT | Người nói | Tiếng Trung | Phiên âm | Tiếng Việt |", "| --- | --- | --- | --- | --- |"]
        for idx, item in enumerate(items, start=1):
            sp = item.get("speaker_zh") or item.get("speaker_vi") or ""
            zh = f"{item.get('speaker_zh')}：{item.get('zh')}" if item.get("speaker_zh") else item.get("zh", "")
            py = f"{item.get('speaker_pinyin')}: {item.get('pinyin')}" if item.get("speaker_pinyin") else item.get("pinyin", "")
            vi = f"{item.get('speaker_vi')}: {item.get('vi')}" if item.get("speaker_vi") else item.get("vi", "")
            lines.append(f"| {idx} | {sp} | {zh} | {py} | {vi} |")
    else:
        lines = ["| STT | Tiếng Trung | Phiên âm | Tiếng Việt |", "| --- | --- | --- | --- |"]
        for idx, item in enumerate(items, start=1):
            lines.append(f"| {idx} | {item.get('zh','')} | {item.get('pinyin','')} | {item.get('vi','')} |")
    return "\n".join(lines)


def build_legacy_sections(data: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    sections = {k: [] for k in SECTION_ORDER}
    if data.get("vocabulary"):
        sections["vocabulary"].append({"text": markdown_table_from_vocab(data["vocabulary"])})
    if data.get("sentences"):
        sections["sentences"].append({"text": markdown_table_from_items(data["sentences"])})
    if data.get("dialogue"):
        sections["dialogue"].append({"text": markdown_table_from_items(data["dialogue"], include_speaker=True)})
    for key in ["notes", "extension", "grammar", "practice"]:
        if data.get(key):
            chunks = []
            for item in data[key]:
                title = item.get("title") or item.get("zh") or ""
                body_parts = [x for x in [item.get("pinyin"), item.get("vi"), item.get("content")] if x]
                chunks.append((title + "\n" + "\n".join(body_parts)).strip())
            sections[key].append({"text": "\n\n".join(chunks).strip()})
    return {k: v for k, v in sections.items() if v}


def determine_lesson_type(lesson_no: int, data: dict[str, Any], pdf_key: Any | None = None) -> str:
    if data.get("phrases"):
        return "phrase_list"
    if data.get("reading_blocks"):
        return "long_text"
    if lesson_no <= 7 and (data.get("sentences") or data.get("dialogue") or data.get("vocabulary")):
        return "full_course"
    # Nếu PDF bị gộp 8-11 nhưng MD có bài riêng, vẫn phân loại theo MD chính.
    if data.get("main_items") and not (data.get("vocabulary") or data.get("notes") or data.get("grammar")):
        return "topic_dialogue"
    return "standard_301_course"


def build_preview(data: dict[str, Any]) -> str:
    lines = []
    lines.append(f"# Bài {data['lesson_no']} · {data.get('title_zh') or data.get('title_raw')}")
    lines.append("")
    lines.append(f"- Type: `{data.get('lesson_type')}`")
    lines.append(f"- Source: {', '.join(x for x in data.get('sources', {}).values() if x)}")
    lines.append("")
    def add_items(title: str, items: list[dict[str, Any]], kind: str):
        if not items:
            return
        lines.append(f"## {title}")
        lines.append("")
        for i, item in enumerate(items, start=1):
            if kind == "dialogue":
                head = f"{item.get('speaker_zh','')}：{item.get('zh','')}" if item.get('speaker_zh') else item.get('zh','')
                py = f"{item.get('speaker_pinyin','')}: {item.get('pinyin','')}" if item.get('speaker_pinyin') else item.get('pinyin','')
                vi = f"{item.get('speaker_vi','')}: {item.get('vi','')}" if item.get('speaker_vi') else item.get('vi','')
                lines.append(f"{i}. {head}")
                if py: lines.append(f"   - {py}")
                if vi: lines.append(f"   - {vi}")
            else:
                lines.append(f"{i}. {item.get('zh','')}")
                if item.get('pinyin'): lines.append(f"   - {item.get('pinyin')}")
                if item.get('vi'): lines.append(f"   - {item.get('vi')}")
        lines.append("")
    add_items("Mẫu câu", data.get("sentences", []), "sentences")
    add_items("Đàm thoại", data.get("dialogue", []), "dialogue")
    add_items("Câu giao tiếp / main_items", data.get("main_items", []), "sentences")
    if data.get("vocabulary"):
        lines.append("## Từ vựng")
        lines.append("")
        lines.append("| STT | Từ | Pinyin | Loại | Nghĩa |")
        lines.append("| ---: | --- | --- | --- | --- |")
        for item in data["vocabulary"]:
            lines.append(f"| {item.get('no','')} | {item.get('zh','')} | {item.get('pinyin','')} | {item.get('word_type','')} | {item.get('vi','')} |")
        lines.append("")
    for key, title in [("notes", "Chú thích"), ("extension", "Mở rộng"), ("grammar", "Ngữ pháp / Ngữ âm"), ("practice", "Luyện tập")]:
        if data.get(key):
            lines.append(f"## {title}")
            lines.append("")
            for item in data[key]:
                lines.append(f"### {item.get('title') or item.get('zh') or item.get('id')}")
                body = item.get("content") or "\n".join(x for x in [item.get("pinyin"), item.get("vi")] if x)
                if body:
                    lines.append(body)
                lines.append("")
    if data.get("reading_blocks"):
        lines.append("## Bài đọc")
        for rb in data["reading_blocks"]:
            lines.append("### Tiếng Trung")
            lines.append(rb.get("zh", ""))
            lines.append("### Phiên âm")
            lines.append(rb.get("pinyin", ""))
            lines.append("### Dịch")
            lines.append(rb.get("vi", ""))
    if data.get("phrases"):
        lines.append("## Câu chúc / cụm từ")
        lines.append("| STT | Tiếng Việt | Tiếng Trung | Pinyin |")
        lines.append("| ---: | --- | --- | --- |")
        for item in data["phrases"]:
            lines.append(f"| {item.get('no','')} | {item.get('vi','')} | {item.get('zh','')} | {item.get('pinyin','')} |")
    lines.append("## Warnings")
    warnings = data.get("warnings", [])
    if warnings:
        for w in warnings:
            lines.append(f"- {w}")
    else:
        lines.append("- OK")
    lines.append("")
    return "\n".join(lines)


def read_text_file(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def load_md_lessons(source_root: Path) -> list[LessonSource]:
    folder = source_root / "MD_301_CAU_DAM_THOAI"
    zip_path = source_root / "MD_301_CAU_DAM_THOAI.zip"
    files: list[tuple[str, str]] = []
    if folder.exists():
        for path in folder.glob("*.md"):
            files.append((path.name, read_text_file(path)))
    elif zip_path.exists():
        with zipfile.ZipFile(zip_path) as zf:
            for info in zf.infolist():
                if info.is_dir() or not info.filename.lower().endswith(".md"):
                    continue
                name = Path(info.filename).name
                if name.startswith("_"):
                    continue
                text = zf.read(info).decode("utf-8", errors="ignore")
                files.append((name, text))
    else:
        raise FileNotFoundError(f"Không tìm thấy {folder} hoặc {zip_path}")
    lessons: list[LessonSource] = []
    for name, text in files:
        no, title_raw, title_zh, ordinal = clean_filename_title(Path(name).stem)
        if no <= 0:
            continue
        lessons.append(LessonSource(no, f"lesson-{no:03d}", title_raw, title_zh, ordinal, name, text))
    lessons.sort(key=lambda x: x.lesson_no)
    return lessons


def read_old_lessons_metadata(source_root: Path) -> dict[str, Any]:
    folder = source_root / "lessons-301"
    zip_path = source_root / "lessons-301.zip"
    meta: dict[str, Any] = {"available": False, "lessons": {}, "media": {}}
    try:
        if folder.exists():
            meta["available"] = True
            lj = folder / "lessons.json"
            if lj.exists():
                items = json.loads(lj.read_text(encoding="utf-8"))
                if isinstance(items, dict): items = items.get("lessons", [])
                for it in items:
                    meta["lessons"][it.get("lesson_id", "")] = it
            for lesson_dir in folder.glob("lesson-*"):
                if lesson_dir.is_dir():
                    files = [str(p.relative_to(lesson_dir)).replace("\\", "/") for p in lesson_dir.rglob("*") if p.is_file()]
                    meta["media"][lesson_dir.name] = [f for f in files if f.startswith("images/")]
        elif zip_path.exists():
            meta["available"] = True
            with zipfile.ZipFile(zip_path) as zf:
                names = zf.namelist()
                if "lessons-301/lessons.json" in names:
                    items = json.loads(zf.read("lessons-301/lessons.json").decode("utf-8", errors="ignore"))
                    if isinstance(items, dict): items = items.get("lessons", [])
                    for it in items:
                        meta["lessons"][it.get("lesson_id", "")] = it
                for name in names:
                    m = re.match(r"lessons-301/(lesson-\d{3})/(images)/(.+)$", name)
                    if m and not name.endswith("/"):
                        meta["media"].setdefault(m.group(1), []).append(f"{m.group(2)}/{m.group(3)}")
    except Exception as exc:
        meta["error"] = str(exc)
    return meta


def build_data_for_lesson(lesson: LessonSource, pdf_sections_by_no: dict[Any, dict[str, str]], old_meta: dict[str, Any]) -> dict[str, Any]:
    md_sections = split_markdown_sections(lesson.md_text)
    pdf_exact_sections = pdf_sections_by_no.get(lesson.lesson_no, {})
    warnings: list[str] = []

    # Source priority:
    # - Bài 1-7: PDF clean text uu tien cho sentences/dialogue/notes/extension/vocab vi co ban dich Viet ro.
    # - Bài 8-11: PDF bi gop, dung MD rieng tung bai.
    # - Bài 12-39: MD la lesson 301 goc; PDF la nguon tham khao khac, khong overwrite.
    # - Bài 40: giu MD chinh, neu PDF co phrase_list thi dua vao pdf_phrases/reference.
    use_pdf_primary = lesson.lesson_no <= 7

    sentences = []
    dialogue = []
    vocabulary = []
    notes = []
    extension = []
    grammar = []
    practice = []
    main_items = []
    reading_blocks = []
    phrases = []
    pdf_reference: dict[str, Any] = {}

    if use_pdf_primary and pdf_exact_sections:
        sentences = parse_triple_items(pdf_exact_sections.get("sentences", ""), "pdf_md", allow_dialogue=False)
        dialogue = parse_triple_items(pdf_exact_sections.get("dialogue", ""), "pdf_md", allow_dialogue=True)
        # Từ vựng ưu tiên Markdown vì bảng PDF bị vỡ dòng khá nhiều.
        # PDF vẫn có thể dùng fallback nếu MD không có.
        vocabulary = parse_vocab_from_tables(md_sections.get("vocabulary", "")) or parse_pdf_vocab(pdf_exact_sections.get("vocabulary", ""))
        notes = parse_numbered_notes(pdf_exact_sections.get("notes", ""), "pdf_md")
        extension = parse_extension(pdf_exact_sections.get("extension", ""), "pdf_md")
        grammar = parse_generic_groups(pdf_exact_sections.get("grammar", ""), "pdf_md", prefix="g")
        practice = parse_generic_groups(pdf_exact_sections.get("practice", ""), "pdf_md", prefix="p")
    else:
        sentences = parse_sentences_from_md_section(md_sections.get("sentences", ""), "lesson_md")
        dialogue = parse_dialogue_from_md_section(md_sections.get("dialogue", ""), "lesson_md")
        vocabulary = parse_vocab_from_tables(md_sections.get("vocabulary", ""))
        notes = parse_numbered_notes(md_sections.get("notes", ""), "lesson_md")
        extension = parse_extension(md_sections.get("extension", ""), "lesson_md")
        grammar = parse_generic_groups(md_sections.get("grammar", ""), "lesson_md", prefix="g")
        practice = parse_generic_groups(md_sections.get("practice", ""), "lesson_md", prefix="p")

    # Fallback neu MD/PDF section khong tach duoc.
    if not sentences and md_sections.get("sentences"):
        sentences = parse_sentences_from_md_section(md_sections.get("sentences", ""), "lesson_md")
    if not dialogue and md_sections.get("dialogue"):
        dialogue = parse_dialogue_from_md_section(md_sections.get("dialogue", ""), "lesson_md")
    if not vocabulary and md_sections.get("vocabulary"):
        vocabulary = parse_vocab_from_tables(md_sections.get("vocabulary", ""))

    # PDF exact cho 12-40 la reference khac; luu thong tin dem nhung khong overwrite lesson 301 goc.
    if pdf_exact_sections and not use_pdf_primary:
        pdf_reference["has_pdf_block"] = True
        pdf_reference["sentence_like_count"] = len(parse_triple_items(pdf_exact_sections.get("main", ""), "pdf_md", allow_dialogue=False))
        if lesson.lesson_no == 40:
            pdf_phrases = parse_phrase_list(pdf_exact_sections.get("main", ""), "pdf_md")
            if pdf_phrases:
                # Đây là dữ liệu tham khảo từ PDF khác hệ bài; không đưa vào main lesson để tránh lệch với Markdown.
                pdf_reference["phrases"] = pdf_phrases
                warnings.append("pdf_phrase_list_reference_available_not_used_as_main")

    # Reading blocks cho PDF lesson 21 neu duoc dung primary (hien khong primary), van de reference.
    if use_pdf_primary and pdf_exact_sections.get("reading_zh"):
        reading_blocks = [{
            "id": "r001",
            "title": lesson.title_zh or "Bài đọc",
            "zh": pdf_exact_sections.get("reading_zh", ""),
            "pinyin": pdf_exact_sections.get("reading_pinyin", ""),
            "vi": pdf_exact_sections.get("reading_vi", ""),
            "source": "pdf_md",
            "confidence": "high",
        }]

    # main_items: nếu bài không có section rõ nhưng có câu/cụm chính, lấy từ sentences/dialogue.
    if lesson.lesson_no >= 8 and not (notes or vocabulary or grammar) and sentences:
        main_items = sentences

    # PDF grouped 8-11 warning.
    grouped_key = None
    for key in pdf_sections_by_no:
        if isinstance(key, tuple) and lesson.lesson_no in key:
            grouped_key = key
            break
    if grouped_key:
        warnings.append(f"pdf_grouped_reference_{'+'.join(map(str, grouped_key))}_not_auto_split")

    expected_pdf_sentence_min = {1: 4, 2: 4, 3: 4, 4: 7, 5: 5, 6: 6, 7: 6}
    if use_pdf_primary and lesson.lesson_no in expected_pdf_sentence_min and len(sentences) < expected_pdf_sentence_min[lesson.lesson_no]:
        warnings.append(f"possible_missing_pdf_sentences_expected_{expected_pdf_sentence_min[lesson.lesson_no]}_got_{len(sentences)}")
    if use_pdf_primary and any(any(is_noise_line(str(x.get(field, ''))) for field in ['zh', 'pinyin', 'vi']) for x in sentences + dialogue):
        warnings.append("footer_noise_detected_in_structured_items")

    if not sentences:
        warnings.append("missing_sentences")
    if not dialogue:
        warnings.append("missing_dialogue")
    if not vocabulary:
        warnings.append("missing_vocabulary")
    if old_meta.get("media", {}).get(lesson.lesson_id):
        warnings.append("old_media_available_not_copied_by_default")

    data: dict[str, Any] = {
        "schema_version": "dialogue301_structured_v1",
        "lesson_id": lesson.lesson_id,
        "lesson_no": lesson.lesson_no,
        "title_raw": lesson.title_raw,
        "title": lesson.title_raw,
        "title_zh": lesson.title_zh,
        "title_vi": "",
        "lesson_type": "",
        "summary": {},
        "sentences": sentences,
        "dialogue": dialogue,
        "vocabulary": vocabulary,
        "notes": notes,
        "extension": extension,
        "grammar": grammar,
        "practice": practice,
        "main_items": main_items,
        "reading_blocks": reading_blocks,
        "phrases": phrases,
        "pdf_reference": pdf_reference,
        "media": {
            "images": [],
            "old_media_available_count": len(old_meta.get("media", {}).get(lesson.lesson_id, [])),
        },
        "sources": {
            "lesson_md": lesson.md_name,
            "pdf_md": "pdf-301-cau-dam-thoai.md" if pdf_exact_sections else "",
            "old_data": f"{lesson.lesson_id}/data.json" if lesson.lesson_id in old_meta.get("lessons", {}) else "",
        },
        "warnings": warnings,
        "raw_sections": md_sections,
    }

    data["lesson_type"] = determine_lesson_type(lesson.lesson_no, data, grouped_key)
    data["summary"] = {
        "sentence_count": len(sentences),
        "dialogue_count": len(dialogue),
        "vocabulary_count": len(vocabulary),
        "note_count": len(notes),
        "extension_count": len(extension),
        "grammar_count": len(grammar),
        "practice_count": len(practice),
        "main_item_count": len(main_items),
        "reading_block_count": len(reading_blocks),
        "phrase_count": len(phrases),
    }
    data["sections"] = build_legacy_sections(data)
    return data


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_debug_report(all_data: list[dict[str, Any]], source_files: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    lines = []
    lines.append("# Debug report - Dialogue 301 structured data")
    lines.append("")
    lines.append(f"Generated at: {datetime.now().isoformat(timespec='seconds')}")
    lines.append("")
    lines.append("## Source files")
    lines.append("")
    for k, v in source_files.items():
        lines.append(f"- {k}: `{v}`")
    lines.append("")
    lines.append("## Lesson summary")
    lines.append("")
    header = "| Bài | Title | Type | Sent | Dial | Vocab | Notes | Ext | Grammar | Practice | Main | Reading | Phrases | Warnings |"
    sep = "| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
    lines.extend([header, sep])
    report_lessons = []
    for d in all_data:
        s = d["summary"]
        warnings = d.get("warnings", [])
        warning_text = "OK" if not warnings else "; ".join(warnings)
        lines.append(
            f"| {d['lesson_no']} | {d.get('title_zh') or d.get('title_raw')} | {d.get('lesson_type')} | "
            f"{s['sentence_count']} | {s['dialogue_count']} | {s['vocabulary_count']} | {s['note_count']} | "
            f"{s['extension_count']} | {s['grammar_count']} | {s['practice_count']} | {s['main_item_count']} | "
            f"{s['reading_block_count']} | {s['phrase_count']} | {warning_text} |"
        )
        report_lessons.append({
            "lesson_no": d["lesson_no"],
            "lesson_id": d["lesson_id"],
            "title_zh": d.get("title_zh"),
            "lesson_type": d.get("lesson_type"),
            "summary": s,
            "warnings": warnings,
            "sources": d.get("sources", {}),
        })
    totals = {
        "lessons": len(all_data),
        "sentences": sum(d["summary"]["sentence_count"] for d in all_data),
        "dialogue": sum(d["summary"]["dialogue_count"] for d in all_data),
        "vocabulary": sum(d["summary"]["vocabulary_count"] for d in all_data),
        "warnings": sum(len(d.get("warnings", [])) for d in all_data),
    }
    report_json = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source_files": source_files,
        "totals": totals,
        "lessons": report_lessons,
    }
    lines.append("")
    lines.append("## Totals")
    lines.append("")
    for k, v in totals.items():
        lines.append(f"- {k}: {v}")
    lines.append("")
    return "\n".join(lines), report_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Build structured JSON data for 301 dialogue lessons.")
    parser.add_argument("--source-root", default=str(SOURCE_ROOT), help="Thu muc Tieng-Trung chua cac file nguon.")
    parser.add_argument("--web-root", default=str(WEB_ROOT), help="Thu muc tieng-trung-web.")
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR), help="Thu muc output lessons-301-v2.")
    parser.add_argument("--clean", action="store_true", default=True, help="Xoa output cu truoc khi tao.")
    args = parser.parse_args()

    source_root = Path(args.source_root)
    web_root = Path(args.web_root)
    out_dir = Path(args.out_dir)

    pdf_path = source_root / "pdf-301-cau-dam-thoai.md"
    if not pdf_path.exists():
        raise FileNotFoundError(f"Không tìm thấy {pdf_path}")

    if out_dir.exists() and args.clean:
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    md_lessons = load_md_lessons(source_root)
    pdf_text = pdf_path.read_text(encoding="utf-8", errors="ignore")
    pdf_blocks = split_pdf_lessons(pdf_text)
    pdf_sections_by_no = {k: split_pdf_sections(v) for k, v in pdf_blocks.items()}
    old_meta = read_old_lessons_metadata(source_root)

    all_data = []
    lesson_index = []
    for lesson in md_lessons:
        data = build_data_for_lesson(lesson, pdf_sections_by_no, old_meta)
        lesson_dir = out_dir / lesson.lesson_id
        lesson_dir.mkdir(parents=True, exist_ok=True)
        write_json(lesson_dir / "data.json", data)
        write_json(lesson_dir / "debug.json", {
            "lesson_id": lesson.lesson_id,
            "lesson_no": lesson.lesson_no,
            "detected_sections": list(data.get("raw_sections", {}).keys()),
            "summary": data.get("summary", {}),
            "warnings": data.get("warnings", []),
            "sources": data.get("sources", {}),
        })
        (lesson_dir / "preview.md").write_text(build_preview(data), encoding="utf-8")
        (lesson_dir / "raw.md").write_text(lesson.md_text, encoding="utf-8")
        all_data.append(data)
        lesson_index.append({
            "lesson_no": lesson.lesson_no,
            "lesson_id": lesson.lesson_id,
            "title": lesson.title_raw,
            "title_zh": lesson.title_zh,
            "lesson_type": data.get("lesson_type"),
            "data": f"{lesson.lesson_id}/data.json",
            "preview": f"{lesson.lesson_id}/preview.md",
        })

    write_json(out_dir / "lessons.json", lesson_index)
    source_files = {
        "pdf_md": str(pdf_path),
        "md_source": str(source_root / "MD_301_CAU_DAM_THOAI") if (source_root / "MD_301_CAU_DAM_THOAI").exists() else str(source_root / "MD_301_CAU_DAM_THOAI.zip"),
        "old_lessons": str(source_root / "lessons-301") if (source_root / "lessons-301").exists() else str(source_root / "lessons-301.zip"),
    }
    debug_md, debug_json = build_debug_report(all_data, source_files)
    (out_dir / "debug_report.md").write_text(debug_md, encoding="utf-8")
    write_json(out_dir / "debug_report.json", debug_json)

    print("Done: built structured Dialogue 301 data")
    print(f"- Lessons: {len(all_data)}")
    print(f"- Output: {out_dir}")
    print(f"- Debug: {out_dir / 'debug_report.md'}")


if __name__ == "__main__":
    main()

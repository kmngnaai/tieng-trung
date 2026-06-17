from __future__ import annotations

import json
import re
from collections import OrderedDict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "modules" / "pinyin" / "data"
PINYIN_JSON = DATA_DIR / "pinyin.json"

CJK_RE = re.compile(r"[\u4e00-\u9fff]")

COMMON_HANZI_SUPPLEMENT = (
    "的一是在不了有人和国中大为上个民我以要他时来用们生到作地于出就分对成会可主发年"
    "动同工也能下过子说产种面而方后多定行学法所如前者经十三之进着等部度家电力里如水"
    "化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外"
    "天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第"
    "向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员"
    "革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手"
    "角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规"
    "热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清美再采转更单风"
    "切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马"
    "节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书"
    "布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历"
    "市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派"
    "层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞"
)

SHADOWING_SEED = [
    ("你好。", "Nǐ hǎo.", "Xin chào."),
    ("我叫玛丽。", "Wǒ jiào Mǎlì.", "Tôi tên là Mary."),
    ("认识你，很高兴。", "Rènshi nǐ, hěn gāoxìng.", "Rất vui được biết bạn."),
    ("您贵姓？", "Nín guìxìng?", "Ông/bà họ gì ạ?"),
    ("你叫什么名字？", "Nǐ jiào shénme míngzi?", "Bạn tên là gì?"),
    ("他是学生。", "Tā shì xuésheng.", "Anh ấy là học sinh."),
    ("她不是老师。", "Tā bú shì lǎoshī.", "Cô ấy không phải là giáo viên."),
    ("我学习汉语。", "Wǒ xuéxí Hànyǔ.", "Tôi học tiếng Hán."),
    ("今天有汉语课。", "Jīntiān yǒu Hànyǔ kè.", "Hôm nay có tiết tiếng Hán."),
    ("明天没有课。", "Míngtiān méiyǒu kè.", "Ngày mai không có tiết học."),
    ("我回宿舍休息。", "Wǒ huí sùshè xiūxi.", "Tôi về ký túc xá nghỉ ngơi."),
    ("邮局离这儿远不远？", "Yóujú lí zhèr yuǎn bù yuǎn?", "Bưu điện cách đây xa không?"),
    ("在哪儿坐汽车？", "Zài nǎr zuò qìchē?", "Đón xe buýt ở đâu?"),
    ("他爸爸在商店工作。", "Tā bàba zài shāngdiàn gōngzuò.", "Bố anh ấy làm việc ở cửa hàng."),
    ("我有汉语书。", "Wǒ yǒu Hànyǔ shū.", "Tôi có sách tiếng Hán."),
    ("他没有哥哥。", "Tā méiyǒu gēge.", "Anh ấy không có anh trai."),
    ("你身体好吗？", "Nǐ shēntǐ hǎo ma?", "Bạn khỏe không?"),
    ("谁是大卫？", "Shéi shì Dàwèi?", "Ai là David?"),
    ("王兰在哪儿？", "Wáng Lán zài nǎr?", "Vương Lan ở đâu?"),
    ("这个商店好吗？", "Zhège shāngdiàn hǎo ma?", "Cửa hàng này tốt không?"),
]


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def item_key(item: dict) -> str:
    return str(item.get("safe") or item.get("pinyin") or "")


def build_required_syllables(pinyin_data: dict) -> dict:
    rows = []
    for rank, item in enumerate(pinyin_data.get("items", []), start=1):
        rows.append(
            OrderedDict(
                [
                    ("id", item_key(item)),
                    ("rank", rank),
                    ("pinyin", item.get("pinyin", "")),
                    ("safe", item.get("safe", "")),
                    ("initial", item.get("initial", "")),
                    ("initialLabel", item.get("initialLabel", "")),
                    ("final", item.get("final", "")),
                    ("chartFinal", item.get("chartFinal", "")),
                    ("tones", item.get("tones", [])),
                    ("audio", item.get("audio", {})),
                    ("hasAudio", bool(item.get("hasAudio"))),
                    ("rule", item.get("rule", "")),
                    ("hint", item.get("hint", "")),
                    ("ruleGroup", item.get("ruleGroup", "")),
                ]
            )
        )

    return OrderedDict(
        [
            ("version", "pinyin_required_syllables_v1"),
            ("title", "Âm tiết bắt buộc 400+"),
            ("source", "modules/pinyin/data/pinyin.json"),
            ("count", len(rows)),
            ("audioCount", sum(1 for row in rows if row["hasAudio"])),
            ("syllables", rows),
        ]
    )


def by_pinyin(items: list[dict]) -> dict[str, dict]:
    return {str(item.get("pinyin", "")): item for item in items}


def by_safe(items: list[dict]) -> dict[str, dict]:
    return {str(item.get("safe", "")): item for item in items}


def pick_names(items: list[dict], names: list[str]) -> list[str]:
    pinyin_map = by_pinyin(items)
    safe_map = by_safe(items)
    out = []
    for name in names:
        item = pinyin_map.get(name) or safe_map.get(name)
        if item and item_key(item) not in out:
            out.append(item_key(item))
    return out


def pick_where(items: list[dict], predicate, limit: int | None = None) -> list[str]:
    out = []
    for item in items:
        if predicate(item):
            key = item_key(item)
            if key and key not in out:
                out.append(key)
                if limit and len(out) >= limit:
                    break
    return out


def group(
    gid: str,
    title: str,
    description: str,
    goals: list[str],
    items: list[str],
    order: int,
) -> OrderedDict:
    return OrderedDict(
        [
            ("id", gid),
            ("title", title),
            ("contentType", "syllable"),
            ("order", order),
            ("description", description),
            ("goals", goals),
            ("items", items),
            ("count", len(items)),
        ]
    )


def build_learning_groups(items: list[dict]) -> dict:
    basic_finals = {"a", "o", "e", "i", "u", "ü", "v", "er"}
    compound_finals = {"ai", "ei", "ao", "ou", "ia", "ie", "iao", "iu", "ua", "uo", "uai", "ui", "üe", "ve"}
    nasal_finals = {"an", "en", "in", "un", "ün", "ang", "eng", "ing", "ong", "iang", "uang", "iong"}

    groups = [
        group(
            "intro",
            "Nhập môn Pinyin",
            "Làm quen cách nhìn một âm tiết: thanh mẫu, vận mẫu và thanh điệu.",
            ["Nhận ra âm đứng riêng", "Biết bấm nghe từng thanh", "Hiểu safe id và pinyin hiển thị"],
            pick_names(items, ["a", "o", "e", "i", "u", "er", "yi", "wu", "yu", "ma", "ba", "ren"]),
            1,
        ),
        group(
            "tones",
            "Thanh điệu",
            "Luyện 4 thanh trên các âm dễ nghe trước khi đi vào bảng ghép rộng.",
            ["Nghe phân biệt thanh 1-4", "Đọc lại cùng một âm ở nhiều thanh", "Ghi nhận âm sai vào ôn tập"],
            pick_names(items, ["ma", "ba", "pa", "bo", "shi", "ren", "hao", "xue", "liu", "gui", "yuan", "zhong"]),
            2,
        ),
        group(
            "single-finals",
            "Nguyên âm đơn",
            "Tập trung vận mẫu đơn và âm đứng riêng.",
            ["Đọc chắc a/o/e/i/u/ü", "Nhận ra er", "Nghe âm đứng riêng y/w"],
            pick_where(items, lambda x: x.get("initial", "") in {"", "y", "w"} and x.get("chartFinal") in basic_finals, 40),
            3,
        ),
        group(
            "easy-initials",
            "Thanh mẫu dễ",
            "Các thanh mẫu nền tảng, dễ đặt khẩu hình và dễ ghép.",
            ["Luyện b p m f", "Luyện d t n l", "Luyện g k h"],
            pick_where(
                items,
                lambda x: x.get("initial") in {"b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h"}
                and x.get("chartFinal") in {"a", "o", "e", "i", "u", "ai", "ei", "ao", "ou"},
                96,
            ),
            4,
        ),
        group(
            "aspiration",
            "Thanh mẫu bật hơi",
            "Đối chiếu từng cặp bật hơi và không bật hơi.",
            ["Phân biệt b/p", "Phân biệt d/t", "Phân biệt g/k", "Phân biệt z/c, zh/ch, j/q"],
            pick_names(items, ["ba", "pa", "bo", "po", "da", "ta", "de", "te", "ge", "ke", "zi", "ci", "zhi", "chi", "ji", "qi"]),
            5,
        ),
        group(
            "jqx",
            "j q x",
            "Nhóm mặt lưỡi, đi mạnh với i và ü.",
            ["Nghe j/q/x", "Nhận ra q bật hơi", "Ôn quy tắc j/q/x + ü"],
            pick_where(items, lambda x: x.get("initial") in {"j", "q", "x"}),
            6,
        ),
        group(
            "zcs",
            "z c s",
            "Nhóm đầu lưỡi trước, không cong lưỡi.",
            ["Phân biệt z/c/s", "So sánh với zh/ch/sh", "Luyện -i đặc biệt"],
            pick_where(items, lambda x: x.get("initial") in {"z", "c", "s"}),
            7,
        ),
        group(
            "zh-ch-sh-r",
            "zh ch sh r",
            "Nhóm đầu lưỡi sau/cong lưỡi.",
            ["Giữ khẩu hình cong lưỡi nhẹ", "Phân biệt với z/c/s", "Luyện zhi/chi/shi/ri"],
            pick_where(items, lambda x: x.get("initial") in {"zh", "ch", "sh", "r"}),
            8,
        ),
        group(
            "basic-finals",
            "Vận mẫu cơ bản",
            "Các vận mẫu lõi xuất hiện nhiều trong bảng ghép.",
            ["Đọc chắc a/o/e/i/u", "Nghe ai/ei/ao/ou", "Nhận ra âm đứng riêng"],
            pick_where(items, lambda x: x.get("chartFinal") in {"a", "o", "e", "i", "u", "ai", "ei", "ao", "ou"}, 160),
            9,
        ),
        group(
            "compound-finals",
            "Vận mẫu kép",
            "Nhóm vận mẫu ghép từ i/u/ü với a/e/o.",
            ["Luyện ia/ie/iao/iu", "Luyện ua/uo/uai/ui", "Luyện üe"],
            pick_where(items, lambda x: x.get("chartFinal") in compound_finals, 180),
            10,
        ),
        group(
            "nasal-finals",
            "Vận mẫu mũi n/ng",
            "Luyện đối chiếu âm mũi trước -n và âm mũi sau -ng.",
            ["Phân biệt an/ang", "Phân biệt en/eng", "Phân biệt in/ing", "Không nuốt đuôi -ng"],
            pick_where(items, lambda x: x.get("chartFinal") in nasal_finals or str(x.get("chartFinal", "")).endswith(("n", "ng"))),
            11,
        ),
        group(
            "umlaut-special",
            "Âm ü đặc biệt",
            "Các trường hợp viết u nhưng hiểu là ü, và n/l + ü viết rõ.",
            ["Nhận ra ju/qu/xu", "Nhận ra yu/yue/yuan/yun", "Không nhầm lu với lü"],
            pick_where(
                items,
                lambda x: "ü" in str(x.get("pinyin", ""))
                or x.get("ruleGroup") == "umlaut"
                or x.get("pinyin") in {"ju", "qu", "xu", "jue", "que", "xue", "yuan", "yun", "yu", "yue"},
            ),
            12,
        ),
        group(
            "required-400",
            "Âm tiết bắt buộc 400+",
            "Toàn bộ âm tiết Pinyin hiện có trong module, giữ nguyên đường dẫn audio cũ.",
            ["Đi hết 400+ âm tiết", "Nghe đủ các âm có audio", "Dùng làm nguồn quiz và ôn tập tự động"],
            [item_key(x) for x in items],
            13,
        ),
        OrderedDict(
            [
                ("id", "hanzi-1000"),
                ("title", "Chữ Hán 1000"),
                ("contentType", "hanzi"),
                ("order", 14),
                ("description", "Danh sách 1000 chữ Hán nền tảng để nhận mặt chữ sau khi đã chắc Pinyin."),
                ("goals", ["Nhìn chữ đọc âm", "Đánh dấu đã nhớ", "Gom chữ chưa học vào ôn tập"]),
                ("dataFile", "hanzi_1000.json"),
            ]
        ),
        OrderedDict(
            [
                ("id", "shadowing"),
                ("title", "Shadowing"),
                ("contentType", "shadowing"),
                ("order", 15),
                ("description", "Câu ngắn để nghe, đọc nhại và tự đánh dấu đã nhại."),
                ("goals", ["Đọc thành câu", "Giữ nhịp thanh điệu", "Theo dõi câu chưa nhại"]),
                ("dataFile", "shadowing_sentences.json"),
            ]
        ),
    ]

    review_groups = [
        ("not_started", "Chưa học", "Chưa có dấu vết học trong localStorage."),
        ("due", "Cần ôn", "Có lỗi, đã học nhưng chưa thành thạo, hoặc đã đến hạn ôn."),
        ("wrong_many", "Sai nhiều", "Số lỗi đạt ngưỡng cần xử lý riêng."),
        ("unheard", "Chưa nghe", "Âm/câu chưa từng bấm nghe."),
        ("unshadowed", "Chưa nhại", "Âm/câu chưa được đánh dấu đọc nhại."),
        ("unquizzed", "Chưa làm quiz", "Âm tiết chưa có lượt quiz nào."),
        ("mastered", "Đã thành thạo", "Đã nghe, học, quiz ổn và ít lỗi."),
    ]

    return OrderedDict(
        [
            ("version", "pinyin_groups_v1"),
            ("title", "Pinyin - nhóm cần học và nhóm cần ôn"),
            ("model", "learning_groups_and_auto_review"),
            ("defaultLearningGroup", "intro"),
            ("defaultReviewGroup", "not_started"),
            ("learningGroups", groups),
            (
                "reviewGroups",
                [
                    OrderedDict(
                        [
                            ("id", gid),
                            ("title", title),
                            ("contentType", "auto"),
                            ("source", "localStorage"),
                            ("ruleId", gid),
                            ("description", desc),
                        ]
                    )
                    for gid, title, desc in review_groups
                ],
            ),
        ]
    )


def collect_repo_hanzi() -> list[str]:
    chars: list[str] = []
    seen: set[str] = set()
    skip_parts = {".git", ".codegraph", "audio"}
    generated_names = {
        "pinyin_groups.json",
        "required_syllables.json",
        "hanzi_1000.json",
        "shadowing_sentences.json",
        "review_rules.json",
    }
    self_path = Path(__file__).resolve()
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if path.resolve() == self_path:
            continue
        if path.parent == DATA_DIR and path.name in generated_names:
            continue
        if any(part in skip_parts for part in path.parts):
            continue
        if path.suffix.lower() not in {".json", ".md", ".html", ".js"}:
            continue
        if path.name == "hanzi_1000.json":
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in CJK_RE.finditer(text):
            ch = match.group(0)
            if ch not in seen:
                seen.add(ch)
                chars.append(ch)
    return chars


def build_hanzi_1000() -> dict:
    chars = collect_repo_hanzi()
    source_count = len(chars)
    for ch in COMMON_HANZI_SUPPLEMENT:
        if CJK_RE.fullmatch(ch) and ch not in chars:
            chars.append(ch)
        if len(chars) >= 1000:
            break

    codepoint = 0x4E00
    while len(chars) < 1000:
        ch = chr(codepoint)
        if CJK_RE.fullmatch(ch) and ch not in chars:
            chars.append(ch)
        codepoint += 1

    items = []
    for idx, ch in enumerate(chars[:1000], start=1):
        source = "repo" if idx <= source_count else "common_supplement"
        items.append(
            OrderedDict(
                [
                    ("id", f"hanzi-{idx:04d}"),
                    ("rank", idx),
                    ("char", ch),
                    ("source", source),
                    ("pinyin", ""),
                    ("meaning", ""),
                    ("notes", "Bổ sung pinyin/nghĩa sau khi có từ điển nội bộ."),
                ]
            )
        )

    return OrderedDict(
        [
            ("version", "hanzi_1000_v1"),
            ("title", "Chữ Hán 1000"),
            ("source", "repo_text_plus_common_supplement"),
            ("count", len(items)),
            ("repoUniqueCount", source_count),
            ("items", items),
        ]
    )


def build_shadowing_sentences() -> dict:
    rows = []
    for idx, (zh, pinyin, vi) in enumerate(SHADOWING_SEED, start=1):
        rows.append(
            OrderedDict(
                [
                    ("id", f"shadow-{idx:03d}"),
                    ("rank", idx),
                    ("zh", zh),
                    ("pinyin", pinyin),
                    ("vi", vi),
                    ("level", "starter" if idx <= 10 else "basic"),
                    ("focus", ["tone-flow", "clear-initials"] if idx <= 10 else ["sentence-rhythm", "shadowing"]),
                ]
            )
        )
    return OrderedDict(
        [
            ("version", "shadowing_sentences_v1"),
            ("title", "Shadowing Pinyin"),
            ("count", len(rows)),
            ("sentences", rows),
        ]
    )


def build_review_rules() -> dict:
    return OrderedDict(
        [
            ("version", "pinyin_review_rules_v1"),
            ("storageKey", "tiengtrung_pinyin_v12_state"),
            (
                "thresholds",
                OrderedDict(
                    [
                        ("wrongManyMin", 3),
                        ("dueAfterHours", 24),
                        ("masteredQuizCorrectMin", 3),
                        ("masteredWrongMax", 0),
                    ]
                ),
            ),
            (
                "rules",
                [
                    OrderedDict(
                        [
                            ("id", "not_started"),
                            ("title", "Chưa học"),
                            ("description", "Không có learned/heard/shadowed/quiz/mastered trong localStorage."),
                        ]
                    ),
                    OrderedDict(
                        [
                            ("id", "due"),
                            ("title", "Cần ôn"),
                            ("description", "Có lỗi, chưa đủ điều kiện thành thạo, hoặc đã qua hạn ôn."),
                        ]
                    ),
                    OrderedDict(
                        [
                            ("id", "wrong_many"),
                            ("title", "Sai nhiều"),
                            ("description", "wrong >= thresholds.wrongManyMin."),
                        ]
                    ),
                    OrderedDict(
                        [
                            ("id", "unheard"),
                            ("title", "Chưa nghe"),
                            ("description", "heard chưa được ghi nhận."),
                        ]
                    ),
                    OrderedDict(
                        [
                            ("id", "unshadowed"),
                            ("title", "Chưa nhại"),
                            ("description", "shadowed chưa được ghi nhận."),
                        ]
                    ),
                    OrderedDict(
                        [
                            ("id", "unquizzed"),
                            ("title", "Chưa làm quiz"),
                            ("description", "quizAttempts = 0."),
                        ]
                    ),
                    OrderedDict(
                        [
                            ("id", "mastered"),
                            ("title", "Đã thành thạo"),
                            ("description", "mastered=true hoặc đạt đủ learned/heard/quizCorrect và ít lỗi."),
                        ]
                    ),
                ],
            ),
        ]
    )


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    pinyin_data = read_json(PINYIN_JSON)
    items = pinyin_data.get("items", [])

    outputs = {
        "required_syllables.json": build_required_syllables(pinyin_data),
        "pinyin_groups.json": build_learning_groups(items),
        "hanzi_1000.json": build_hanzi_1000(),
        "shadowing_sentences.json": build_shadowing_sentences(),
        "review_rules.json": build_review_rules(),
    }

    for filename, data in outputs.items():
        write_json(DATA_DIR / filename, data)

    print("Generated Pinyin learning data:")
    for filename, data in outputs.items():
        if "count" in data:
            metric = data["count"]
        elif "learningGroups" in data:
            metric = len(data["learningGroups"])
        elif "rules" in data:
            metric = len(data["rules"])
        else:
            metric = len(data)
        print(f"- {filename}: {metric}")


if __name__ == "__main__":
    main()

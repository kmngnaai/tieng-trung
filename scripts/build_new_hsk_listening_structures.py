#!/usr/bin/env python3
"""Build curated New HSK 1 listening structures from existing source examples.

The script never concatenates unrelated examples into a fake source record. It only
selects existing example sentences, records them as source definitions, and groups
selected sentences into manually reviewed dialogue/passage practice sequences.
Lesson 2 keeps its existing richer authored sample.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HSK_PATH = ROOT / "modules/hanzi-stroke/data/learning/hsk/hsk_1.json"
OUT_DIR = ROOT / "modules/listening/data/structures/new-hsk"
MANIFEST_PATH = OUT_DIR / "manifest.json"

PUNCT_RE = re.compile(r"[\s\u3000，,。.!！?？；;：:“”\"'‘’—–-]+")


def key(value: str) -> str:
    return PUNCT_RE.sub("", str(value or "")).lower()


CURATED = {
    1: {
        "dialogue_title": "Chào hỏi trong lớp",
        "dialogue": ["你们好", "大家好", "谢谢你的帮助", "不客气，这是我应该做的", "再见，明天见", "老师再见"],
        "passage_title": "Lớp học thân thiện",
        "passage": ["她是我的中文老师。", "老师对我们很好。", "我们在一个班，是同学。", "同学之间要互相帮助。"],
    },
    3: {
        "dialogue_title": "Làm quen qua điện thoại",
        "dialogue": ["喂，你好", "喂？你是谁？", "你是哪国人？", "我来自中国", "你去学校吗？", "我学中文"],
        "passage_title": "Tôi học tiếng Trung",
        "passage": ["我来自中国", "中国很大", "中国菜很好吃", "我学中文", "中文很难"],
    },
    4: {
        "dialogue_title": "Nói về gia đình và tuổi",
        "dialogue": ["几个人？", "家里有三个人", "你多大岁数？", "我今年二十岁", "你呢", "你多大？我二十几岁"],
        "passage_title": "Gia đình tôi",
        "passage": ["我爱我家", "家里有三个人", "我妈妈是老师。", "爸爸在工作", "我有一个妹妹"],
    },
    5: {
        "dialogue_title": "Hôm nay làm gì",
        "dialogue": ["今天星期几？", "今天是星期一", "你今天做什么？", "我正在做作业", "下班了吗？", "我六点下班"],
        "passage_title": "Ngày nghỉ cuối tuần",
        "passage": ["星期日是休息日", "周末在家休息", "我妈妈喜欢做饭", "一起做饭吧", "饺子很好吃"],
    },
    6: {
        "dialogue_title": "Bữa tối và đường đi",
        "dialogue": ["你觉得好吃吗？", "这个菜很好吃。", "我们晚上一起吃晚饭。", "晚饭准备好了。", "你怎么去？", "我叫了一辆出租车"],
        "passage_title": "Bữa ăn trong ngày",
        "passage": ["我每天早上都喝牛奶。", "我吃米饭", "妈妈在做晚饭。", "晚饭准备好了。", "我们晚上一起吃晚饭。"],
    },
    7: {
        "dialogue_title": "Hỏi giờ học và giờ làm",
        "dialogue": ["现在几点？", "现在三点", "你几点上班？", "我每天八点上班", "我们几点下课？", "马上就要下课了。"],
        "passage_title": "Lịch một ngày",
        "passage": ["我每天八点上班", "我上午去上班", "我下午去学校", "我晚上在家", "我们去电影院看电影吧"],
    },
    8: {
        "dialogue_title": "Tìm đồ và chỉ đường",
        "dialogue": ["你看见我的钥匙了吗？", "我什么都看不见", "请到这里来", "我到了", "请在外边等", "请往前走"],
        "passage_title": "Công việc ở bệnh viện",
        "passage": ["他是医生", "这是我的工作", "医院里有很多病人", "医生在治疗病人", "照顾病人很重要", "这位病人需要休息"],
    },
    9: {
        "dialogue_title": "Bạn bè và bài hát",
        "dialogue": ["那是谁", "他是我的好朋友", "你会唱这首歌吗?", "我们一起唱吧", "这首歌很好听。", "她唱歌很好听"],
        "passage_title": "Học tập và bạn bè",
        "passage": ["他在北京大学读书。", "我在学习中文", "学习很重要", "每天晚上我都读书。", "朋友之间要互相帮助"],
    },
    10: {
        "dialogue_title": "Mua hoa quả",
        "dialogue": ["这个多少钱？", "一百元", "便宜还是贵", "很贵", "你喜欢这些水果吗？", "我喜欢吃苹果。"],
        "passage_title": "Trong cửa hàng hoa quả",
        "passage": ["我喜欢吃水果", "在商店买东西", "水果很新鲜", "一斤苹果", "这家店的东西很便宜。", "售货员态度很好。"],
    },
    11: {
        "dialogue_title": "Hỏi điều chưa biết",
        "dialogue": ["你知道吗？", "我不知道", "你住在哪里？", "我住在那里。"],
        "passage_title": "Cuộc sống đại học",
        "passage": ["这是北京大学。", "我在大学读书。", "他是大学生。", "很多大学生喜欢运动。", "我喜欢读书", "他在学校学习"],
    },
    12: {
        "dialogue_title": "Thời tiết và sức khỏe",
        "dialogue": ["北京的天气怎么样？", "今天很冷", "吃药了吗", "这是中药", "为什么会生病？", "生病要休息"],
        "passage_title": "Thời tiết thay đổi",
        "passage": ["今天天气很好", "天气预报说有雨", "外面下雨了", "下雪了", "我觉得今天很冷。"],
    },
    13: {
        "dialogue_title": "Mời khách uống trà",
        "dialogue": ["请问，先生？", "王先生，你好", "我可以进去吗", "请进", "请喝茶", "我喜欢喝茶"],
        "passage_title": "Bữa sáng đơn giản",
        "passage": ["我吃早饭了。", "我要吃鸡蛋", "我吃面包", "我喜欢喝茶", "请坐下休息一下。"],
    },
    14: {
        "dialogue_title": "Học tiếng Trung",
        "dialogue": ["你会说汉语吗？", "我在学习汉语", "几点上学？", "我每天早上上学。", "中午吃什么？", "我中午吃饭"],
        "passage_title": "Một học sinh học chữ Hán",
        "passage": ["我是一个中学生。", "我每天早上上学。", "我在学习汉语", "我会写汉字。", "汉字很有意思。", "我喜欢汉语"],
    },
    15: {
        "dialogue_title": "Hẹn ở sân bay",
        "dialogue": ["几点？", "我每天早上六点起床", "我去机场接朋友", "我们去机场送朋友。", "机场离这里很远。", "坐飞机去"],
        "passage_title": "Đi Bắc Kinh bằng máy bay",
        "passage": ["我想去北京旅游", "坐飞机去", "机场离这里很远。", "我去机场接朋友", "我们去机场送朋友。", "飞机很快"],
    },
}


def main() -> None:
    level = json.loads(HSK_PATH.read_text(encoding="utf-8"))
    units: dict[str, dict] = {}
    for item in level.get("items", []):
        for route in item.get("routes", []):
            if route.get("libraryId") != "new_hsk" or route.get("levelId") != "new-hsk-1" or route.get("sectionType") != "lesson":
                continue
            unit = units.setdefault(route["sectionId"], {
                "route": route,
                "examples": {},
            })
            for example in item.get("examples", []):
                text = str(example.get("chinese") or "").strip()
                if text:
                    unit["examples"].setdefault(key(text), text)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_units = []
    missing = []
    for unit_id, unit in sorted(units.items(), key=lambda pair: int(pair[1]["route"].get("sectionOrder") or 0)):
        route = unit["route"]
        order = int(route.get("sectionOrder") or 0)
        filename = f"new-hsk-1-lesson-{order:02d}.json"
        if order == 2:
            existing = OUT_DIR / filename
            if not existing.exists():
                raise SystemExit(f"Missing preserved lesson 2 structure: {existing}")
            manifest_units.append({
                "unitId": unit_id,
                "structureFile": filename,
                "status": "sample-complete",
                "label": f"Bài {order} · {route.get('sectionTitle') or ''}",
            })
            continue

        spec = CURATED.get(order)
        if not spec:
            missing.append(f"lesson {order}: missing curated spec")
            continue
        unique_texts = []
        for text in spec["dialogue"] + spec["passage"]:
            source_text = unit["examples"].get(key(text))
            if not source_text:
                missing.append(f"lesson {order}: source sentence not found: {text}")
                continue
            if source_text not in unique_texts:
                unique_texts.append(source_text)
        definitions = []
        ref_by_key = {}
        for index, text in enumerate(unique_texts, start=1):
            ref = f"nhsk1-l{order:02d}-s{index:02d}"
            definitions.append({
                "id": ref,
                "originType": "source",
                "sourceText": text,
            })
            ref_by_key[key(text)] = ref

        dialogue_refs = [ref_by_key.get(key(text)) for text in spec["dialogue"]]
        passage_refs = [ref_by_key.get(key(text)) for text in spec["passage"]]
        if any(ref is None for ref in dialogue_refs + passage_refs):
            continue
        structure = {
            "schemaVersion": 1,
            "sourceId": "new-hsk",
            "levelId": "new-hsk-1",
            "unitId": unit_id,
            "title": route.get("sectionTitle") or "",
            "titleZh": route.get("sectionTitleZh") or "",
            "status": "curated-complete",
            "rules": {
                "audio": "user-mp3-or-device-tts",
                "defaultChoiceCount": 4,
                "hardChoiceCount": 5,
                "grammarIncludedInAllSentences": True,
            },
            "sentenceDefinitions": definitions,
            "dialogues": [{
                "id": f"nhsk1-l{order:02d}-dialogue-01",
                "title": spec["dialogue_title"],
                "originType": "curated",
                "turns": [
                    {"id": f"turn-{index:02d}", "speaker": "A" if index % 2 else "B", "sentenceRef": ref}
                    for index, ref in enumerate(dialogue_refs, start=1)
                ],
            }],
            "passages": [{
                "id": f"nhsk1-l{order:02d}-passage-01",
                "title": spec["passage_title"],
                "originType": "curated",
                "sentenceRefs": passage_refs,
            }],
        }
        (OUT_DIR / filename).write_text(json.dumps(structure, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest_units.append({
            "unitId": unit_id,
            "structureFile": filename,
            "status": "curated-complete",
            "label": f"Bài {order} · {route.get('sectionTitle') or ''}",
        })

    if missing:
        raise SystemExit("\n".join(missing))
    manifest = {
        "schemaVersion": 1,
        "sourceId": "new-hsk",
        "levelId": "new-hsk-1",
        "units": manifest_units,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(manifest_units)} New HSK 1 listening structures.")


if __name__ == "__main__":
    main()

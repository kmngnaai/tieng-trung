#!/usr/bin/env python3
from __future__ import annotations
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'modules' / 'pinyin'
DATA = MODULE / 'data'
OUTPUT = DATA / 'audio_audit.json'
TONE_MAP = {
    'ā': ('a',1),'á':('a',2),'ǎ':('a',3),'à':('a',4),
    'ē': ('e',1),'é':('e',2),'ě':('e',3),'è':('e',4),
    'ī': ('i',1),'í':('i',2),'ǐ':('i',3),'ì':('i',4),
    'ō': ('o',1),'ó':('o',2),'ǒ':('o',3),'ò':('o',4),
    'ū': ('u',1),'ú':('u',2),'ǔ':('u',3),'ù':('u',4),
    'ǖ': ('ü',1),'ǘ':('ü',2),'ǚ':('ü',3),'ǜ':('ü',4),
    'ü': ('ü',0),'Ü':('ü',0),'v':('ü',0),'V':('ü',0),
}


def load(name: str):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def parse(text):
    plain=[]; tone=0
    for ch in str(text or ''):
        if ch in TONE_MAP:
            base, value=TONE_MAP[ch]; plain.append(base); tone=tone or value
        elif ch.isascii() and ch.isalpha(): plain.append(ch.lower())
    return ''.join(plain).replace('v','ü'), tone


pinyin=load('pinyin.json')
required=load('required_syllables.json')
shadow=load('shadowing_sentences.json')
fallbacks=load('pinyin_hanzi_fallbacks.json')
items={row['safe']:row for row in pinyin['items']}
by_plain={parse(row['pinyin'])[0]:row for row in pinyin['items']}
keys=sorted(by_plain, key=len, reverse=True)

missing_paths=[]; bad_names=[]; paths=[]
for row in pinyin['items']:
    for tone, rel in (row.get('audio') or {}).items():
        path=MODULE / rel
        paths.append(path)
        if not path.is_file() or path.stat().st_size < 1000: missing_paths.append(f"{row['safe']}:{tone}:{rel}")
        expected=f"{row['safe']}{tone}.mp3"
        if path.name != expected: bad_names.append(f"{row['safe']}:{tone}:{path.name}!={expected}")


def probe(path):
    result=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(path)],capture_output=True,text=True)
    if result.returncode: return str(path.relative_to(ROOT)), result.stderr.strip() or 'ffprobe failed'
    try:
        duration=float(result.stdout.strip())
        if duration <= 0.05 or duration > 8: return str(path.relative_to(ROOT)), f'duration={duration:.3f}'
    except Exception: return str(path.relative_to(ROOT)), f'bad duration: {result.stdout!r}'
    return None


with ThreadPoolExecutor(max_workers=8) as pool:
    probe_errors=[x for x in pool.map(probe, paths) if x]


def segment_token(token):
    plain, _=parse(token)
    result=[]; index=0
    while index < len(plain):
        key=next((candidate for candidate in keys if plain.startswith(candidate,index)),None)
        if not key: return False, f'không nhận diện {token}'
        row=by_plain[key]
        raw=token[index:index+len(key)]
        _, tone=parse(raw)
        if not tone: return False, f'{key} không có thanh xác định'
        src=(row.get('audio') or {}).get(str(tone))
        if not src: return False, f'thiếu MP3 {row["safe"]} thanh {tone}'
        result.append((row['safe'],tone,src)); index += len(key)
    return True, result


shadow_ready=[]; shadow_blocked=[]
for sentence in shadow.get('sentences',[]):
    direct=sentence.get('audio') or sentence.get('audioSrc') or sentence.get('src') or sentence.get('url') or sentence.get('audioUrl') or sentence.get('mp3')
    if direct:
        shadow_ready.append({'id':sentence['id'],'type':'direct'}); continue
    reasons=[]
    for token in re.sub(r'[，。！？；：,.!?;:]',' ',sentence.get('pinyin','')).split():
        ok, detail=segment_token(token)
        if not ok: reasons.append(detail)
    if reasons: shadow_blocked.append({'id':sentence['id'],'reasons':reasons})
    else: shadow_ready.append({'id':sentence['id'],'type':'composed-strict'})

missing_review=[]
verified_fallback_count=0
needs_verification_count=0
for row in required.get('syllables',[]):
    if row.get('hasAudio'): continue
    fallback=(fallbacks.get('items') or {}).get(row['safe'],{})
    status=fallback.get('status','missing')
    tones=[]
    for tone, entry in (fallback.get('tones') or {}).items():
        if entry.get('verified') and entry.get('hanzi'):
            tones.append({'tone':int(tone),'hanzi':entry['hanzi'],'pinyin':entry.get('pinyin',''),'ttsText':entry.get('ttsText',''),'source':entry.get('source','')})
    if status == 'verified' and tones: verified_fallback_count += 1
    elif status == 'needs_verification': needs_verification_count += 1
    missing_review.append({
        'safe':row['safe'], 'pinyin':row['pinyin'], 'status':status,
        'verifiedTones':tones, 'reason':fallback.get('reason','')
    })

exact_syllables=sum(1 for row in required.get('syllables',[]) if row.get('hasAudio'))
broken_count=len(missing_paths)+len(bad_names)+len(probe_errors)
report={
    'version':'pinyin-audio-audit.v2',
    'syllablesTotal':len(required.get('syllables',[])),
    'exactMp3Syllables':exact_syllables,
    'verifiedDeviceFallbackSyllables':verified_fallback_count,
    'availableSyllables':exact_syllables+verified_fallback_count,
    'needsVerificationSyllables':needs_verification_count,
    'referencedMp3':len(paths),
    'missingOrTiny':missing_paths,
    'filenameMismatch':bad_names,
    'decodeOrDurationErrors':probe_errors,
    'brokenCount':broken_count,
    'missingSyllableReview':missing_review,
    'shadowingTotal':len(shadow.get('sentences',[])),
    'shadowingReady':shadow_ready,
    'shadowingBlocked':shadow_blocked,
    'policy':{
        'quiz':'exact MP3 only',
        'sequentialPlayback':'exact MP3 only',
        'directFallback':'verified Hanzi with zh-CN device voice only',
        'latinTts':False,
        'crossToneFallback':False,
        'shadowingRequiresAllExactSegments':True,
    }
}
OUTPUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))

expected_missing={'den','tei','nou','nve','kei','chua','rua'}
actual_missing={row['safe'] for row in missing_review}
if actual_missing != expected_missing:
    raise SystemExit(f'Unexpected seven-audio review set: {sorted(actual_missing)}')
if missing_paths or bad_names or probe_errors:
    raise SystemExit(1)

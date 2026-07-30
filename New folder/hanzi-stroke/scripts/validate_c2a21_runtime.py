#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from urllib.request import urlopen

SAMPLES = ['一','青','清','亲人','学习','老师','难过','中国']

def load_json(path: Path):
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)

def validate_fs(root: Path):
    base = root / 'modules/hanzi-stroke/data/learning/unified-lookup/all-sources'
    idx = load_json(base/'unified-target-index.json').get('targets', {})
    search = load_json(base/'search-index.json').get('items', [])
    errors=[]; bucket_cache={}; records_total=0
    files=sorted((base/'records').glob('*.json'))
    if len(files)!=256: errors.append(f'Expected 256 buckets, got {len(files)}')
    for p in files:
        payload=load_json(p)
        recs=payload.get('records', {})
        bucket_cache[p.stem.upper()]=recs
        records_total += len(recs)
    for target,bucket in idx.items():
        b=str(bucket).upper()
        if b not in bucket_cache: errors.append(f'{target}: missing bucket {b}'); continue
        if target not in bucket_cache[b]: errors.append(f'{target}: absent from bucket {b}')
    for target in SAMPLES:
        if target not in idx: errors.append(f'sample missing index: {target}')
    return {
        'passed': not errors, 'errors': errors[:100], 'errorCount': len(errors),
        'bucketFiles': len(files), 'indexTargets': len(idx), 'bucketRecords': records_total,
        'searchItems': len(search), 'samples': {t: idx.get(t) for t in SAMPLES}
    }

def validate_http(base_url: str, fs_report: dict):
    base_url=base_url.rstrip('/')+'/'
    urls=[base_url+'unified-target-index.json', base_url+'search-index.json']
    for b in sorted(set(v for v in fs_report['samples'].values() if v)):
        urls.append(base_url+f'records/{b}.json')
    out=[]; errors=[]
    for url in urls:
        try:
            with urlopen(url, timeout=20) as r:
                data=r.read(); status=getattr(r,'status',200)
            json.loads(data.decode('utf-8'))
            out.append({'url':url,'status':status,'bytes':len(data),'ok':True})
        except Exception as e:
            out.append({'url':url,'ok':False,'error':str(e)}); errors.append(f'{url}: {e}')
    return {'passed':not errors,'errors':errors,'checks':out}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--root', default='.')
    ap.add_argument('--http-base', default='')
    ap.add_argument('--output', default='C2A21_2_RUNTIME_VALIDATION.json')
    args=ap.parse_args()
    root=Path(args.root).resolve()
    fs=validate_fs(root)
    report={'filesystem':fs,'passed':fs['passed']}
    if args.http_base:
        http=validate_http(args.http_base,fs); report['http']=http; report['passed']=report['passed'] and http['passed']
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    sys.exit(0 if report['passed'] else 1)
if __name__=='__main__': main()

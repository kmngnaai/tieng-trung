# HSK Canonical Source v1

This directory is the tracked source of truth for the generated HSK runtime after Phase B2.

The following runtime files are intentionally generated and not tracked by Git:

- `../hsk/hsk_1.json` ... `../hsk/hsk_8.json`
- `../hsk/hsk_flashcard_lookup.json`
- `../hsk/hsk_summary.json`
- `../hsk/source_summary.json`

Generate them locally from the repository root:

```powershell
python -B scripts/hsk/canonical_vocab_source_v1.py generate-runtime --source modules/hanzi-stroke/data/learning/hsk-source-v1 --output modules/hanzi-stroke/data/learning/hsk
```

`unified-phase-a-delta.json` is a deterministic bridge for the vocabulary promotion committed at `2acc4540`. During Pages build it merges only HSK `levels`, `libraries`, and `routes` into existing Unified Lookup records and adds the 450 normalized HSK targets that were genuinely absent. Generated Unified files remain deployment artifacts and are not tracked.

Do not hand-edit generated HSK runtime files or generated Unified Lookup overlays. Change the canonical source/builder and rerun the verification gates instead.

# New HSK data governance

## Goal

Keep **official syllabus membership**, **course/lesson placement**, and **derived search/catalog projections** as separate concepts so one `level` field cannot silently change meaning.

## Source precedence

1. `source/hsk*/HSK*_Bai_*.md` and associated source manifests/dialogue files are authoritative for course order, lesson placement and lesson-specific 生词.
2. `source/official-vocabulary.json` is a cross-check reference for official HSK 1-3 vocabulary membership. It does **not** assign lesson placement.
3. `data/hsk*/lesson-*.json`, `data/first-occurrence.json`, `data/catalog/*.json` and `data/hsk-taxonomy-audit.json` are generated/derived data and should not become new manual sources of truth.
4. External repositories may be used for comparison or metadata enrichment only after version, provenance and license review. Their HSK level must not overwrite the committed 2025-11 reference implicitly.

## Level semantics

- Catalog `level`: legacy-compatible course/library route level; `levelSemantics` states explicitly that it is not official syllabus membership.
- Official membership remains in the dedicated `first-occurrence.json`/taxonomy audit data; runtime catalogs only carry the official reference path/date and do not duplicate the membership map. The taxonomy audit reads the official source directly so repeated Hanzi rows (including repeats within one level) remain visible; legacy `officialLevels`/`officialOrders` stay unchanged for compatibility.
- `firstSeenLevel`: legacy compatibility field meaning first learner-facing **course exposure**, not official syllabus membership.
- A difference between course placement and official membership is an audit finding, not automatically a data error.

## Reproducible projections

- `scripts/new-hsk-course/build_catalog_data.py` builds the New HSK topic/grammar catalogs.
- `scripts/new-hsk-course/audit_hsk_taxonomy.py` reports taxonomy differences without changing lesson data.
- `scripts/new-hsk-course/build_all_course_data.py` must produce deterministic `first-occurrence.json`; grammar-derived references are sorted before projection so output does not depend on `PYTHONHASHSEED`.
- `scripts/lookup/build_search_index.py` rebuilds the lightweight lookup search index from committed unified record buckets and target index.
- `scripts/verify_generated_data.py` is a read-only gate that fails when committed projections are stale.
- `scripts/lookup/export_lexicon.py` exports the current local lookup inventory to CSV, JSONL or Anki-compatible TSV without fetching external data.

The historical full unified-record builder still depends on source material that is not fully represented as a clean canonical input in this repository. Do not use it to overwrite committed unified records until that missing provenance is resolved.

#!/usr/bin/env python3
"""Build preloaded word-cluster map from data/main.csv (offline — not runtime)."""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "main.csv"
OVERRIDES_PATH = ROOT / "data" / "word-cluster-overrides.json"
OUT_JSON = ROOT / "assets" / "cache" / "word-clusters.json"
OUT_REVIEW = ROOT / "assets" / "cache" / "word-clusters-review.md"
CACHE_VERSION = 1
CLITICS = "ושבל"


def normalize_word_surface(text: str) -> str:
    s = str(text or "")
    s = re.sub(r"[\u0591-\u05C7]", "", s)
    s = re.sub(r"[\u05F3\u05F4]", "", s)
    s = re.sub(r'^["\'«»„""]+|["\'«»„"",.:;!?…–—\/\)\]\}]+$', "", s)
    return s.strip()


def tokenize_text(text: str) -> list[str]:
    return [w for w in (normalize_word_surface(t) for t in re.split(r"\s+", str(text or "").strip())) if w]


def clitic_variants(surface: str) -> set[str]:
    variants = {surface}
    queue = [surface]
    while queue:
        word = queue.pop()
        if len(word) > 1 and word[0] in CLITICS:
            stripped = word[1:]
            if stripped and stripped not in variants:
                variants.add(stripped)
                queue.append(stripped)
    return variants


def cluster_id_for_key(key: str) -> str:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:8]
    return f"c:{digest}"


def load_surfaces() -> Counter:
    counts: Counter = Counter()
    with CSV_PATH.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            for field in ("title", "body"):
                for word in tokenize_text(row.get(field) or ""):
                    counts[word] += 1
    return counts


def load_overrides() -> tuple[list[list[str]], list[list[str]]]:
    if not OVERRIDES_PATH.exists():
        return [], []
    data = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))
    splits = [[normalize_word_surface(w) for w in group] for group in data.get("split", [])]
    merges = [[normalize_word_surface(w) for w in group] for group in data.get("merge", [])]
    return splits, merges


def lemmatize_forms(forms: set[str]) -> dict[str, str]:
    try:
        import stanza
    except ImportError:
        print("stanza not installed. Run: pip install stanza", file=sys.stderr)
        sys.exit(1)

    try:
        nlp = stanza.Pipeline("he", processors="tokenize,lemma", verbose=False)
    except Exception:
        print("Downloading Stanza Hebrew model…")
        stanza.download("he")
        nlp = stanza.Pipeline("he", processors="tokenize,lemma", verbose=False)

    form_to_lemma: dict[str, str] = {}
    batch: list[str] = []
    batch_size = 64

    def flush(batch_words: list[str]) -> None:
        if not batch_words:
            return
        doc = nlp("\n".join(batch_words))
        for form, sent in zip(batch_words, doc.sentences):
            lemmas = [word.lemma for word in sent.words if word.lemma]
            form_to_lemma[form] = lemmas[0] if lemmas else form

    for form in sorted(forms):
        batch.append(form)
        if len(batch) >= batch_size:
            flush(batch)
            batch = []
    flush(batch)
    return form_to_lemma


def lemmatize_surfaces(surfaces: set[str]) -> dict[str, str]:
    all_forms: set[str] = set()
    surface_variants: dict[str, set[str]] = {}
    for surface in surfaces:
        variants = clitic_variants(surface)
        surface_variants[surface] = variants
        all_forms.update(variants)

    form_to_lemma = lemmatize_forms(all_forms)
    surface_to_lemma: dict[str, str] = {}
    for surface, variants in surface_variants.items():
        lemmas = {form_to_lemma.get(v, v) for v in variants}
        surface_to_lemma[surface] = sorted(lemmas)[0]
    return surface_to_lemma


def auto_cluster(surfaces: set[str], surface_to_lemma: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for surface in surfaces:
        variants = clitic_variants(surface)
        lemmas = {surface_to_lemma.get(v, v) for v in variants}
        lemma = sorted(lemmas)[0]
        out[surface] = cluster_id_for_key(lemma)
    return out


def apply_merges(surface_to_cluster: dict[str, str], merges: list[list[str]]) -> None:
    for group in merges:
        group = [w for w in group if w in surface_to_cluster]
        if len(group) < 2:
            continue
        target = surface_to_cluster[group[0]]
        for w in group[1:]:
            surface_to_cluster[w] = target


def apply_splits(surface_to_cluster: dict[str, str], splits: list[list[str]]) -> None:
    for group in splits:
        group = [w for w in group if w in surface_to_cluster]
        if len(group) < 2:
            continue
        anchor = group[0]
        anchor_cid = surface_to_cluster[anchor]
        for w in group[1:]:
            if surface_to_cluster[w] == anchor_cid:
                surface_to_cluster[w] = cluster_id_for_key(f"split:{w}")


def build_review_md(surface_to_cluster: dict[str, str], counts: Counter) -> str:
    clusters: dict[str, list[str]] = defaultdict(list)
    for surface, cid in surface_to_cluster.items():
        clusters[cid].append(surface)

    lines = [
        "# Word cluster review",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        f"Clusters: {len(clusters)} | Surfaces: {len(surface_to_cluster)}",
        "",
    ]

    for cid, surfaces in sorted(clusters.items(), key=lambda kv: (-sum(counts[s] for s in kv[1]), kv[0])):
        if len(surfaces) <= 1:
            continue
        forms = ", ".join(f"{s} ({counts[s]})" for s in sorted(surfaces, key=lambda s: (-counts[s], s)))
        lines.append(f"## `{cid}`")
        lines.append(forms)
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    counts = load_surfaces()
    surfaces = set(counts.keys())
    print(f"Corpus: {len(surfaces)} unique surfaces, {sum(counts.values())} tokens")

    surface_to_lemma = lemmatize_surfaces(surfaces)
    surface_to_cluster = auto_cluster(surfaces, surface_to_lemma)

    splits, merges = load_overrides()
    apply_splits(surface_to_cluster, splits)
    apply_merges(surface_to_cluster, merges)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {
            "cacheVersion": CACHE_VERSION,
            "algorithm": "stanza-he-lemmatize+clitics+overrides",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "uniqueSurfaces": len(surface_to_cluster),
            "clusterCount": len(set(surface_to_cluster.values())),
        },
        "surfaceToCluster": dict(sorted(surface_to_cluster.items())),
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUT_REVIEW.write_text(build_review_md(surface_to_cluster, counts), encoding="utf-8")

    multi = sum(
        1 for cid in set(surface_to_cluster.values())
        if sum(1 for c in surface_to_cluster.values() if c == cid) > 1
    )
    print(f"Wrote {OUT_JSON.relative_to(ROOT)} — {payload['meta']['clusterCount']} clusters ({multi} multi-form)")
    print(f"Wrote {OUT_REVIEW.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

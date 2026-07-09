#!/bin/sh
# Regenerate data/opening-palette.json from data/tags.csv + sample tag combos from data/main.csv.
# Run after editing the CSVs, then ./build-embedded-data.sh for offline/file:// builds.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required." >&2
  exit 1
fi

node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const tagsCsv = fs.readFileSync(path.join(root, 'data/tags.csv'), 'utf8');
const mainCsv = fs.readFileSync(path.join(root, 'data/main.csv'), 'utf8');

function parseCSVToArray(csvText) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentCell.trim());
            currentCell = '';
        } else if ((char === '\n' || char === '\r') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(currentCell.trim());
            if (currentRow.join('').trim() !== '') rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }

    if (currentCell.length || currentRow.length) {
        currentRow.push(currentCell.trim());
        if (currentRow.join('').trim() !== '') rows.push(currentRow);
    }

    return rows;
}

function normalizeString(str) {
    if (!str) return '';
    return str.replace(/[#\u200B-\u200D\uFEFF]/g, '').replace(/_/g, ' ').trim().toLowerCase();
}

function displayTag(raw) {
    return String(raw || '').replace(/_/g, ' ').trim();
}

function normalizeColor(raw) {
    let color = String(raw || '').trim();
    if (!color) return '';
    if (!color.startsWith('#') && color.length >= 3) color = '#' + color;
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return '';
    return color;
}

// --- tags dictionary ---
const tagRows = parseCSVToArray(tagsCsv);
const tags = {};
const tagNormToDisplay = new Map();

tagRows.slice(1).forEach((cols) => {
    if (!cols[0]?.trim()) return;
    const display = displayTag(cols[0]);
    const norm = normalizeString(cols[0]);
    const color = normalizeColor(cols[1]);
    if (!norm || !color) return;
    tags[display] = color;
    tagNormToDisplay.set(norm, display);
});

// --- sample molecules from main.csv ---
const mainRows = parseCSVToArray(mainCsv);
const header = mainRows[0] || [];
const colIndex = {};
header.forEach((cell, index) => {
    const key = normalizeString(cell);
    if (key === 'tags') colIndex.tags = index;
    if (key === 'id') colIndex.id = index;
});

const candidates = [];
mainRows.slice(1).forEach((cols, index) => {
    const tagsRaw = cols[colIndex.tags] || '';
    if (!tagsRaw.trim()) return;

    const tagNames = tagsRaw.split(',')
        .map((t) => displayTag(t))
        .filter((t) => {
            const norm = normalizeString(t);
            return norm && tagNormToDisplay.has(norm);
        });

    if (!tagNames.length) return;

    candidates.push({
        id: cols[colIndex.id] || `sample-${index + 1}`,
        tags: tagNames,
        count: tagNames.length
    });
});

candidates.sort((a, b) => b.count - a.count || String(a.id).localeCompare(String(b.id)));

const samples = [];
const used = new Set();
for (const candidate of candidates) {
    if (samples.length >= 24) break;
    const key = candidate.tags.join('|');
    if (used.has(key)) continue;
    used.add(key);
    samples.push({ id: String(candidate.id), tags: candidate.tags });
}

while (samples.length < 24 && candidates.length) {
    const candidate = candidates[samples.length % candidates.length];
    samples.push({
        id: `${candidate.id}-alt-${samples.length + 1}`,
        tags: candidate.tags
    });
}

const out = { tags, samples };
const dest = path.join(root, 'data/opening-palette.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Built ${dest} — ${Object.keys(tags).length} tags, ${samples.length} samples.`);
NODE

/* ==========================================================================
   WORD NORMALIZE — shared surface cleanup (build script mirrors these rules)
   ========================================================================== */

/** Strip niqqud, edge punctuation, and geresh/gershayim from a word token. */
const TRAILING_WORD_PUNCT = new RegExp('[\\]"\'«»„"",.:;!?…–—/)}]+$', 'gu');

function normalizeWordSurface(text) {
    return String(text || '')
        .replace(/[\u0591-\u05C7]/g, '')
        .replace(/[\u05F3\u05F4]/g, '')
        .replace(/^["'«»„""]+/gu, '')
        .replace(TRAILING_WORD_PUNCT, '')
        .trim();
}

/** Split visible text into word tokens (whitespace-separated), normalized. */
function tokenizeNormalizedWords(text) {
    return String(text || '')
        .split(/\s+/)
        .map((word) => normalizeWordSurface(word))
        .filter(Boolean);
}

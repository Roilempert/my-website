/* ==========================================================================
   Opening — L1 molecule hover phrase helpers (mirrors physics hover label logic)
   ========================================================================== */
const OpeningHoverLabel = {
    parseCSVToArray(csvText) {
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
    },

    resolveColumnsFromHeader(headerRow) {
        const aliases = {
            title: 'title',
            body: 'body'
        };
        const cols = { title: 6, body: 7 };
        headerRow.forEach((cell, index) => {
            const key = aliases[String(cell || '').trim().toLowerCase()];
            if (key) cols[key] = index;
        });
        return cols;
    },

    clipAtPhraseBoundary(line, maxWords) {
        const words = line.split(/\s+/).filter(Boolean);
        if (words.length <= maxWords) return line;

        const windowText = words.slice(0, maxWords).join(' ');
        const breakPatterns = [
            /[.!?…](?=\s|$)/g,
            /[,;:—–-](?=\s|$)/g
        ];

        for (const pattern of breakPatterns) {
            let lastEnd = -1;
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(windowText)) !== null) {
                lastEnd = match.index + match[0].length;
            }
            if (lastEnd > 0) {
                const candidate = windowText.slice(0, lastEnd).trim();
                if (candidate.split(/\s+/).filter(Boolean).length >= 2) return candidate;
            }
        }

        return windowText;
    },

    resolveHoverLine(title, body, maxWords = 8) {
        const titleLine = String(title || '').trim().split(/\r?\n/)[0].trim();
        if (titleLine) {
            return {
                text: this.clipAtPhraseBoundary(titleLine, maxWords),
                role: 'title'
            };
        }

        const bodyLine = String(body || '').trim().split(/\r?\n/)[0].trim();
        if (bodyLine) {
            return {
                text: this.clipAtPhraseBoundary(bodyLine, maxWords),
                role: 'body'
            };
        }

        return null;
    },

    extractFromMainCsv(csvText, maxWords = 8) {
        const rows = this.parseCSVToArray(csvText);
        if (!rows.length) return [];

        const cols = this.resolveColumnsFromHeader(rows[0]);
        const lines = [];
        const seen = new Set();

        rows.slice(1).forEach((columns) => {
            const title = (columns[cols.title] || '').replace(/^#+\s*/, '').replace(/_/g, ' ').trim();
            const body = (columns[cols.body] || '').replace(/_/g, ' ').trim();
            const hover = this.resolveHoverLine(title, body, maxWords);
            if (!hover?.text || seen.has(hover.text)) return;
            seen.add(hover.text);
            lines.push(hover);
        });

        return lines;
    }
};

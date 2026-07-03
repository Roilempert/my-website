#!/usr/bin/env node
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith('--')) {
        args.set(key, next);
        i += 1;
    } else {
        args.set(key, 'true');
    }
}

const outPath = path.resolve(repoRoot, args.get('out') || 'assets/cache/meso-silhouettes.json');
const suppliedUrl = args.get('url') || '';
const port = Number(args.get('port') || 0);
const headless = args.get('headed') !== 'true';
const timeoutMs = Number(args.get('timeout') || 60000);

async function loadPlaywright() {
    try {
        return await import('playwright');
    } catch (err) {
        console.error('Playwright is required to build the browser-aware silhouette cache.');
        console.error('Install it in this repo or run this script from an environment that provides the "playwright" package.');
        console.error(`Original error: ${err?.message || err}`);
        process.exit(1);
    }
}

function contentTypeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.csv') return 'text/csv; charset=utf-8';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.woff2') return 'font/woff2';
    return 'application/octet-stream';
}

function startStaticServer() {
    const server = http.createServer((req, res) => {
        const rawUrl = req.url || '/';
        const url = new URL(rawUrl, 'http://localhost');
        const requestPath = decodeURIComponent(url.pathname);
        const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(repoRoot, safePath === '/' ? 'index.html' : safePath);

        if (!filePath.startsWith(repoRoot)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        const stream = createReadStream(filePath);
        stream.on('open', () => {
            res.writeHead(200, { 'content-type': contentTypeFor(filePath) });
            stream.pipe(res);
        });
        stream.on('error', () => {
            res.writeHead(404);
            res.end('Not found');
        });
    });

    return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                url: `http://127.0.0.1:${address.port}/`
            });
        });
    });
}

function round(value, precision = 6) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

async function extractCache(page, sourceUrl) {
    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(() => document.getElementById('app')?.classList.contains('is-ready'), null, { timeout: timeoutMs });
    await page.evaluate(() => document.fonts?.ready);
    await page.evaluate(() => {
        if (DepthController?.currentLevel !== 2) {
            if (typeof DepthController?.changeLevelV2 === 'function') {
                DepthController.changeLevelV2(2);
            } else if (typeof DepthController?.changeLevel === 'function') {
                DepthController.changeLevel(2);
            }
        }
    });
    await page.waitForFunction(() => DepthController?.currentLevel === 2, null, { timeout: timeoutMs });
    await page.evaluate(() => {
        if (typeof MesoSilhouetteCache !== 'undefined') {
            MesoSilhouetteCache.clear();
        }
        const itemsById = new Map((AppState?.items || []).map((item) => [String(item.id), item]));
        document.querySelectorAll('.note-wrapper').forEach((wrapper) => {
            const item = itemsById.get(wrapper.dataset.noteId);
            if (!item || typeof MesoMock === 'undefined') return;
            MesoMock.applyToWrapper(wrapper, item, { skipBake: true });
        });
    });
    await page.waitForFunction(
        () => document.querySelectorAll('.note-wrapper .meso-mock__frame').length === (AppState?.items?.length || 0),
        null,
        { timeout: timeoutMs }
    );
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    return page.evaluate(({ sourceUrl }) => {
        const cacheVersion = Number(CONFIG?.meso?.silhouetteCache?.version || 1);
        const round = (value, precision = 6) => {
            if (!Number.isFinite(value)) return 0;
            const factor = 10 ** precision;
            return Math.round(value * factor) / factor;
        };
        const itemsById = new Map((AppState?.items || []).map((item) => [String(item.id), item]));
        const wrappers = [...document.querySelectorAll('.note-wrapper')];
        const entries = {};

        wrappers.forEach((wrapper) => {
            const noteId = wrapper.dataset.noteId || '';
            const item = itemsById.get(noteId);
            const frame = wrapper.querySelector('.depth-v2-glyph--meso .meso-mock__frame')
                || wrapper.querySelector('.meso-mock__frame');
            if (!noteId || !item || !frame || typeof MesoMock === 'undefined') return;

            let profile = null;
            try {
                profile = MesoMock.buildProfile(item, wrapper);
            } catch (err) {
                console.warn('Profile build failed for cache extraction', noteId, err);
            }
            if (!profile?.lines?.length) return;

            const frameRect = frame.getBoundingClientRect();
            if (frameRect.width <= 0 || frameRect.height <= 0) return;

            const detailRects = [...frame.querySelectorAll('.meso-mock__line, .meso-mock__rect')]
                .map((lineEl) => {
                    const rect = lineEl.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) return null;
                    return {
                        x: round((rect.left - frameRect.left) / frameRect.width),
                        y: round((rect.top - frameRect.top) / frameRect.height),
                        w: round(rect.width / frameRect.width),
                        h: round(rect.height / frameRect.height),
                        kind: lineEl.dataset.kind || (lineEl.classList.contains('meso-mock__line--title') ? 'title' : 'body')
                    };
                })
                .filter(Boolean);

            entries[noteId] = {
                textHash: typeof MesoSilhouetteCache !== 'undefined' ? MesoSilhouetteCache.hashTextForItem(item) : '',
                frameW: round(frameRect.width, 2),
                frameH: round(frameRect.height, 2),
                profile: {
                    bandKey: profile.bandKey,
                    rowSpan: profile.rowSpan,
                    frameWidth: round(profile.frameWidth),
                    heightScale: round(profile.heightScale ?? 1),
                    fontScale: round(profile.fontScale ?? 1),
                    totalHeightPx: round(profile.totalHeightPx, 2),
                    seed: profile.seed,
                    lines: profile.lines.map((line) => ({
                        kind: line.kind || 'body',
                        width: round(line.width),
                        lineH: round(line.lineH, 2),
                        offsetY: Number.isFinite(line.offsetY) ? round(line.offsetY, 2) : undefined
                    }))
                },
                detailRects
            };
        });

        const sampleCard = document.querySelector('.note-card');
        const sampleGlyph = document.querySelector('.depth-v2-glyph--meso');
        const cardStyle = sampleCard ? getComputedStyle(sampleCard) : null;
        const glyphStyle = sampleGlyph ? getComputedStyle(sampleGlyph) : null;

        return {
            meta: {
                cacheVersion,
                algorithm: 'meso-dom-frame-line-rects',
                algorithmVersion: 1,
                generatedAt: new Date().toISOString(),
                sourceUrl,
                itemCount: Object.keys(entries).length,
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    devicePixelRatio: window.devicePixelRatio
                },
                fonts: {
                    cardFontFamily: cardStyle?.fontFamily || '',
                    glyphFontFamily: glyphStyle?.fontFamily || '',
                    glyphFontSize: glyphStyle?.fontSize || ''
                }
            },
            entries
        };
    }, { sourceUrl });
}

const { chromium } = await loadPlaywright();
let localServer = null;
const served = suppliedUrl ? { url: suppliedUrl } : await startStaticServer();
localServer = served.server || null;

const browser = await chromium.launch({ headless });
try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript(() => {
        window.__BUILD_MESO_SILHOUETTE_CACHE__ = true;
    });
    const cache = await extractCache(page, served.url);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
    const entryCount = Object.keys(cache.entries || {}).length;
    console.log(`Wrote ${entryCount} L2 silhouette cache entries to ${path.relative(repoRoot, outPath)}`);
} finally {
    await browser.close();
    if (localServer) {
        await new Promise((resolve) => localServer.close(resolve));
    }
}

// 포스트별 공유 카드(1200x630 PNG)를 만들고 프런트매터에 image: 를 넣는다.
// image: 가 없는 글만 처리한다(--force 면 전부 다시).
// 배포 워크플로(.github/workflows/pages.yml)가 Jekyll 빌드 직전에 돌리므로 새 글은
// 따로 돌리지 않아도 카드가 붙는다. CI 에서 만든 카드와 image: 줄은 러너 안에서만
// 쓰이고 커밋되지 않는다. 로컬에서 미리 보거나 카드를 커밋해 두려면 직접 돌린다.
//
//   node _tools/og-cards.mjs [--force] [파일...]
//   OG_BROWSER=/path/to/chrome node _tools/og-cards.mjs
//
// 폰트는 사이트와 같은 Google Fonts 를 불러오므로 네트워크가 필요하다.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets/img/og');
const BROWSER = process.env.OG_BROWSER || '/Applications/ego lite.app/Contents/MacOS/ego lite';
// GitHub 러너(Ubuntu 24.04)는 AppArmor 가 Chrome 샌드박스의 user namespace 를 막는다
const SANDBOX_ARGS = process.env.CI ? ['--no-sandbox'] : [];
const WIDTH = 1200;
const HEIGHT = 630;
const LONG_TITLE = 34; // 이 글자 수를 넘으면 제목 글자를 줄여 3줄 안에 담는다

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--')).map((a) => basename(a));

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function parsePost(file) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`front matter 없음: ${file}`);
  const get = (k) => {
    const v = m[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm'));
    return v ? v[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  return { src, fm: m[1], title: get('title'), category: get('category') || 'writing', date: get('date').slice(0, 10), hasImage: /^image:/m.test(m[1]) };
}

function cardHtml({ title, category, date }) {
  const size = [...title].length > LONG_TITLE ? 54 : 66;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&family=Spline+Sans+Mono:wght@500&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px}
  body{box-sizing:border-box;padding:76px 80px 70px;display:flex;flex-direction:column;
    font-family:"IBM Plex Sans KR",sans-serif;color:#1b1e24;background:#f8fafc;
    background-image:linear-gradient(#eef1f4 1px,transparent 1px),linear-gradient(90deg,#eef1f4 1px,transparent 1px);
    background-size:48px 48px}
  .kicker{font:500 22px "Spline Sans Mono",monospace;letter-spacing:.08em;color:#00759a}
  .kicker i{display:inline-block;width:12px;height:12px;background:#00759a;margin-right:12px;vertical-align:2px}
  h1{margin:34px 0 0;font-weight:600;font-size:${size}px;line-height:1.28;letter-spacing:-.01em;
    word-break:keep-all;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  footer{margin-top:auto;padding-top:22px;border-top:1px solid #d9dee4;display:flex;justify-content:space-between;
    font:500 22px "Spline Sans Mono",monospace;color:#5d636c}
  footer b{color:#1b1e24;font-weight:500}footer b span{color:#00759a}
</style></head><body>
  <div class="kicker"><i></i>${esc(category.toUpperCase())}</div>
  <h1>${esc(title)}</h1>
  <footer><b>rastalion<span>.dev</span></b><span>${esc(date)}</span></footer>
</body></html>`;
}

async function startBrowser() {
  if (!existsSync(BROWSER)) throw new Error(`브라우저가 없습니다: ${BROWSER} (OG_BROWSER 로 지정)`);
  const prof = mkdtempSync(join(tmpdir(), 'og-'));
  const proc = spawn(BROWSER, [...SANDBOX_ARGS, '--headless=new', '--remote-debugging-port=0', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(200);
    const f = join(prof, 'DevToolsActivePort');
    if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0];
  }
  if (!port) { proc.kill(); throw new Error('브라우저 디버깅 포트를 찾지 못했습니다'); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  const close = async () => { ws.close(); proc.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true }); };
  return { send, close, prof };
}

async function render(browser, post, outFile) {
  const htmlFile = join(browser.prof, 'card.html');
  writeFileSync(htmlFile, cardHtml(post));
  await browser.send('Page.navigate', { url: `file://${htmlFile}` });
  // 폰트가 늦게 오면 대체 글꼴로 찍히므로 fonts.ready 와 load 를 함께 기다린다
  await browser.send('Runtime.evaluate', { expression: 'new Promise(r=>{const go=()=>document.fonts.ready.then(()=>setTimeout(r,150));document.readyState==="complete"?go():addEventListener("load",go)})', awaitPromise: true });
  const shot = await browser.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } });
  writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
}

const files = readdirSync(join(ROOT, '_posts')).filter((f) => f.endsWith('.md') && (!only.length || only.includes(f)));
const todo = files.map((f) => ({ f, path: join(ROOT, '_posts', f), ...parsePost(join(ROOT, '_posts', f)) })).filter((p) => force || !p.hasImage);
if (!todo.length) { console.log('새로 만들 카드가 없습니다'); process.exit(0); }

mkdirSync(OUT_DIR, { recursive: true });
const browser = await startBrowser();
try {
  for (const p of todo) {
    const slug = p.f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    const rel = `/assets/img/og/${slug}.png`;
    await render(browser, p, join(ROOT, rel));
    if (!p.hasImage) writeFileSync(p.path, p.src.replace(`---\n${p.fm}\n---\n`, `---\n${p.fm}\nimage: ${rel}\n---\n`));
    console.log(rel);
  }
} finally {
  await browser.close();
}

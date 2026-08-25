#!/usr/bin/env node
/**
 * 把 shared/head.html + decks/<deck>/*.html 拼成单文件 HTML，再用 headless Chrome 打成 A4 PDF。
 * 体检：纵向溢出 + 任意后代越出页面内容盒（横向裁切）+ 目录未解析引用。
 *
 * 用法：node build.mjs            # 构建全部 deck
 *      node build.mjs design     # 只构建一个
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('/root/.bun/install/global/node_modules/puppeteer-core');
const CHROME = '/root/.omp/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'out');
mkdirSync(outDir, { recursive: true });

const DECKS = {
  design: { dir: 'design', title: 'AgentLoom · 系统设计与开放问题', pdf: 'AgentLoom-系统设计与开放问题.pdf' },
  implementation: { dir: 'implementation', title: 'AgentLoom · 实现细节参考册', pdf: 'AgentLoom-实现细节参考册.pdf' },
  overview: { dir: 'overview', title: 'AgentLoom · 核心模块与技术栈', pdf: 'AgentLoom-核心模块与技术栈.pdf' },
};

const runtime = (title) => String.raw`
<script>
(function(){
  var DOC_TITLE = ${JSON.stringify(title)};
  var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
  var total = pages.length;
  pages.forEach(function(pg, i){
    var n = i + 1;
    var pad = n < 10 ? '0' + n : '' + n;
    if(!pg.hasAttribute('data-nochrome')){
      var c = document.createElement('div');
      c.className = 'chrome';
      c.innerHTML = '<div class="l">' + DOC_TITLE + '</div>' +
                    '<div class="r">' + (pg.dataset.sec || '') + '</div>';
      pg.insertBefore(c, pg.firstChild);
    }
    var f = document.createElement('div');
    f.className = 'folio';
    f.innerHTML = '<span>' + (pg.dataset.sec || 'AGENTLOOM') + '</span>' +
                  '<span><span class="n">' + pad + '</span> / ' + total + '</span>';
    pg.appendChild(f);
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-selfpages]'), function(el){
    el.textContent = String(total);
  });

  var miss = [];
  Array.prototype.forEach.call(document.querySelectorAll('[data-ref]'), function(el){
    var ref = el.getAttribute('data-ref');
    var hit = -1;
    pages.forEach(function(pg, i){
      var sec = pg.dataset.sec || '';
      if(hit < 0 && (sec === ref || sec.indexOf(ref + ' ') === 0)) hit = i + 1;
    });
    var slot = el.querySelector('.p');
    if(slot) slot.textContent = hit > 0 ? (hit < 10 ? '0' + hit : '' + hit) : '--';
    if(hit < 0) miss.push(ref);
  });

  var bad = [];
  pages.forEach(function(pg, i){
    var body = pg.querySelector('.body');
    var pr = pg.getBoundingClientRect();
    var cs = getComputedStyle(pg);
    var boxL = pr.left + parseFloat(cs.paddingLeft) - 1.5;
    var boxR = pr.right - parseFloat(cs.paddingRight) + 1.5;
    var boxT = pr.top + parseFloat(cs.paddingTop) - 1.5;
    var boxB = pr.bottom - parseFloat(cs.paddingBottom) + 1.5;
    var issues = [];
    if(body){
      var overY = body.scrollHeight - body.clientHeight;
      var overX = body.scrollWidth - body.clientWidth;
      if(overY > 2) issues.push('scroll-y +' + overY);
      if(overX > 2) issues.push('scroll-x +' + overX);
    }
    var worstX = 0, worstY = 0, whoX = '', whoY = '';
    Array.prototype.forEach.call(pg.querySelectorAll('*'), function(el){
      if(el.closest('.folio')) return;
      if(getComputedStyle(el).position === 'absolute') return;
      var r = el.getBoundingClientRect();
      if(r.width === 0 && r.height === 0) return;
      var dx = Math.max(boxL - r.left, r.right - boxR);
      var dy = Math.max(boxT - r.top, r.bottom - boxB);
      var tag = (el.tagName + '.' + (el.className || '')).slice(0, 46);
      if(dx > worstX){ worstX = dx; whoX = tag; }
      if(dy > worstY){ worstY = dy; whoY = tag; }
    });
    if(worstX > 2) issues.push('clip-x ' + worstX.toFixed(0) + 'px @ ' + whoX);
    if(worstY > 2) issues.push('clip-y ' + worstY.toFixed(0) + 'px @ ' + whoY);
    if(issues.length) bad.push({ page: i + 1, sec: pg.dataset.sec || '', issues: issues });
  });
  window.__report = { overflow: bad, pages: total, tocMiss: miss };
})();
</script>
</body></html>`;

const head = readFileSync(join(root, 'shared', 'head.html'), 'utf8');
const wanted = process.argv[2];
const targets = Object.entries(DECKS).filter(([k]) => !wanted || k === wanted);
if (!targets.length) {
  console.error(`unknown deck: ${wanted}. available: ${Object.keys(DECKS).join(', ')}`);
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
let failed = false;

for (const [name, deck] of targets) {
  const deckDir = join(root, 'decks', deck.dir);
  const parts = readdirSync(deckDir).filter((f) => f.endsWith('.html')).sort();
  const html =
    head.replace('<title>AgentLoom · 系统设计复盘手册</title>', `<title>${deck.title}</title>`) +
    parts.map((f) => readFileSync(join(deckDir, f), 'utf8')).join('\n') +
    runtime(deck.title);

  const htmlPath = join(outDir, `_${name}.html`);
  writeFileSync(htmlPath, html);

  const page = await browser.newPage();
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  const report = await page.evaluate(() => window.__report);

  const pdfPath = join(outDir, deck.pdf);
  await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
  await page.close();

  const kb = Math.round(statSync(pdfPath).size / 1024);
  console.log(`[${name}] ${report.pages} pages, ${kb}KB -> ${deck.pdf}`);
  if (report.tocMiss.length) {
    console.log(`  TOC UNRESOLVED: ${report.tocMiss.join(', ')}`);
    failed = true;
  }
  if (report.overflow.length) {
    for (const o of report.overflow) console.log(`  p${o.page} [${o.sec}] ${o.issues.join(' | ')}`);
    failed = true;
  }
  if (!report.tocMiss.length && !report.overflow.length) console.log('  ISSUES: none');
}

await browser.close();
if (failed) process.exitCode = 1;

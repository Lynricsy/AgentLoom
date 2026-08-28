#!/usr/bin/env node
/**
 * 通俗版《AgentLoom 是怎么搭起来的》：流式排版 A4 PDF。
 *
 * 与 interview-brief 的固定页瑞士风相反，这里是「书」的排版：
 * 衬线中文正文、正常段落、Chrome 自动分页、页脚自动页码。
 * 目标读者不懂编程，因此排版要宽松、段落要连贯，不做高密度速记卡。
 *
 * 用法：node build.mjs
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

const BOOKS = {
  brief: {
    dir: 'brief',
    title: 'AgentLoom 是怎么搭起来的',
    pdf: 'AgentLoom-是怎么搭起来的.pdf',
  },
  full: {
    dir: 'chapters',
    title: 'AgentLoom 是怎么搭起来的 · 详解',
    pdf: 'AgentLoom-是怎么搭起来的-详解.pdf',
  },
};

const wanted = process.argv[2];
const targets = Object.entries(BOOKS).filter(([k]) => !wanted || k === wanted);
if (!targets.length) {
  console.error(`unknown book: ${wanted}. available: ${Object.keys(BOOKS).join(', ')}`);
  process.exit(2);
}

const head = readFileSync(join(root, 'style.html'), 'utf8');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
let failed = false;

for (const [name, book] of targets) {
const TITLE = book.title;
const PDF = book.pdf;
const parts = readdirSync(join(root, book.dir))
  .filter((f) => f.endsWith('.html'))
  .sort();

if (!parts.length) {
  console.error(`${book.dir}/ 下没有 html 片段`);
  process.exit(2);
}

const html = `${head}\n${parts
  .map((f) => readFileSync(join(root, book.dir, f), 'utf8'))
  .join('\n')}\n</body></html>`;

const htmlPath = join(outDir, `_${name}.html`);
writeFileSync(htmlPath, html);

const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);

// 体检：横向溢出（长代码/宽表格撑破页面内容盒）
const report = await page.evaluate(() => {
  const bad = [];
  const limit = document.body.clientWidth + 2;
  document.querySelectorAll('pre, table, .analogy, .termbox, p, li, h1, h2, h3').forEach((el) => {
    if (el.scrollWidth > limit) {
      bad.push(`${el.tagName}.${el.className || '-'}: ${el.scrollWidth}px > ${limit}px`);
    }
  });
  const terms = [...document.querySelectorAll('.termbox .t')].map((el) => el.textContent.trim());
  const dupes = terms.filter((t, i) => terms.indexOf(t) !== i);
  return { overflow: bad, terms: terms.length, dupes: [...new Set(dupes)] };
});

const pdfPath = join(outDir, PDF);
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '19mm', bottom: '17mm', left: '20mm', right: '20mm' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="width:100%;font-family:sans-serif;font-size:8pt;color:#999;
    padding:0 20mm;display:flex;justify-content:space-between;">
    <span>${TITLE}</span><span></span></div>`,
  footerTemplate: `<div style="width:100%;font-family:sans-serif;font-size:8.5pt;color:#666;
    padding:0 20mm;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
});
await page.close();


const kb = Math.round(statSync(pdfPath).size / 1024);
console.log(`[${name}] ${parts.length} 章片段 -> ${PDF} (${kb}KB)`);
console.log(`术语框 ${report.terms} 个`);
if (report.dupes.length) console.log(`  重复术语: ${report.dupes.join(', ')}`);
if (report.overflow.length) {
  console.log('  横向溢出:');
  report.overflow.forEach((o) => console.log(`    ${o}`));
  failed = true;
} else {
  console.log('  横向溢出: 无');
}
}

await browser.close();
if (failed) process.exitCode = 1;

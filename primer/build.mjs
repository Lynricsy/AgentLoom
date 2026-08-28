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

const TITLE = 'AgentLoom 是怎么搭起来的';
const PDF = 'AgentLoom-是怎么搭起来的.pdf';

const head = readFileSync(join(root, 'style.html'), 'utf8');
const parts = readdirSync(join(root, 'chapters'))
  .filter((f) => f.endsWith('.html'))
  .sort();

if (!parts.length) {
  console.error('chapters/ 下没有 html 片段');
  process.exit(2);
}

const html = `${head}\n${parts
  .map((f) => readFileSync(join(root, 'chapters', f), 'utf8'))
  .join('\n')}\n</body></html>`;

const htmlPath = join(outDir, '_primer.html');
writeFileSync(htmlPath, html);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});

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
  margin: { top: '22mm', bottom: '20mm', left: '24mm', right: '24mm' },
  displayHeaderFooter: true,
  headerTemplate: `<div style="width:100%;font-family:sans-serif;font-size:8pt;color:#999;
    padding:0 24mm;display:flex;justify-content:space-between;">
    <span>${TITLE}</span><span></span></div>`,
  footerTemplate: `<div style="width:100%;font-family:sans-serif;font-size:8.5pt;color:#666;
    padding:0 24mm;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
});
await page.close();
await browser.close();

const kb = Math.round(statSync(pdfPath).size / 1024);
console.log(`${parts.length} 章片段 -> ${PDF} (${kb}KB)`);
console.log(`术语框 ${report.terms} 个`);
if (report.dupes.length) console.log(`  重复术语: ${report.dupes.join(', ')}`);
if (report.overflow.length) {
  console.log('  横向溢出:');
  report.overflow.forEach((o) => console.log(`    ${o}`));
  process.exitCode = 1;
} else {
  console.log('  横向溢出: 无');
}

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

const THEMES = {
  light: { suffix: '', extra: '', fg: '#999', folio: '#666', pageBg: '#ffffff' },
  dark: {
    suffix: '-深色',
    extra: readFileSync(join(root, 'dark.html'), 'utf8'),
    fg: '#6e716c',
    folio: '#8a8d88',
    pageBg: '#15171c',
  },
};

// 用法：node build.mjs [brief|full] [light|dark]
const argv = process.argv.slice(2);
const wantedBook = argv.find((a) => a in BOOKS);
const wantedTheme = argv.find((a) => a in THEMES);
if (argv.some((a) => !(a in BOOKS) && !(a in THEMES))) {
  console.error(`用法: node build.mjs [${Object.keys(BOOKS).join('|')}] [${Object.keys(THEMES).join('|')}]`);
  process.exit(2);
}

const books = Object.entries(BOOKS).filter(([k]) => !wantedBook || k === wantedBook);
const themes = Object.entries(THEMES).filter(([k]) => !wantedTheme || k === wantedTheme);
const targets = books.flatMap(([bk, book]) =>
  themes.map(([tk, theme]) => [`${bk}-${tk}`, book, theme]),
);

const head = readFileSync(join(root, 'style.html'), 'utf8');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
let failed = false;

for (const [name, book, theme] of targets) {
const TITLE = book.title;
const PDF = book.pdf.replace(/\.pdf$/, `${theme.suffix}.pdf`);
const parts = readdirSync(join(root, book.dir))
  .filter((f) => f.endsWith('.html'))
  .sort();

if (!parts.length) {
  console.error(`${book.dir}/ 下没有 html 片段`);
  process.exit(2);
}

// Chrome 131+ 支持 CSS @page margin at-rules（含背景与 page/pages 计数器）。
// 页边距区域无法被文档背景或 position:fixed 覆盖，只有 margin box 能着色，
// 因此深色铺满整页必须走这条路径——同时保住每页重复的上下安全边距。
const CORNERS = ['top-left-corner', 'top-right-corner', 'bottom-left-corner', 'bottom-right-corner'];
const EDGES = ['top-left', 'top-right', 'right-top', 'right-middle', 'right-bottom',
  'bottom-left', 'bottom-right', 'left-top', 'left-middle', 'left-bottom'];
const pageCss = (theme, title) => `<style>
@page {
  size: A4;
  margin: 19mm 20mm 17mm 20mm;
${[...CORNERS, ...EDGES].map((n) => `  @${n} { content:''; background:${theme.pageBg}; }`).join('\n')}
  @top-center {
    content: '${title}';
    background: ${theme.pageBg}; color: ${theme.fg};
    font-family: SA, sans-serif; font-size: 8pt; text-align: left;
  }
  @bottom-center {
    content: counter(page) ' / ' counter(pages);
    background: ${theme.pageBg}; color: ${theme.folio};
    font-family: SA, sans-serif; font-size: 8.5pt;
  }
}
</style>`;

const html = `${head}\n${pageCss(theme, TITLE)}\n${theme.extra}\n${parts
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
  displayHeaderFooter: false,
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

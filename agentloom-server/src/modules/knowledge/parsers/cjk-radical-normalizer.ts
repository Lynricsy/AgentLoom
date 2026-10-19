/**
 * PDF 字体（如 Noto Sans/Serif CJK SC）里常用汉字与部首共用同一字形，ToUnicode 映射到
 * 码位更小的部首字符，抽出的文本就成了「同⼀」「运⾏」「⻔」这类部首字符，与查询里的
 * 常用汉字不一致，检索召回与引用都会受损。
 *
 * 只归一化两个部首区块，不对全文做 NFKC：NFKC 会把全角标点（，：；（）？）改成半角、
 * 把 ① 改成 1、把 … 改成 ...，破坏正常中文排版。
 * - 康熙部首 U+2F00–U+2FDF：NFKC 映射与 Unicode EquivalentUnifiedIdeograph.txt 完全一致；
 *   唯一例外 ⼾（DOOR）映射为简体「户」而非「戶」——简体字体用「户」字形承载该部首，
 *   poppler pdftotext 对同一文件也抽出「户」。
 * - CJK 部首补充 U+2E80–U+2EFF：NFKC 不处理，按 EquivalentUnifiedIdeograph.txt（Unicode 16.0）映射。
 */
const RADICAL_SUPPLEMENT_PAIRS =
  '⺁厂⺂乛⺃乚⺄乙⺅亻⺆冂⺇𠘨⺈刀⺉刂⺊卜⺋㔾⺌小⺍小⺎兀⺏尣⺐尢' +
  '⺑𡯂⺒巳⺓幺⺔彑⺕𫜹⺖忄⺗心⺘扌⺙攵⺛旡⺜日⺝月⺞歺⺟母⺠民⺡氵' +
  '⺢氺⺣灬⺤爫⺥爫⺦丬⺧牛⺨犭⺩王⺪𤴔⺫目⺬示⺭礻⺮𥫗⺯糹⺰纟⺱罓' +
  '⺲罒⺳㓁⺴冗⺵𦉫⺶羊⺷𦍌⺸𦍋⺹耂⺺肀⺻聿⺼肉⺽𦥑⺾艹⺿艹⻀艹⻁虎' +
  '⻂衤⻃覀⻄西⻅见⻆角⻇𧢲⻈讠⻉贝⻊𧾷⻋车⻌辶⻍辶⻎辶⻏邑⻐钅⻑長' +
  '⻒镸⻓长⻔门⻕𨸏⻖阝⻗雨⻘青⻙韦⻚页⻛风⻜飞⻝食⻞𩙿⻟飠⻠饣⻡𩠐' +
  '⻢马⻣骨⻤鬼⻥鱼⻦鸟⻧卤⻨麦⻩黄⻪黾⻫斉⻬齐⻭歯⻮齿⻯竜⻰龙⻱龜' +
  '⻲亀⻳龟';

const RADICAL_TO_IDEOGRAPH: Readonly<Record<string, string>> = (() => {
  const chars = Array.from(RADICAL_SUPPLEMENT_PAIRS);
  const table: Record<string, string> = { '⼾': '户' };
  for (let index = 0; index < chars.length; index += 2) {
    table[chars[index]] = chars[index + 1];
  }
  return table;
})();

const CJK_RADICAL_PATTERN = /[\u2E80-\u2EFF\u2F00-\u2FDF]/g;

export function normalizeCjkRadicals(text: string): string {
  return text.replace(
    CJK_RADICAL_PATTERN,
    (radical) => RADICAL_TO_IDEOGRAPH[radical] ?? radical.normalize('NFKC'),
  );
}

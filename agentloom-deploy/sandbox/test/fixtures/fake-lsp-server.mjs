#!/usr/bin/env node
/**
 * 测试用最小 LSP server（stdio JSON-RPC）：固定 hover / definition，rename 替换
 * 文档中该单词的所有出现，documentSymbol 返回一层大纲；每次 didOpen / didChange
 * 后按内容推送诊断（含 ERROR 的行 → error 2322，含 WARN 的行 → warning）。
 */
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);
/** uri → 文本 */
const documents = new Map();
/** 模拟冷启动：首轮诊断推迟这么久（毫秒）才发布 */
let firstPublishDelayMs = Number(process.env.FAKE_LSP_FIRST_PUBLISH_DELAY_MS ?? 0);
/** 模拟 tsserver 被 OOM 杀掉而语言服务器进程仍存活：发布这么多轮后不再发布诊断 */
let publishesLeft = Number(process.env.FAKE_LSP_MAX_PUBLISHES ?? Infinity);

function lines(text) {
  return text.split(/\r\n|\r|\n/);
}

function publish(uri) {
  const diagnostics = [];
  lines(documents.get(uri) ?? '').forEach((text, line) => {
    const error = text.indexOf('ERROR');
    if (error >= 0) {
      diagnostics.push({
        range: { start: { line, character: error }, end: { line, character: error + 5 } },
        severity: 1,
        code: 2322,
        source: 'fake',
        message: "Type 'string' is not assignable\n  to type 'number'.",
      });
    }
    const warn = text.indexOf('WARN');
    if (warn >= 0) {
      diagnostics.push({
        range: { start: { line, character: warn }, end: { line, character: warn + 4 } },
        severity: 2,
        code: 'W1',
        source: 'fake',
        message: 'Suspicious WARN marker.',
      });
    }
  });
  if (publishesLeft <= 0) return;
  publishesLeft -= 1;
  const send = () =>
    void connection.sendNotification('textDocument/publishDiagnostics', { uri, diagnostics });
  if (firstPublishDelayMs > 0) {
    setTimeout(send, firstPublishDelayMs);
    firstPublishDelayMs = 0;
  } else {
    send();
  }
}

function wordAt(uri, position) {
  const text = lines(documents.get(uri) ?? '')[position.line] ?? '';
  let start = position.character;
  let end = position.character;
  while (start > 0 && /\w/.test(text[start - 1])) start -= 1;
  while (end < text.length && /\w/.test(text[end])) end += 1;
  return text.slice(start, end);
}

connection.onRequest('initialize', async () => {
  // 模拟真实 server 在握手期向客户端发起请求
  await connection.sendRequest('workspace/configuration', { items: [{ section: 'fake' }] });
  return {
    capabilities: {
      textDocumentSync: 1,
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      codeActionProvider: true,
    },
    serverInfo: { name: 'fake-lsp' },
  };
});
connection.onNotification('initialized', () => {});
connection.onNotification('textDocument/didOpen', ({ textDocument }) => {
  documents.set(textDocument.uri, textDocument.text);
  publish(textDocument.uri);
});
connection.onNotification('textDocument/didChange', ({ textDocument, contentChanges }) => {
  documents.set(textDocument.uri, contentChanges.at(-1).text);
  publish(textDocument.uri);
});
connection.onRequest('textDocument/hover', () => ({
  contents: { kind: 'markdown', value: '```ts\nconst greeting: string\n```\nFAKE_HOVER_DOC' },
}));
connection.onRequest('textDocument/definition', ({ textDocument }) => ({
  uri: textDocument.uri,
  range: { start: { line: 0, character: 6 }, end: { line: 0, character: 14 } },
}));
connection.onRequest('textDocument/references', ({ textDocument }) => [
  { uri: textDocument.uri, range: { start: { line: 0, character: 6 }, end: { line: 0, character: 14 } } },
  { uri: textDocument.uri, range: { start: { line: 1, character: 12 }, end: { line: 1, character: 20 } } },
]);
connection.onRequest('textDocument/rename', ({ textDocument, position, newName }) => {
  const word = wordAt(textDocument.uri, position);
  const edits = [];
  lines(documents.get(textDocument.uri) ?? '').forEach((text, line) => {
    const pattern = new RegExp(`\\b${word}\\b`, 'g');
    for (const match of text.matchAll(pattern)) {
      edits.push({
        range: {
          start: { line, character: match.index },
          end: { line, character: match.index + word.length },
        },
        newText: newName,
      });
    }
  });
  return { changes: { [textDocument.uri]: edits } };
});
connection.onRequest('textDocument/documentSymbol', () => [
  {
    name: 'greeting',
    kind: 13,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 30 } },
    selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 14 } },
    children: [],
  },
]);
connection.onRequest('textDocument/codeAction', () => []);
connection.onRequest('workspace/symbol', () => []);
connection.onRequest('shutdown', () => null);
connection.onNotification('exit', () => process.exit(0));
connection.listen();

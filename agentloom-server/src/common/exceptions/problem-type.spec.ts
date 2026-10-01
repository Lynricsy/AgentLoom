import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { PROBLEM_TYPE_BASE, problemType } from './problem-type';

const SERVER_SRC = resolve(__dirname, '../..');

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : listSourceFiles(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** `super({ type, title, ... })` 或 `new DomainException({ type, title, ... })` 的 type 初始化表达式 */
function collectProblemTypeInitializers(
  sourceFile: ts.SourceFile,
): ts.Expression[] {
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    let arg: ts.Expression | undefined;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.SuperKeyword
    ) {
      arg = node.arguments[0];
    } else if (
      ts.isNewExpression(node) &&
      node.expression.getText(sourceFile) === 'DomainException'
    ) {
      arg = node.arguments?.[0];
    }
    if (arg && ts.isObjectLiteralExpression(arg)) {
      const names = arg.properties.map((p) => p.name?.getText(sourceFile));
      const typeProp = arg.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && p.name.getText(sourceFile) === 'type',
      );
      if (typeProp && names.includes('title')) {
        found.push(typeProp.initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isStandardProblemType(expression: ts.Expression): boolean {
  if (ts.isStringLiteralLike(expression)) {
    return expression.text.startsWith(PROBLEM_TYPE_BASE);
  }
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'problemType'
  );
}

describe('problemType', () => {
  it('在标准前缀后拼接 slug', () => {
    expect(problemType('document-not-found')).toBe(
      'https://agentloom.dev/errors/document-not-found',
    );
  });

  /**
   * RFC 9457 `type` 是客户端分支依据（如 mobile 按 token-revoked 强制登出），
   * 前缀不一致会让同一类错误在不同模块呈现两套命名。
   */
  it('所有 DomainException 的 type 都使用标准前缀', { timeout: 30_000 }, () => {
    const violations: string[] = [];

    for (const file of listSourceFiles(SERVER_SRC)) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('Exception')) continue;
      const sourceFile = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      for (const initializer of collectProblemTypeInitializers(sourceFile)) {
        if (isStandardProblemType(initializer)) continue;
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          initializer.getStart(sourceFile),
        );
        violations.push(
          `${relative(SERVER_SRC, file)}:${line + 1} ${initializer.getText(sourceFile)}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { CodeExecutionService } from '../code-execution.service';

// 真实子进程：验证包装器约定（赋值 output 变量）与 stdout 不重复，mock spawn 覆盖不到这两点。
describe('CodeExecutionService（真实 node 子进程）', () => {
  it('JavaScript 通过 output 变量返回结果，console.log 只出现一次', async () => {
    const result = await new CodeExecutionService().execute({
      language: 'javascript',
      code: "console.log('hi'); output = { sum: input.a + 1 };",
      input: { a: 1 },
      timeout: 10,
    });

    expect(result).toMatchObject({
      success: true,
      output: { sum: 2 },
      stdout: 'hi',
    });
  });
});

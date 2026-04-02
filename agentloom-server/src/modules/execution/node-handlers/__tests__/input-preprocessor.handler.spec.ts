import { describe, it, expect, beforeEach } from 'vitest';
import {
  InputPreprocessorHandlerImpl,
  InputPreprocessorConfig,
  normalizeInputPreprocessorConfig,
} from '../input-preprocessor.handler';

describe('InputPreprocessorHandlerImpl', () => {
  let handler: InputPreprocessorHandlerImpl;

  beforeEach(() => {
    handler = new InputPreprocessorHandlerImpl();
  });

  describe('共通行为', () => {
    it('normalizeInputPreprocessorConfig 应兼容 template/output_format/transform_type 别名', () => {
      expect(
        normalizeInputPreprocessorConfig({
          transform_type: 'template',
          template: 'Hello, {{name}}!',
          output_format: 'text',
        }),
      ).toEqual({
        transformType: 'template',
        expression: 'Hello, {{name}}!',
        outputFormat: 'text',
      });
    });

    it('normalizeInputPreprocessorConfig 应允许 fallback transformType', () => {
      expect(
        normalizeInputPreprocessorConfig(
          {
            template: 'Hi',
          },
          'template',
        ),
      ).toEqual({
        transformType: 'template',
        expression: 'Hi',
      });
    });

    it('expression 为空时抛出错误', async () => {
      const config: InputPreprocessorConfig = {
        transformType: 'jmespath',
        expression: '',
      };
      await expect(handler.execute({ a: 1 }, config)).rejects.toThrow(
        'expression 不能为空',
      );
    });

    it('expression 仅含空白时抛出错误', async () => {
      const config: InputPreprocessorConfig = {
        transformType: 'jmespath',
        expression: '   ',
      };
      await expect(handler.execute({ a: 1 }, config)).rejects.toThrow(
        'expression 不能为空',
      );
    });

    it('不支持的 transformType 抛出错误', async () => {
      const config = {
        transformType: 'unknown' as any,
        expression: 'x',
      };
      await expect(handler.execute({ a: 1 }, config)).rejects.toThrow(
        '不支持的 transformType',
      );
    });

    it('有 outputFormat 时返回 outputFormat', async () => {
      const config: InputPreprocessorConfig = {
        transformType: 'jmespath',
        expression: 'a',
        outputFormat: 'json',
      };
      const result = await handler.execute({ a: 1 }, config);
      expect(result.outputFormat).toBe('json');
    });

    it('无 outputFormat 时返回结果不含 outputFormat 键', async () => {
      const config: InputPreprocessorConfig = {
        transformType: 'jmespath',
        expression: 'a',
      };
      const result = await handler.execute({ a: 1 }, config);
      expect(result).not.toHaveProperty('outputFormat');
    });
  });

  describe('jmespath', () => {
    const makeConfig = (expression: string): InputPreprocessorConfig => ({
      transformType: 'jmespath',
      expression,
    });

    it('简单字段提取', async () => {
      const result = await handler.execute(
        { name: 'Alice', age: 30 },
        makeConfig('name'),
      );
      expect(result.output).toBe('Alice');
    });

    it('嵌套字段提取', async () => {
      const input = { user: { profile: { name: 'Bob' } } };
      const result = await handler.execute(
        input,
        makeConfig('user.profile.name'),
      );
      expect(result.output).toBe('Bob');
    });

    it('数组投影', async () => {
      const input = { items: [{ id: 1 }, { id: 2 }, { id: 3 }] };
      const result = await handler.execute(input, makeConfig('items[*].id'));
      expect(result.output).toEqual([1, 2, 3]);
    });

    it('过滤表达式', async () => {
      const input = {
        people: [
          { name: 'A', age: 20 },
          { name: 'B', age: 35 },
        ],
      };
      const result = await handler.execute(
        input,
        makeConfig('people[?age > `30`].name'),
      );
      expect(result.output).toEqual(['B']);
    });

    it('接受 JSON 字符串输入', async () => {
      const result = await handler.execute('{"x": 42}', makeConfig('x'));
      expect(result.output).toBe(42);
    });

    it('查询结果为 null 时返回空对象', async () => {
      const result = await handler.execute({ a: 1 }, makeConfig('nonexistent'));
      expect(result.output).toEqual({});
    });

    it('无效 JSON 字符串抛出错误', async () => {
      await expect(
        handler.execute('not-json', makeConfig('a')),
      ).rejects.toThrow();
    });
  });

  describe('jsonata', () => {
    const makeConfig = (expression: string): InputPreprocessorConfig => ({
      transformType: 'jsonata',
      expression,
    });

    it('简单字段提取', async () => {
      const result = await handler.execute({ price: 100 }, makeConfig('price'));
      expect(result.output).toBe(100);
    });

    it('计算表达式', async () => {
      const input = { price: 100, quantity: 3 };
      const result = await handler.execute(
        input,
        makeConfig('price * quantity'),
      );
      expect(result.output).toBe(300);
    });

    it('字符串拼接', async () => {
      const input = { firstName: 'John', lastName: 'Doe' };
      const result = await handler.execute(
        input,
        makeConfig('firstName & " " & lastName'),
      );
      expect(result.output).toBe('John Doe');
    });

    it('数组聚合', async () => {
      const input = { items: [{ price: 10 }, { price: 20 }, { price: 30 }] };
      const result = await handler.execute(
        input,
        makeConfig('$sum(items.price)'),
      );
      expect(result.output).toBe(60);
    });

    it('对象构建', async () => {
      const input = { name: 'Alice', age: 25 };
      const result = await handler.execute(
        input,
        makeConfig('{"user": name, "years": age}'),
      );
      expect(result.output).toEqual({ user: 'Alice', years: 25 });
    });

    it('接受 JSON 字符串输入', async () => {
      const result = await handler.execute('{"val": 99}', makeConfig('val'));
      expect(result.output).toBe(99);
    });

    it('表达式求值为 undefined 时返回空对象', async () => {
      const result = await handler.execute({ a: 1 }, makeConfig('nonexistent'));
      expect(result.output).toEqual({});
    });

    it('无效表达式抛出错误', async () => {
      await expect(
        handler.execute({ a: 1 }, makeConfig('${')),
      ).rejects.toThrow();
    });
  });

  describe('template', () => {
    const makeConfig = (expression: string): InputPreprocessorConfig => ({
      transformType: 'template',
      expression,
    });

    it('简单变量替换', async () => {
      const result = await handler.execute(
        { name: 'World' },
        makeConfig('Hello, {{name}}!'),
      );
      expect(result.output).toBe('Hello, World!');
    });

    it('多个变量替换', async () => {
      const input = { city: 'Tokyo', country: 'Japan' };
      const result = await handler.execute(
        input,
        makeConfig('{{city}}, {{country}}'),
      );
      expect(result.output).toBe('Tokyo, Japan');
    });

    it('嵌套路径 dot notation', async () => {
      const input = { user: { name: 'Alice' } };
      const result = await handler.execute(
        input,
        makeConfig('Name: {{user.name}}'),
      );
      expect(result.output).toBe('Name: Alice');
    });

    it('深层嵌套路径', async () => {
      const input = { a: { b: { c: { d: 'deep' } } } };
      const result = await handler.execute(input, makeConfig('{{a.b.c.d}}'));
      expect(result.output).toBe('deep');
    });

    it('不存在的键替换为空字符串', async () => {
      const result = await handler.execute(
        { a: 1 },
        makeConfig('val={{missing}}'),
      );
      expect(result.output).toBe('val=');
    });

    it('null 值替换为空字符串', async () => {
      const result = await handler.execute(
        { val: null } as any,
        makeConfig('result={{val}}'),
      );
      expect(result.output).toBe('result=');
    });

    it('数值类型正确转字符串', async () => {
      const result = await handler.execute(
        { num: 42 },
        makeConfig('Answer: {{num}}'),
      );
      expect(result.output).toBe('Answer: 42');
    });

    it('boolean 类型正确转字符串', async () => {
      const result = await handler.execute(
        { flag: true } as any,
        makeConfig('Is: {{flag}}'),
      );
      expect(result.output).toBe('Is: true');
    });

    it('无占位符时原样返回模板', async () => {
      const result = await handler.execute(
        { a: 1 },
        makeConfig('no placeholders here'),
      );
      expect(result.output).toBe('no placeholders here');
    });

    it('键名带空格时正常 trim', async () => {
      const result = await handler.execute(
        { name: 'Fox' },
        makeConfig('{{ name }}'),
      );
      expect(result.output).toBe('Fox');
    });

    it('接受 JSON 字符串输入', async () => {
      const result = await handler.execute(
        '{"greeting": "Hi"}',
        makeConfig('{{greeting}} there'),
      );
      expect(result.output).toBe('Hi there');
    });
  });

  describe('script', () => {
    const makeConfig = (expression: string): InputPreprocessorConfig => ({
      transformType: 'script',
      expression,
    });

    it('简单返回输入字段', async () => {
      const result = await handler.execute({ x: 10 }, makeConfig('input.x'));
      expect(result.output).toEqual({ result: 10 });
    });

    it('对象转换', async () => {
      const input = { firstName: 'John', lastName: 'Doe' };
      const script = '({ fullName: input.firstName + " " + input.lastName })';
      const result = await handler.execute(input, makeConfig(script));
      expect(result.output).toEqual({ fullName: 'John Doe' });
    });

    it('数组操作返回 {result}', async () => {
      const input = { items: [3, 1, 2] };
      const script = 'input.items.sort((a, b) => a - b)';
      const result = await handler.execute(input, makeConfig(script));
      expect(result.output).toEqual({ result: [1, 2, 3] });
    });

    it('使用 JSON.stringify', async () => {
      const input = { data: { a: 1 } };
      const script = 'JSON.stringify(input.data)';
      const result = await handler.execute(input, makeConfig(script));
      expect(result.output).toBe('{"a":1}');
    });

    it('使用 JSON.parse', async () => {
      const input = { raw: '{"x":1}' };
      const script = 'JSON.parse(input.raw)';
      const result = await handler.execute(input, makeConfig(script));
      expect(result.output).toEqual({ x: 1 });
    });

    it('使用 Math', async () => {
      const input = { values: [1, 4, 9] };
      const script =
        '({ max: Math.max(...input.values), sqrt: Math.sqrt(input.values[2]) })';
      const result = await handler.execute(input, makeConfig(script));
      expect(result.output).toEqual({ max: 9, sqrt: 3 });
    });

    it('使用 parseInt / parseFloat', async () => {
      const input = { intStr: '42', floatStr: '3.14' };
      const script =
        '({ int: parseInt(input.intStr), float: parseFloat(input.floatStr) })';
      const result = await handler.execute(input, makeConfig(script));
      expect(result.output).toEqual({ int: 42, float: 3.14 });
    });

    it('使用 Object.keys/values', async () => {
      const input = { a: 1, b: 2 };
      const script =
        '({ keys: Object.keys(input), vals: Object.values(input) })';
      const result = await handler.execute(input, makeConfig(script));
      expect(result.output).toEqual({ keys: ['a', 'b'], vals: [1, 2] });
    });

    it('undefined 返回空对象', async () => {
      const result = await handler.execute({ a: 1 }, makeConfig('undefined'));
      expect(result.output).toEqual({});
    });

    it('null 返回空对象', async () => {
      const result = await handler.execute({ a: 1 }, makeConfig('null'));
      expect(result.output).toEqual({});
    });

    it('数值结果包装为 {result}', async () => {
      const result = await handler.execute({ x: 5 }, makeConfig('input.x * 2'));
      expect(result.output).toEqual({ result: 10 });
    });

    it('boolean 结果包装为 {result}', async () => {
      const result = await handler.execute({ x: 5 }, makeConfig('input.x > 3'));
      expect(result.output).toEqual({ result: true });
    });

    it('接受 JSON 字符串输入', async () => {
      const result = await handler.execute('{"v": 7}', makeConfig('input.v'));
      expect(result.output).toEqual({ result: 7 });
    });

    describe('安全隔离', () => {
      it('禁止访问 require', async () => {
        await expect(
          handler.execute({ a: 1 }, makeConfig("require('fs')")),
        ).rejects.toThrow();
      });

      it('禁止访问 process', async () => {
        await expect(
          handler.execute({ a: 1 }, makeConfig('process.env')),
        ).rejects.toThrow();
      });

      it('禁止访问 global', async () => {
        await expect(
          handler.execute({ a: 1 }, makeConfig('global')),
        ).rejects.toThrow();
      });

      it('globalThis 不泄露 process/require', async () => {
        const result = await handler.execute(
          { a: 1 },
          makeConfig(
            '({ hasProcess: typeof globalThis.process !== "undefined", hasRequire: typeof globalThis.require !== "undefined" })',
          ),
        );
        expect(result.output).toEqual({ hasProcess: false, hasRequire: false });
      });

      it('禁止 Function 构造器逃逸', async () => {
        await expect(
          handler.execute(
            { a: 1 },
            makeConfig("new Function('return process')()"),
          ),
        ).rejects.toThrow();
      });

      it('无限循环触发超时', async () => {
        await expect(
          handler.execute({ a: 1 }, makeConfig('while(true){}')),
        ).rejects.toThrow();
      }, 10_000);

      it('动态导入不可用 (sandbox 无模块加载能力)', async () => {
        const result = await handler.execute(
          { a: 1 },
          makeConfig('({ hasRequire: typeof require !== "undefined" })'),
        );
        expect(result.output).toEqual({ hasRequire: false });
      });
    });
  });

  describe('链式执行 (chain execution)', () => {
    it('jmespath → template 链式处理', async () => {
      // 第一步：用 jmespath 提取字段
      const step1Result = await handler.execute(
        { users: [{ name: 'Alice', role: 'admin' }] },
        { transformType: 'jmespath', expression: 'users[0]' },
      );

      // 第二步：用 template 格式化输出
      const step2Result = await handler.execute(
        step1Result.output as Record<string, unknown>,
        { transformType: 'template', expression: 'User {{name}} is {{role}}' },
      );

      expect(step2Result.output).toBe('User Alice is admin');
    });

    it('jsonata → script 链式处理', async () => {
      // 第一步：用 jsonata 计算
      const step1Result = await handler.execute(
        {
          items: [
            { price: 10, qty: 2 },
            { price: 20, qty: 1 },
          ],
        },
        {
          transformType: 'jsonata',
          expression: '{"total": $sum(items.(price * qty))}',
        },
      );

      // 第二步：用 script 添加标签
      const step2Result = await handler.execute(
        step1Result.output as Record<string, unknown>,
        {
          transformType: 'script',
          expression: '({ summary: "Total: $" + input.total })',
        },
      );

      expect(step2Result.output).toEqual({ summary: 'Total: $40' });
    });

    it('script → jmespath → template 三步链式', async () => {
      // 第一步：script 构建结构
      const step1Result = await handler.execute(
        { raw: [5, 3, 8, 1] },
        {
          transformType: 'script',
          expression:
            '({ sorted: input.raw.sort((a,b) => a-b), count: input.raw.length })',
        },
      );

      // 第二步：jmespath 提取
      const step2Result = await handler.execute(
        step1Result.output as Record<string, unknown>,
        {
          transformType: 'jmespath',
          expression: '{first: sorted[0], total: count}',
        },
      );

      // 第三步：template 格式化
      const step3Result = await handler.execute(
        step2Result.output as Record<string, unknown>,
        {
          transformType: 'template',
          expression: 'Min value: {{first}}, Count: {{total}}',
        },
      );

      expect(step3Result.output).toBe('Min value: 1, Count: 4');
    });
  });
});

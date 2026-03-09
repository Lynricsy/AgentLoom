import { describe, expect, it } from 'vitest';
import {
  DiscoverMcpToolsDto,
  ImportMcpToolsDto,
  TestMcpConnectionDto,
} from '../dto';

describe('MCP DTO', () => {
  describe('TestMcpConnectionDto', () => {
    it('应通过合法的 stdio 连接配置校验', () => {
      const result = TestMcpConnectionDto.schema.safeParse({
        connection: {
          transportType: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
        },
      });

      expect(result.success).toBe(true);
    });

    it('应通过合法的 sse 连接配置校验', () => {
      const result = TestMcpConnectionDto.schema.safeParse({
        connection: {
          transportType: 'sse',
          url: 'https://example.com/sse',
        },
      });

      expect(result.success).toBe(true);
    });

    it('应通过合法的 streamable_http 连接配置校验', () => {
      const result = TestMcpConnectionDto.schema.safeParse({
        connection: {
          transportType: 'streamable_http',
          url: 'https://example.com/mcp',
        },
      });

      expect(result.success).toBe(true);
    });

    it('缺少必填字段时应校验失败', () => {
      const result = TestMcpConnectionDto.schema.safeParse({
        connection: {
          transportType: 'stdio',
        },
      });

      expect(result.success).toBe(false);
      if (result.success) {
        expect.unreachable('预期缺少 command 时校验失败');
      }

      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'connection.command',
        ),
      ).toBe(true);
    });

    it('url 非法时应校验失败', () => {
      const result = TestMcpConnectionDto.schema.safeParse({
        connection: {
          transportType: 'sse',
          url: 'not-a-valid-url',
        },
      });

      expect(result.success).toBe(false);
      if (result.success) {
        expect.unreachable('预期非法 url 校验失败');
      }

      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'connection.url',
        ),
      ).toBe(true);
    });

    it('transportType 非法时应校验失败', () => {
      const result = TestMcpConnectionDto.schema.safeParse({
        connection: {
          transportType: 'http',
          url: 'https://example.com/mcp',
        },
      });

      expect(result.success).toBe(false);
      if (result.success) {
        expect.unreachable('预期非法 transportType 校验失败');
      }

      expect(result.error.issues.length).toBeGreaterThan(0);
    });
  });

  describe('DiscoverMcpToolsDto', () => {
    it('应通过合法连接配置校验', () => {
      const result = DiscoverMcpToolsDto.schema.safeParse({
        connection: {
          transportType: 'streamable_http',
          url: 'https://example.com/mcp',
        },
      });

      expect(result.success).toBe(true);
    });

    it('缺少 connection 时应校验失败', () => {
      const result = DiscoverMcpToolsDto.schema.safeParse({});

      expect(result.success).toBe(false);
      if (result.success) {
        expect.unreachable('预期缺少 connection 时校验失败');
      }

      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'connection',
        ),
      ).toBe(true);
    });
  });

  describe('ImportMcpToolsDto', () => {
    it('应通过合法导入请求校验', () => {
      const result = ImportMcpToolsDto.schema.safeParse({
        serverName: 'Filesystem Server',
        serverDescription: '文件系统工具服务',
        connection: {
          transportType: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
        toolNames: ['search-files', 'read-file'],
      });

      expect(result.success).toBe(true);
    });

    it('缺少 serverName 时应校验失败', () => {
      const result = ImportMcpToolsDto.schema.safeParse({
        connection: {
          transportType: 'stdio',
          command: 'node',
        },
        toolNames: ['search-files'],
      });

      expect(result.success).toBe(false);
      if (result.success) {
        expect.unreachable('预期缺少 serverName 时校验失败');
      }

      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'serverName',
        ),
      ).toBe(true);
    });

    it('toolNames 非法时应校验失败', () => {
      const result = ImportMcpToolsDto.schema.safeParse({
        serverName: 'Filesystem Server',
        connection: {
          transportType: 'stdio',
          command: 'node',
        },
        toolNames: [],
      });

      expect(result.success).toBe(false);
      if (result.success) {
        expect.unreachable('预期非法 toolNames 校验失败');
      }

      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'toolNames',
        ),
      ).toBe(true);
    });

    it('缺少 toolNames 时应校验失败', () => {
      const result = ImportMcpToolsDto.schema.safeParse({
        serverName: 'Filesystem Server',
        connection: {
          transportType: 'stdio',
          command: 'node',
        },
      });

      expect(result.success).toBe(false);
      if (result.success) {
        expect.unreachable('预期缺少 toolNames 校验失败');
      }

      expect(
        result.error.issues.some(
          (issue) => issue.path.join('.') === 'toolNames',
        ),
      ).toBe(true);
    });
  });
});

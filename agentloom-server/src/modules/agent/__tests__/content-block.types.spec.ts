import { describe, expect, it } from 'vitest'

import {
  AudioContentBlockSchema,
  ContentBlockArraySchema,
  ContentBlockSchema,
  ImageContentBlockSchema,
  isAudioContentBlock,
  isImageContentBlock,
  isResourceContentBlock,
  isResourceLinkContentBlock,
  isTextContentBlock,
  ResourceContentBlockSchema,
  ResourceLinkContentBlockSchema,
  TextContentBlockSchema,
} from '../types/content-block.types'

describe('ContentBlock Zod Schema', () => {
  // ─── TextContentBlock ───────────────────────────────────

  describe('TextContentBlockSchema', () => {
    it('应解析有效的文本内容块', () => {
      const input = { type: 'text', text: 'hello world' }
      const result = TextContentBlockSchema.parse(input)
      expect(result).toEqual(input)
    })

    it('应拒绝空文本', () => {
      const input = { type: 'text', text: '' }
      expect(() => TextContentBlockSchema.parse(input)).toThrow('文本内容不能为空')
    })

    it('应拒绝缺少 text 字段', () => {
      const input = { type: 'text' }
      expect(() => TextContentBlockSchema.parse(input)).toThrow()
    })

    it('应 strip 多余字段', () => {
      const input = { type: 'text', text: 'hello', extra: 'field' }
      const result = TextContentBlockSchema.parse(input)
      expect(result).not.toHaveProperty('extra')
    })
  })

  // ─── ImageContentBlock ──────────────────────────────────

  describe('ImageContentBlockSchema', () => {
    it('应解析有效的图片内容块', () => {
      const input = { type: 'image', data: 'base64data', mimeType: 'image/png' }
      const result = ImageContentBlockSchema.parse(input)
      expect(result).toEqual(input)
    })

    it('应拒绝非 image/ 开头的 mimeType', () => {
      const input = { type: 'image', data: 'base64data', mimeType: 'text/plain' }
      expect(() => ImageContentBlockSchema.parse(input)).toThrow('mimeType 必须以 image/ 开头')
    })

    it('应接受 image/jpeg mimeType', () => {
      const input = { type: 'image', data: 'data', mimeType: 'image/jpeg' }
      expect(() => ImageContentBlockSchema.parse(input)).not.toThrow()
    })

    it('应拒绝空 data', () => {
      const input = { type: 'image', data: '', mimeType: 'image/png' }
      expect(() => ImageContentBlockSchema.parse(input)).toThrow('图片数据不能为空')
    })
  })

  // ─── AudioContentBlock ──────────────────────────────────

  describe('AudioContentBlockSchema', () => {
    it('应解析有效的音频内容块', () => {
      const input = { type: 'audio', data: 'base64audio', mimeType: 'audio/mp3' }
      const result = AudioContentBlockSchema.parse(input)
      expect(result).toEqual(input)
    })

    it('应拒绝非 audio/ 开头的 mimeType', () => {
      const input = { type: 'audio', data: 'data', mimeType: 'video/mp4' }
      expect(() => AudioContentBlockSchema.parse(input)).toThrow('mimeType 必须以 audio/ 开头')
    })
  })

  // ─── ResourceContentBlock ───────────────────────────────

  describe('ResourceContentBlockSchema', () => {
    it('应解析只有 URI 的资源内容块', () => {
      const input = { type: 'resource', uri: 'file:///tmp/test.txt' }
      const result = ResourceContentBlockSchema.parse(input)
      expect(result.uri).toBe('file:///tmp/test.txt')
    })

    it('应解析带可选字段的资源内容块', () => {
      const input = {
        type: 'resource',
        uri: 'file:///tmp/test.txt',
        text: 'file content',
        mimeType: 'text/plain',
      }
      const result = ResourceContentBlockSchema.parse(input)
      expect(result.text).toBe('file content')
      expect(result.mimeType).toBe('text/plain')
    })

    it('应解析带 blob 的资源内容块', () => {
      const input = {
        type: 'resource',
        uri: 'file:///img.png',
        blob: 'base64blob',
        mimeType: 'image/png',
      }
      const result = ResourceContentBlockSchema.parse(input)
      expect(result.blob).toBe('base64blob')
    })

    it('应拒绝空 URI', () => {
      const input = { type: 'resource', uri: '' }
      expect(() => ResourceContentBlockSchema.parse(input)).toThrow('URI 不能为空')
    })
  })

  // ─── ResourceLinkContentBlock ───────────────────────────

  describe('ResourceLinkContentBlockSchema', () => {
    it('应解析只有 URI 的资源链接', () => {
      const input = { type: 'resource_link', uri: 'https://example.com/doc' }
      const result = ResourceLinkContentBlockSchema.parse(input)
      expect(result.uri).toBe('https://example.com/doc')
    })

    it('应解析带可选字段的资源链接', () => {
      const input = {
        type: 'resource_link',
        uri: 'https://example.com/doc',
        title: '示例文档',
        mimeType: 'application/pdf',
      }
      const result = ResourceLinkContentBlockSchema.parse(input)
      expect(result.title).toBe('示例文档')
    })
  })

  // ─── ContentBlock 判别联合 ──────────────────────────────

  describe('ContentBlockSchema (判别联合)', () => {
    it('应根据 type 字段正确区分各变体', () => {
      expect(ContentBlockSchema.parse({ type: 'text', text: 'hi' }).type).toBe('text')
      expect(ContentBlockSchema.parse({ type: 'image', data: 'd', mimeType: 'image/png' }).type).toBe('image')
      expect(ContentBlockSchema.parse({ type: 'audio', data: 'd', mimeType: 'audio/mp3' }).type).toBe('audio')
      expect(ContentBlockSchema.parse({ type: 'resource', uri: 'u' }).type).toBe('resource')
      expect(ContentBlockSchema.parse({ type: 'resource_link', uri: 'u' }).type).toBe('resource_link')
    })

    it('应拒绝无效的 type 值', () => {
      const input = { type: 'video', data: 'something' }
      expect(() => ContentBlockSchema.parse(input)).toThrow()
    })

    it('应拒绝 null 输入', () => {
      const result = ContentBlockSchema.safeParse(null)

      expect(result.success).toBe(false)
    })
  })

  // ─── ContentBlockArraySchema ────────────────────────────

  describe('ContentBlockArraySchema', () => {
    it('应解析有效的 ContentBlock 数组', () => {
      const input = [
        { type: 'text', text: 'hello' },
        { type: 'image', data: 'base64', mimeType: 'image/png' },
      ]
      const result = ContentBlockArraySchema.parse(input)
      expect(result).toHaveLength(2)
    })

    it('应拒绝空数组', () => {
      expect(() => ContentBlockArraySchema.parse([])).toThrow('至少需要一个 ContentBlock')
    })
  })

  // ─── 类型守卫 ───────────────────────────────────────────

  describe('类型守卫函数', () => {
    it('isTextContentBlock 应正确判断', () => {
      const block = ContentBlockSchema.parse({ type: 'text', text: 'test' })
      expect(isTextContentBlock(block)).toBe(true)
      expect(isImageContentBlock(block)).toBe(false)
    })

    it('isImageContentBlock 应正确判断', () => {
      const block = ContentBlockSchema.parse({ type: 'image', data: 'd', mimeType: 'image/png' })
      expect(isImageContentBlock(block)).toBe(true)
      expect(isTextContentBlock(block)).toBe(false)
    })

    it('isAudioContentBlock 应正确判断', () => {
      const block = ContentBlockSchema.parse({ type: 'audio', data: 'd', mimeType: 'audio/wav' })
      expect(isAudioContentBlock(block)).toBe(true)
    })

    it('isResourceContentBlock 应正确判断', () => {
      const block = ContentBlockSchema.parse({ type: 'resource', uri: 'file:///x' })
      expect(isResourceContentBlock(block)).toBe(true)
    })

    it('isResourceLinkContentBlock 应正确判断', () => {
      const block = ContentBlockSchema.parse({ type: 'resource_link', uri: 'https://x' })
      expect(isResourceLinkContentBlock(block)).toBe(true)
    })
  })
})

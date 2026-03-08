/**
 * 物理位置信息 - 用于追溯文档中的原始位置
 */
export interface PhysicalLocation {
  /** 页码（PDF），其他格式为 null */
  page: number | null;
  /** 段落索引（0-based） */
  paragraph: number;
  /** 所属标题（Markdown 标题），其他格式为 null */
  heading: string | null;
  /** 在全文中的字符偏移量 */
  charOffset: number;
  /** 字符长度 */
  charLength: number;
}

/**
 * 解析后的文档段落
 */
export interface ParsedSection {
  /** 段落文本内容 */
  text: string;
  /** 段落位置（不含 charLength，仅标记起始位置） */
  location: {
    page: number | null;
    paragraph: number;
    heading: string | null;
    charOffset: number;
  };
}

/**
 * 解析后的完整文档
 */
export interface ParsedDocument {
  /** 完整文本 */
  fullText: string;
  /** 按段落划分的段落列表 */
  sections: ParsedSection[];
  /** 文档元数据 */
  metadata: {
    totalPages: number | null;
    totalCharacters: number;
  };
}

/**
 * 文档分块结果
 */
export interface DocumentChunk {
  /** 分块文本内容 */
  content: string;
  /** 物理位置信息 */
  location: PhysicalLocation;
  /** token 数量 */
  tokenCount: number;
}

/**
 * 文档解析器接口
 */
export interface IDocumentParser {
  /** 该解析器支持的 MIME 类型列表 */
  readonly supportedMimeTypes: string[];
  /** 解析文档 buffer 为 ParsedDocument */
  parse(buffer: Buffer, fileName: string): Promise<ParsedDocument>;
}

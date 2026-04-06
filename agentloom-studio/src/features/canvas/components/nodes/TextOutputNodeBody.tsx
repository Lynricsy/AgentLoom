import { memo } from 'react'
import { FileText } from 'lucide-react'
import { OutputNodeBody } from '../output/OutputNodeBody'

interface TextOutputNodeBodyProps {
  nodeId: string
}

export const TextOutputNodeBody = memo(function TextOutputNodeBody({
  nodeId,
}: TextOutputNodeBodyProps) {
  return (
    <OutputNodeBody
      nodeId={nodeId}
      format="markdown"
      icon={FileText}
      title="文本输出"
      detailDescription="支持 Markdown、LaTeX、Mermaid 图和代码块的完整渲染。"
      previewMaxChars={280}
    />
  )
})

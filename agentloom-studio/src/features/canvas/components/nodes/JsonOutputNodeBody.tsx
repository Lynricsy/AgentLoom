import { memo } from 'react'
import { Braces } from 'lucide-react'
import { OutputNodeBody } from '../output/OutputNodeBody'

interface JsonOutputNodeBodyProps {
  nodeId: string
}

export const JsonOutputNodeBody = memo(function JsonOutputNodeBody({
  nodeId,
}: JsonOutputNodeBodyProps) {
  return (
    <OutputNodeBody
      nodeId={nodeId}
      format="json"
      icon={Braces}
      title="JSON 输出"
      detailDescription="优先使用结构化 JSON 视图；若输出尚未形成合法 JSON，则回退为原文展示。"
      previewMaxChars={360}
    />
  )
})

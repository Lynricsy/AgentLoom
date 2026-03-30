import { registerToolRenderer, registerToolRendererBatch } from '../registry'
import { readRendererDefinition } from './ReadRenderer'
import { writeRendererDefinition } from './WriteRenderer'
import { editRendererDefinition } from './EditRenderer'
import { bashRendererDefinition } from './BashRenderer'
import { grepRendererDefinition } from './GrepRenderer'
import { findRendererDefinition } from './FindRenderer'
import { lsRendererDefinition } from './LsRenderer'
import { ptyRendererDefinition } from './PtyRenderer'
import { memoryRendererDefinition } from './MemoryRenderer'
import { knowledgeRendererDefinition } from './KnowledgeRenderer'
import { subAgentRendererDefinition } from './SubAgentRenderer'

let registered = false

export function registerAllToolRenderers(): void {
  if (registered) return
  registered = true

  // File operation tools
  registerToolRenderer('read', readRendererDefinition)
  registerToolRenderer('write', writeRendererDefinition)
  registerToolRenderer('edit', editRendererDefinition)

  // Shell tools
  registerToolRenderer('bash', bashRendererDefinition)
  registerToolRenderer('grep', grepRendererDefinition)
  registerToolRenderer('find', findRendererDefinition)
  registerToolRenderer('ls', lsRendererDefinition)

  // PTY tools
  registerToolRendererBatch(
    ['pty_spawn', 'pty_read', 'pty_write', 'pty_list', 'pty_kill'],
    ptyRendererDefinition,
  )

  // Memory tools
  registerToolRendererBatch(
    [
      'read_memory',
      'create_memory',
      'update_memory',
      'delete_memory',
      'add_alias',
      'manage_triggers',
      'search_memory',
    ],
    memoryRendererDefinition,
  )

  // Knowledge tools
  registerToolRenderer('search_knowledge', knowledgeRendererDefinition)

  // SubAgent tools
  registerToolRendererBatch(
    ['call_subagent', 'spawn_subagent', 'wait_for_subagents', 'get_subagent_status'],
    subAgentRendererDefinition,
  )
}

export { readRendererDefinition } from './ReadRenderer'
export { writeRendererDefinition } from './WriteRenderer'
export { editRendererDefinition } from './EditRenderer'
export { bashRendererDefinition } from './BashRenderer'
export { grepRendererDefinition } from './GrepRenderer'
export { findRendererDefinition } from './FindRenderer'
export { lsRendererDefinition } from './LsRenderer'
export { ptyRendererDefinition } from './PtyRenderer'
export { memoryRendererDefinition } from './MemoryRenderer'
export { knowledgeRendererDefinition } from './KnowledgeRenderer'
export { subAgentRendererDefinition } from './SubAgentRenderer'

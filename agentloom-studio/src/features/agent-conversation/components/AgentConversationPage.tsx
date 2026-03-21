import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Send,
  Square,
  Paperclip,
  ArrowLeft,
  Loader2,
  AlertCircle,
  ImagePlus,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useAuthToken } from '@/features/auth/hooks/useAuthToken';
import { MessageList } from './MessageList';
import { SandboxComputerPanel } from './SandboxComputerPanel';
import { WorkspaceFileTree } from './WorkspaceFileTree';
import {
  useConversationMessages,
  useConversationStatus,
  useConversationActions,
  useTerminalEntries,
  useFileTree,
  useFileChanges,
  useSandboxStatus,
  useSelectedFilePath,
  useAgentName,
} from '../stores/agent-conversation.store';

interface AgentConversationPageProps {
  agentId: string;
  conversationId: string;
  onBack?: () => void;
}

const MIN_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 280;
const DEFAULT_LEFT_RATIO = 0.6;

function ResizableDivider({
  onResize,
  direction,
}: {
  onResize: (delta: number) => void;
  direction: 'horizontal' | 'vertical';
}) {
  const startPosRef = useRef(0);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startPosRef.current =
        direction === 'horizontal' ? e.clientX : e.clientY;
      (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [direction],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const currentPos =
        direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    },
    [direction, onResize],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      isDraggingRef.current = false;
      (e.target as HTMLDivElement).releasePointerCapture(e.pointerId);
    },
    [],
  );

  return (
    <div
      className={cn(
        'shrink-0 transition-colors hover:bg-info/30 active:bg-info/50',
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:w-1.5'
          : 'h-1 cursor-row-resize hover:h-1.5',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

function MessageInput({
  onSend,
  isExecuting,
  onCancel,
}: {
  onSend: (content: string) => void;
  isExecuting: boolean;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [draft, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleFileClick = useCallback(() => undefined, []);

  return (
    <div className="border-t border-border bg-surface px-4 py-3">
      <div className="flex items-end gap-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleFileClick}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            title="上传文件"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleFileClick}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            title="上传图片"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={
              isExecuting ? 'Agent 正在思考中...' : '输入消息，Enter 发送，Shift+Enter 换行'
            }
            className={cn(
              'w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5',
              'text-sm text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-info/50 focus:border-info/50',
              'min-h-[40px] max-h-[160px]',
            )}
            rows={1}
            disabled={isExecuting}
          />
        </div>

        {isExecuting ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="shrink-0 text-error border-error/30 hover:bg-error/10"
          >
            <Square className="h-3.5 w-3.5 mr-1.5" />
            停止
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!draft.trim()}
            className="shrink-0"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            发送
          </Button>
        )}
      </div>
    </div>
  );
}

function ConnectionError({ error }: { error: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-error/10 border-b border-error/20 text-xs text-error">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>连接错误: {error}</span>
    </div>
  );
}

export function AgentConversationPage({
  agentId,
  conversationId,
  onBack,
}: AgentConversationPageProps) {
  const messages = useConversationMessages();
  const status = useConversationStatus();
  const actions = useConversationActions();
  const terminalEntries = useTerminalEntries();
  const fileTree = useFileTree();
  const fileChanges = useFileChanges();
  const sandboxStatus = useSandboxStatus();
  const selectedFilePath = useSelectedFilePath();
  const agentName = useAgentName();
  const authToken = useAuthToken();
  const connectionError = useConversationStatus() === 'error'
    ? '连接失败，请刷新重试'
    : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [rightTopHeight, setRightTopHeight] = useState<number | null>(null);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  useEffect(() => {
    const a = actionsRef.current;
    const token = authTokenRef.current;
    a.connect({ conversationId, agentId, agentName: '', authToken: token });
    a.loadHistory(conversationId);

    return () => {
      a.disconnect();
    };
  }, [conversationId, agentId]);

  const initLeftWidth = useCallback(() => {
    if (leftWidth !== null) return leftWidth;
    const container = containerRef.current;
    if (!container) return MIN_LEFT_WIDTH;
    return container.offsetWidth * DEFAULT_LEFT_RATIO;
  }, [leftWidth]);

  const handleHorizontalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const totalW = container.offsetWidth;
      const current = leftWidth ?? totalW * DEFAULT_LEFT_RATIO;
      const next = Math.max(
        MIN_LEFT_WIDTH,
        Math.min(totalW - MIN_RIGHT_WIDTH, current + delta),
      );
      setLeftWidth(next);
    },
    [leftWidth],
  );

  const handleVerticalResize = useCallback(
    (delta: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rightColumn = container.querySelector('[data-right-column]');
      if (!rightColumn) return;
      const totalH = rightColumn.clientHeight;
      const minH = 120;
      const current = rightTopHeight ?? totalH * 0.6;
      const next = Math.max(minH, Math.min(totalH - minH, current + delta));
      setRightTopHeight(next);
    },
    [rightTopHeight],
  );

  const isExecuting = status === 'executing';
  const currentLeftWidth = leftWidth ?? initLeftWidth();

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              status === 'connected' || status === 'executing'
                ? 'bg-success'
                : status === 'connecting'
                  ? 'bg-warning animate-pulse'
                  : status === 'error'
                    ? 'bg-error'
                    : 'bg-muted-foreground',
            )}
          />
          <h1 className="text-sm font-medium text-foreground">
            {agentName || 'Agent'} 对话
          </h1>
        </div>
        {isExecuting && (
          <div className="flex items-center gap-1.5 text-xs text-info ml-auto">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>处理中</span>
          </div>
        )}
      </header>

      {connectionError && <ConnectionError error={connectionError} />}

      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: `${currentLeftWidth}px`, minWidth: MIN_LEFT_WIDTH }}
        >
          <div className="flex-1 overflow-hidden">
            <MessageList messages={messages} isExecuting={isExecuting} />
          </div>
          <MessageInput
            onSend={actions.sendMessage}
            isExecuting={isExecuting}
            onCancel={actions.cancelExecution}
          />
        </div>

        <ResizableDivider
          onResize={handleHorizontalResize}
          direction="horizontal"
        />

        <div
          data-right-column
          className="flex flex-col flex-1 overflow-hidden"
          style={{ minWidth: MIN_RIGHT_WIDTH }}
        >
          <div
            className="overflow-hidden"
            style={{
              height: rightTopHeight
                ? `${rightTopHeight}px`
                : '60%',
            }}
          >
            <SandboxComputerPanel
              agentName={agentName || 'Agent'}
              terminalEntries={terminalEntries}
              fileChanges={fileChanges}
              sandboxStatus={sandboxStatus}
            />
          </div>

          <ResizableDivider
            onResize={handleVerticalResize}
            direction="vertical"
          />

          <div className="flex-1 overflow-hidden">
            <WorkspaceFileTree
              tree={fileTree}
              selectedPath={selectedFilePath}
              onSelectFile={actions.selectFile}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

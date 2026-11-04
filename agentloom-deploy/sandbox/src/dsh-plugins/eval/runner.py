"""agentloom-eval 持久 Python 内核（由插件以文本内联、启动时写入会话状态目录）。

协议：stdin / stdout 各一路 NDJSON。
  请求：{"type":"exec","id","code","cwd"} | {"type":"interrupt","id"} | {"type":"exit"}
  响应：{"type":"ready","pid"}、{"type":"stream","id","name","text"}、
        {"type":"result","id","ok":true,"value","images"} | {"type":"result","id","ok":false,"error","images"}

协议通道与用户代码隔离：fd 0/1/2 在启动时被换掉（stdin → /dev/null，stdout/stderr → 捕获管道），
子进程与 C 扩展直接写 fd 的输出也归入当前 cell 的 stdout，不会污染协议。
要求 Python 3.11+。
"""

import ast
import builtins
import codecs
import contextlib
import io
import json
import linecache
import os
import queue
import shutil
import signal
import sys
import threading
import traceback
import urllib.error
import urllib.request

STREAM_CHUNK = 4096
VALUE_MAX_CHARS = 100_000
SYNC_PREFIX = b"\x00agentloom-eval-sync:"
SYNC_SUFFIX = b"\x00"
INTERRUPTED_MESSAGE = "Execution interrupted (timeout)"

# ---------------------------------------------------------------- 协议通道隔离

_proto_in = os.fdopen(os.dup(0), "r", encoding="utf-8", newline="\n")
_proto_out = os.fdopen(os.dup(1), "w", encoding="utf-8", newline="\n")
_proto_lock = threading.Lock()

_devnull = os.open(os.devnull, os.O_RDONLY)
os.dup2(_devnull, 0)
os.close(_devnull)
_capture_r, _capture_w = os.pipe()
os.dup2(_capture_w, 1)
os.dup2(_capture_w, 2)
os.close(_capture_w)
sys.stdin = open(os.devnull, "r", encoding="utf-8")
sys.stdout = io.TextIOWrapper(os.fdopen(1, "wb", buffering=0), encoding="utf-8", line_buffering=True)
sys.stderr = io.TextIOWrapper(os.fdopen(2, "wb", buffering=0), encoding="utf-8", line_buffering=True)

# 父进程若忽略 SIGINT，子进程会继承；超时中断依赖默认的 KeyboardInterrupt 行为
signal.signal(signal.SIGINT, signal.default_int_handler)


def _send(message):
    # ensure_ascii：孤立代理项等不可编码字符以 \u 转义，避免写协议时报错
    line = json.dumps(message) + "\n"
    # 主线程写协议时屏蔽 SIGINT：超时中断不能把一行 NDJSON 截成两半（解除屏蔽后照常抛出）
    on_main = threading.get_ident() == _main_ident
    if on_main:
        signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT})
    try:
        with _proto_lock:
            _proto_out.write(line)
            _proto_out.flush()
    finally:
        if on_main:
            signal.pthread_sigmask(signal.SIG_UNBLOCK, {signal.SIGINT})


# ---------------------------------------------------------------- 当前 cell 状态

_state_lock = threading.Lock()
# 输出归属与图片命名用的 cell id（cell 结束、fd 输出排空后才清空）
_current_id = None
# 可被 interrupt 打断的 cell id（用户代码执行期间）
_interruptible_id = None
_main_ident = threading.get_ident()


def _emit_stream(cell_id, name, text):
    if cell_id is None or not text:
        return
    for start in range(0, len(text), STREAM_CHUNK):
        _send({"type": "stream", "id": cell_id, "name": name, "text": text[start : start + STREAM_CHUNK]})


class _CellStream(io.TextIOBase):
    """cell 内 sys.stdout / sys.stderr 的替身：遇换行或满 4 KiB 刷出为 stream 消息。"""

    def __init__(self, name, cell_id):
        super().__init__()
        self._name = name
        self._cell_id = cell_id
        self._buffer = []
        self._size = 0
        self._lock = threading.Lock()

    @property
    def encoding(self):
        return "utf-8"

    def writable(self):
        return True

    def isatty(self):
        return False

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        with self._lock:
            self._buffer.append(text)
            self._size += len(text)
            if "\n" in text or self._size >= STREAM_CHUNK:
                self._flush_locked()
        return len(text)

    def flush(self):
        with self._lock:
            self._flush_locked()

    def _flush_locked(self):
        if not self._buffer:
            return
        text = "".join(self._buffer)
        self._buffer = []
        self._size = 0
        _emit_stream(self._cell_id, self._name, text)


# ---------------------------------------------------------------- fd 级输出捕获

_sync_events = {}
_sync_lock = threading.Lock()
_decoder = codecs.getincrementaldecoder("utf-8")("replace")


def _forward_raw(data):
    text = _decoder.decode(data)
    if not text:
        return
    with _state_lock:
        cell_id = _current_id
    _emit_stream(cell_id, "stdout", text)


def _partial_prefix_length(data):
    """data 末尾可能是半个同步标记前缀时，返回需保留的字节数。"""
    for size in range(min(len(SYNC_PREFIX) - 1, len(data)), 0, -1):
        if SYNC_PREFIX.startswith(data[-size:]):
            return size
    return 0


def _capture_loop():
    """读取 fd 1/2 管道：同步标记之前的字节归入当前 cell；标记本身用于 cell 结束时排空。"""
    pending = b""
    while True:
        try:
            chunk = os.read(_capture_r, 65536)
        except InterruptedError:
            continue
        if not chunk:
            return
        pending += chunk
        while pending:
            start = pending.find(SYNC_PREFIX)
            if start < 0:
                keep = _partial_prefix_length(pending)
                _forward_raw(pending[: len(pending) - keep])
                pending = pending[len(pending) - keep :]
                break
            end = pending.find(SYNC_SUFFIX, start + len(SYNC_PREFIX))
            if end < 0:
                _forward_raw(pending[:start])
                pending = pending[start:]
                break
            _forward_raw(pending[:start])
            token = pending[start + len(SYNC_PREFIX) : end].decode("ascii", "replace")
            pending = pending[end + len(SYNC_SUFFIX) :]
            with _sync_lock:
                event = _sync_events.pop(token, None)
            if event is not None:
                event.set()


def _drain_capture(token):
    """向 fd 1 写同步标记并等待捕获线程读到，保证 cell 内的 fd 输出先于 result 发出。"""
    event = threading.Event()
    with _sync_lock:
        _sync_events[token] = event
    try:
        os.write(1, SYNC_PREFIX + token.encode("ascii") + SYNC_SUFFIX)
    except OSError:
        return
    event.wait(2.0)


# ---------------------------------------------------------------- prelude：tool() / show()


class ToolError(Exception):
    """tool() 调用的工具返回错误。"""


_images = []
_output_dir = os.getcwd()
# 回环地址不走 HTTP(S)_PROXY
_tool_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def tool(name, **args):
    """调用 Agent 的其他工具，返回其 JSON 值；工具报错时抛 ToolError。"""
    url = os.environ.get("AGENTLOOM_EVAL_TOOL_URL")
    token = os.environ.get("AGENTLOOM_EVAL_TOOL_TOKEN")
    if not url or not token:
        raise ToolError("tool bridge is not configured")
    body = json.dumps({"name": name, "args": args}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    try:
        with _tool_opener.open(request, timeout=330) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail).get("error", detail)
        except (ValueError, AttributeError):
            pass
        raise ToolError(f"tool bridge HTTP {error.code}: {detail}") from None
    if payload.get("ok"):
        return payload.get("value")
    raise ToolError(payload.get("error") or "tool failed")


def _image_extension(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def _next_image_path(ext):
    directory = os.path.join(_output_dir, "eval-output")
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, f"{_current_id}-{len(_images) + 1}.{ext}")


def show(obj):
    """把图像交给模型：PNG/JPEG/GIF/WebP 字节、带 savefig 的对象（matplotlib）、PIL Image 或图片文件路径。"""
    if isinstance(obj, (bytes, bytearray, memoryview)):
        data = bytes(obj)
        ext = _image_extension(data)
        if ext is None:
            raise ValueError("show(): bytes are not a PNG/JPEG/GIF/WebP image")
        path = _next_image_path(ext)
        with open(path, "wb") as handle:
            handle.write(data)
    elif hasattr(obj, "savefig"):
        path = _next_image_path("png")
        obj.savefig(path, format="png")
    elif hasattr(obj, "save") and hasattr(obj, "mode") and hasattr(obj, "size"):
        path = _next_image_path("png")
        obj.save(path, format="PNG")
    elif isinstance(obj, (str, os.PathLike)):
        source = os.fspath(obj)
        with open(source, "rb") as handle:
            ext = _image_extension(handle.read(16))
        if ext is None:
            raise ValueError(f"show(): {source} is not a PNG/JPEG/GIF/WebP image")
        path = _next_image_path(ext)
        shutil.copyfile(source, path)
    else:
        raise TypeError(f"show(): unsupported object of type {type(obj).__name__}")
    _images.append(path)
    return path


_globals = {
    "__name__": "__main__",
    "__builtins__": builtins,
    "tool": tool,
    "show": show,
    "ToolError": ToolError,
}

# ---------------------------------------------------------------- 执行

_cell_counter = 0


def _format_error(exc, filename):
    """只保留 cell 自身及其调用链的栈帧，去掉 runner 内部帧。"""
    tb = exc.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename != filename:
        tb = tb.tb_next
    return "".join(traceback.format_exception(type(exc), exc, tb)).rstrip()


def _run_cell(code, filename):
    tree = ast.parse(code, filename=filename, mode="exec")
    tail = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        tail = ast.Expression(tree.body.pop().value)
    if tree.body:
        exec(compile(tree, filename, "exec"), _globals)
    if tail is None:
        return None
    value = eval(compile(tail, filename, "eval"), _globals)
    if value is None:
        return None
    text = repr(value)
    if len(text) > VALUE_MAX_CHARS:
        text = text[:VALUE_MAX_CHARS] + f"…[value truncated, {len(text) - VALUE_MAX_CHARS} chars omitted]"
    return text


def _set_interruptible(cell_id):
    global _interruptible_id
    # interrupt 可能恰在切换时到达：吞掉迟到的 KeyboardInterrupt 后重试
    while True:
        try:
            with _state_lock:
                _interruptible_id = cell_id
            return
        except KeyboardInterrupt:
            continue


def _set_current(cell_id):
    global _current_id
    with _state_lock:
        _current_id = cell_id


def _execute(request):
    global _cell_counter, _output_dir
    cell_id = str(request.get("id"))
    code = request.get("code") or ""
    _output_dir = request.get("cwd") or os.getcwd()
    _cell_counter += 1
    filename = f"<cell-{_cell_counter}>"
    linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)
    _images.clear()
    out = _CellStream("stdout", cell_id)
    err = _CellStream("stderr", cell_id)
    result = {"type": "result", "id": cell_id}
    _set_current(cell_id)
    try:
        _set_interruptible(cell_id)
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                value = _run_cell(code, filename)
            result.update(ok=True, value=value)
        except KeyboardInterrupt:
            result.update(ok=False, error=INTERRUPTED_MESSAGE)
        except SystemExit as exc:
            result.update(ok=False, error=f"SystemExit: {exc.code!r} (the kernel keeps running)")
        except BaseException as exc:  # noqa: BLE001 — 用户代码的任何异常都要回给模型
            result.update(ok=False, error=_format_error(exc, filename))
    except KeyboardInterrupt:
        result.update(ok=False, error=INTERRUPTED_MESSAGE)
    _set_interruptible(None)
    out.flush()
    err.flush()
    _drain_capture(f"{cell_id}:{_cell_counter}")
    _set_current(None)
    result["images"] = list(_images)
    _send(result)


# ---------------------------------------------------------------- 请求读取


def _reader(requests):
    for line in _proto_in:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except ValueError:
            continue
        kind = message.get("type")
        if kind == "interrupt":
            with _state_lock:
                if _interruptible_id is not None and _interruptible_id == str(message.get("id")):
                    signal.pthread_kill(_main_ident, signal.SIGINT)
        elif kind in ("exec", "exit"):
            requests.put(message)
    requests.put({"type": "exit"})


def main():
    requests = queue.Queue()
    threading.Thread(target=_capture_loop, name="agentloom-eval-capture", daemon=True).start()
    threading.Thread(target=_reader, args=(requests,), name="agentloom-eval-reader", daemon=True).start()
    _send({"type": "ready", "pid": os.getpid()})
    while True:
        try:
            message = requests.get()
        except KeyboardInterrupt:
            continue
        if message.get("type") == "exit":
            break
        _execute(message)
    _proto_out.flush()
    os._exit(0)


main()

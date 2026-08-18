import json
import logging
import sys
from datetime import datetime, timezone

# LogRecord built-ins that we never want to echo as extra fields
_BUILTIN_ATTRS = frozenset({
    "args", "created", "exc_info", "exc_text", "filename", "funcName",
    "levelname", "levelno", "lineno", "message", "module", "msecs", "msg",
    "name", "pathname", "process", "processName", "relativeCreated",
    "stack_info", "thread", "threadName", "taskName",
})


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out: dict = {
            "ts":     datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level":  record.levelname,
            "logger": record.name,
            "msg":    record.getMessage(),
        }
        # Attach any extra= fields passed by the caller
        out.update({k: v for k, v in record.__dict__.items() if k not in _BUILTIN_ATTRS})
        if record.exc_info:
            out["exception"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

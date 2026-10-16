"""Best-effort per-account login throttling. Use shared Redis limits when scaling workers."""
from collections import defaultdict, deque
from threading import Lock
from time import monotonic

_WINDOW = 15 * 60
_MAX_FAILURES = 10
_attempts = defaultdict(deque)
_lock = Lock()


def _key(identifier: str) -> str:
    return str(identifier).strip().casefold()


def locked_out(identifier: str) -> bool:
    key = _key(identifier)
    with _lock:
        now = monotonic()
        attempts = _attempts[key]
        while attempts and now - attempts[0] > _WINDOW:
            attempts.popleft()
        return len(attempts) >= _MAX_FAILURES


def record_failure(identifier: str) -> None:
    key = _key(identifier)
    with _lock:
        # Do not retain an unbounded number of usernames in a long-lived process.
        if len(_attempts) > 10000:
            _attempts.clear()
        attempts = _attempts[key]
        now = monotonic()
        while attempts and now - attempts[0] > _WINDOW:
            attempts.popleft()
        if len(attempts) < _MAX_FAILURES:
            attempts.append(now)


def clear_failures(identifier: str) -> None:
    with _lock:
        _attempts.pop(_key(identifier), None)

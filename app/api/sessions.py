"""In-memory session store with rolling 8-turn memory."""
from __future__ import annotations
import uuid
from collections import deque
from dataclasses import dataclass, field

MAX_TURNS = 8


@dataclass
class Session:
    session_id: str
    memory: deque = field(default_factory=lambda: deque(maxlen=MAX_TURNS * 2))

    def add_turn(self, user_msg: str, assistant_msg: str) -> None:
        self.memory.append({"role": "user", "content": user_msg})
        self.memory.append({"role": "assistant", "content": assistant_msg})

    def get_memory(self) -> list[dict]:
        return list(self.memory)


class SessionStore:
    def __init__(self):
        self._sessions: dict[str, Session] = {}

    def create(self) -> Session:
        sid = str(uuid.uuid4())
        s = Session(session_id=sid)
        self._sessions[sid] = s
        return s

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def get_or_create(self, session_id: str | None) -> Session:
        if session_id and session_id in self._sessions:
            return self._sessions[session_id]
        return self.create()

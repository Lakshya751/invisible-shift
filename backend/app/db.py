"""SQLite persistence via SQLAlchemy. The workspace is stored as a validated
JSON document — simple, reliable, and enough for a single-family prototype."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

from .models import Workspace


class Base(DeclarativeBase):
    pass


class WorkspaceRow(Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Store:
    def __init__(self, url: str = "sqlite:///./invisible_shift.db"):
        kwargs = {"connect_args": {"check_same_thread": False}}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
        self.engine = create_engine(url, **kwargs)
        Base.metadata.create_all(self.engine)

    def load(self, wid: str = "default") -> Optional[Workspace]:
        with Session(self.engine) as s:
            row = s.get(WorkspaceRow, wid)
            return Workspace.model_validate_json(row.data) if row else None

    def save(self, ws: Workspace, wid: str = "default") -> None:
        with Session(self.engine) as s:
            row = s.get(WorkspaceRow, wid)
            payload = ws.model_dump_json()
            if row:
                row.data = payload
                row.updated_at = datetime.utcnow()
            else:
                s.add(WorkspaceRow(id=wid, data=payload, updated_at=datetime.utcnow()))
            s.commit()

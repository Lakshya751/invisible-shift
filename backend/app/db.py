"""SQLite persistence via SQLAlchemy.

Tables:
  users              — accounts (and temporary guest users for the live demo)
  sessions           — login sessions (only a SHA-256 hash of the token is stored)
  patient_workspaces — one validated JSON workspace per patient, owned by a user
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

from .models import Workspace

SESSION_DAYS = 14


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    email: Mapped[Optional[str]] = mapped_column(String(254), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SessionRow(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    active_patient_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class PatientRow(Base):
    __tablename__ = "patient_workspaces"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    data: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Store:
    def __init__(self, url: str = "sqlite:///./invisible_shift.db"):
        kwargs = {"connect_args": {"check_same_thread": False}}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
        self.engine = create_engine(url, **kwargs)
        Base.metadata.create_all(self.engine)

    # ------------------------------------------------------------ users
    def create_user(self, name: str, email: Optional[str], password_hash: Optional[str], is_guest: bool = False) -> UserRow:
        with Session(self.engine, expire_on_commit=False) as s:
            u = UserRow(id=f"u-{uuid.uuid4().hex[:16]}", name=name, email=email, password_hash=password_hash, is_guest=is_guest)
            s.add(u)
            s.commit()
            return u

    def get_user(self, user_id: str) -> Optional[UserRow]:
        with Session(self.engine, expire_on_commit=False) as s:
            return s.get(UserRow, user_id)

    def get_user_by_email(self, email: str) -> Optional[UserRow]:
        with Session(self.engine, expire_on_commit=False) as s:
            return s.scalars(select(UserRow).where(UserRow.email == email)).first()

    def upgrade_guest(self, user_id: str, name: str, email: str, password_hash: str) -> UserRow:
        with Session(self.engine, expire_on_commit=False) as s:
            u = s.get(UserRow, user_id)
            assert u is not None
            u.name, u.email, u.password_hash, u.is_guest = name, email, password_hash, False
            s.commit()
            return u

    # ------------------------------------------------------------ sessions
    def create_session(self, user_id: str, active_patient_id: Optional[str] = None) -> str:
        token = secrets.token_urlsafe(32)
        with Session(self.engine) as s:
            s.add(
                SessionRow(
                    token_hash=_hash_token(token),
                    user_id=user_id,
                    active_patient_id=active_patient_id,
                    expires_at=datetime.utcnow() + timedelta(days=SESSION_DAYS),
                )
            )
            s.commit()
        return token

    def get_session(self, token: str) -> Optional[SessionRow]:
        with Session(self.engine, expire_on_commit=False) as s:
            row = s.get(SessionRow, _hash_token(token))
            if row is None:
                return None
            if row.expires_at < datetime.utcnow():
                s.delete(row)
                s.commit()
                return None
            return row

    def set_active_patient(self, token: str, patient_id: Optional[str]) -> None:
        with Session(self.engine) as s:
            row = s.get(SessionRow, _hash_token(token))
            if row:
                row.active_patient_id = patient_id
                s.commit()

    def delete_session(self, token: str) -> None:
        with Session(self.engine) as s:
            row = s.get(SessionRow, _hash_token(token))
            if row:
                s.delete(row)
                s.commit()

    # ------------------------------------------------------------ patients
    def create_patient(self, user_id: str, ws: Workspace) -> str:
        pid = f"p-{uuid.uuid4().hex[:12]}"
        with Session(self.engine) as s:
            s.add(PatientRow(id=pid, user_id=user_id, data=ws.model_dump_json()))
            s.commit()
        return pid

    def list_patients(self, user_id: str) -> List[PatientRow]:
        with Session(self.engine, expire_on_commit=False) as s:
            return list(s.scalars(select(PatientRow).where(PatientRow.user_id == user_id).order_by(PatientRow.created_at)))

    def load(self, user_id: str, patient_id: str) -> Optional[Workspace]:
        with Session(self.engine) as s:
            row = s.get(PatientRow, patient_id)
            if row is None or row.user_id != user_id:
                return None
            return Workspace.model_validate_json(row.data)

    def save(self, user_id: str, patient_id: str, ws: Workspace) -> None:
        with Session(self.engine) as s:
            row = s.get(PatientRow, patient_id)
            if row is None or row.user_id != user_id:
                raise KeyError(patient_id)
            row.data = ws.model_dump_json()
            row.updated_at = datetime.utcnow()
            s.commit()

    def delete_patient(self, user_id: str, patient_id: str) -> bool:
        with Session(self.engine) as s:
            row = s.get(PatientRow, patient_id)
            if row is None or row.user_id != user_id:
                return False
            s.delete(row)
            s.commit()
            return True

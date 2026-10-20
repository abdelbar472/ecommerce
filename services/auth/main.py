"""
AUTH SERVICE (port 8004)

1. Register users  (public register -> client or merchant/seller)
2. Login -> issue JWT (sub, email, role)
3. Validate token (/me and /validate)
4. Admin: create users with role, change roles, list users

All services share JWT_SECRET via services.auth.security and enforce RBAC
with `require_role`.
"""

from datetime import datetime
from typing import Optional, Literal
from uuid import uuid4
import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import create_engine, Column, String, DateTime, Boolean
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from passlib.context import CryptContext

from services.auth.security import (
    create_access_token,
    decode_token,
    security,
    require_role,
)

# ---------- Config ----------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/users",
)

# ---------- Security ----------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------- Database ----------
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
pool_kwargs = (
    {}
    if DATABASE_URL.startswith("sqlite")
    else {"pool_size": 20, "max_overflow": 20, "pool_timeout": 30}
)
engine = create_engine(DATABASE_URL, connect_args=connect_args, **pool_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="client", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---------- Schemas ----------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: Optional[str] = None
    # Self-service sign-up can create a customer (cx) or a seller (merchant).
    # Admin accounts are only ever created by an existing admin.
    role: Literal["client", "merchant"] = "client"


class AdminCreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: Optional[str] = None
    role: Literal["admin", "merchant", "client"] = "client"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    role: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    is_active: bool
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class SetRoleRequest(BaseModel):
    role: Literal["admin", "merchant", "client"]


class ValidateResponse(BaseModel):
    valid: bool
    user_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


# ---------- App ----------
app = FastAPI(title="Auth Service")


@app.on_event("startup")
def ensure_admin():
    """Create a default admin on first boot so the demo is usable."""
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.role == "admin").first():
            email = os.getenv("ADMIN_EMAIL", "admin@example.com").lower()
            password = os.getenv("ADMIN_PASSWORD", "admin123")
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                existing.role = "admin"
            else:
                db.add(
                    User(
                        id=str(uuid4()),
                        email=email,
                        hashed_password=hash_password(password),
                        full_name="Admin",
                        role="admin",
                        is_active=True,
                    )
                )
            db.commit()
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok", "service": "auth"}


@app.post("/auth/register", response_model=UserResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        id=str(uuid4()),
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/admin/users", response_model=UserResponse, status_code=201)
def admin_create_user(
    payload: AdminCreateUserRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        id=str(uuid4()),
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")

    role = user.role or "client"
    token = create_access_token(
        {"sub": user.id, "email": user.email, "role": role, "party": role}
    )
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        role=role,
    )


@app.get("/auth/me", response_model=UserResponse)
def me(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@app.get("/auth/validate", response_model=ValidateResponse)
def validate_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """Other services can call this to check a JWT without sharing the secret."""
    if credentials is None:
        return ValidateResponse(valid=False)
    try:
        payload = decode_token(credentials.credentials)
        return ValidateResponse(
            valid=True,
            user_id=payload.get("sub"),
            email=payload.get("email"),
            role=payload.get("role") or "client",
        )
    except HTTPException:
        return ValidateResponse(valid=False)


@app.get("/auth/users", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    return db.query(User).order_by(User.created_at.desc()).all()


@app.patch("/auth/users/{user_id}/role", response_model=UserResponse)
def set_user_role(
    user_id: str,
    body: SetRoleRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_role(["admin"])),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = body.role
    db.commit()
    db.refresh(user)
    return user

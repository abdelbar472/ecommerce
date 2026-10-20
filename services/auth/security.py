"""
SHARED SECURITY

Single source of truth for JWT config and helpers used by every service.
All services share the same JWT_SECRET so tokens issued by the Auth Service
can be verified locally (no network hop) everywhere else.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal, List

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

# ---------- Config ----------
SECRET_KEY = os.getenv("JWT_SECRET", "kafka-demo-secret-change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
ISSUER = "fk-auth"

Role = Literal["admin", "merchant", "client"]

security = HTTPBearer(auto_error=False)


# ---------- Helpers ----------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iss": ISSUER})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token, SECRET_KEY, algorithms=[ALGORITHM], issuer=ISSUER
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """FastAPI dependency: returns the decoded token payload (sub, email, role, exp)."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)


def require_role(allowed_roles: List[Role]):
    """Dependency factory enforcing RBAC by role in JWT."""

    def _require_role(user: dict = Depends(get_current_user)) -> dict:
        role = user.get("role") or user.get("party") or "client"
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _require_role

from __future__ import annotations

import os

import jwt
from fastapi import Header, HTTPException
from jwt import InvalidTokenError

from .schemas import Principal

ROLE_SCOPES = {
    "AGENT": {"case:read", "case:approve_reply"},
    "SUPERVISOR": {"case:read", "case:approve_reply", "case:approve_action"},
    "RISK_MANAGER": {"case:read", "case:approve_reply", "case:approve_action"},
    "ADMIN": {"case:read", "case:approve_reply", "case:approve_action"},
}


async def current_principal(
    authorization: str | None = Header(default=None),
    x_agent_id: str | None = Header(default=None),
    x_agent_role: str | None = Header(default=None),
) -> Principal:
    """
    Demo mode uses explicit identity headers. Production rejects header-only identity;
    the gateway must pass a verified bearer identity/JWT after authentication.
    """

    demo_mode = os.getenv("CAREPULSE_DEMO_MODE", "true").lower() == "true"
    if demo_mode:
        role = (x_agent_role or "AGENT").upper()
        agent_id = x_agent_id or "agent_demo"
    else:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="verified bearer token required")
        secret = os.getenv("CAREPULSE_JWT_SECRET")
        if not secret:
            raise HTTPException(status_code=503, detail="JWT verifier is not configured")
        try:
            claims = jwt.decode(
                authorization.removeprefix("Bearer ").strip(),
                secret,
                algorithms=["HS256"],
                issuer=os.getenv("CAREPULSE_JWT_ISSUER", "carepulse"),
                audience=os.getenv("CAREPULSE_JWT_AUDIENCE", "carepulse-api"),
                options={"require": ["sub", "role", "exp", "iss", "aud"]},
            )
        except InvalidTokenError as exc:
            raise HTTPException(status_code=401, detail="invalid bearer token") from exc
        role = str(claims["role"]).upper()
        agent_id = str(claims["sub"])

    scopes = ROLE_SCOPES.get(role)
    if scopes is None:
        raise HTTPException(status_code=403, detail="unknown agent role")
    return Principal(agent_id=agent_id, role=role, scopes=scopes)

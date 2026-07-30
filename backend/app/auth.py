from __future__ import annotations

import os

from fastapi import Header, HTTPException

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
        # The production gateway replaces this compact adapter with JWT verification.
        role = (x_agent_role or "").upper()
        agent_id = x_agent_id or ""
        if not role or not agent_id:
            raise HTTPException(status_code=401, detail="verified identity headers required")

    scopes = ROLE_SCOPES.get(role)
    if scopes is None:
        raise HTTPException(status_code=403, detail="unknown agent role")
    return Principal(agent_id=agent_id, role=role, scopes=scopes)

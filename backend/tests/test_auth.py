from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import HTTPException

from app.auth import current_principal


def token(secret: str, *, subject: str = "agent_7", role: str = "AGENT") -> str:
    return jwt.encode(
        {
            "sub": subject,
            "role": role,
            "iss": "carepulse",
            "aud": "carepulse-api",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        secret,
        algorithm="HS256",
    )


def test_production_identity_comes_from_verified_jwt(monkeypatch):
    secret = "test-secret-with-enough-entropy"
    monkeypatch.setenv("CAREPULSE_DEMO_MODE", "false")
    monkeypatch.setenv("CAREPULSE_JWT_SECRET", secret)

    principal = asyncio.run(
        current_principal(
            authorization=f"Bearer {token(secret)}",
            x_agent_id="spoofed-supervisor",
            x_agent_role="SUPERVISOR",
        )
    )

    assert principal.agent_id == "agent_7"
    assert principal.role == "AGENT"


def test_production_rejects_invalid_jwt(monkeypatch):
    monkeypatch.setenv("CAREPULSE_DEMO_MODE", "false")
    monkeypatch.setenv("CAREPULSE_JWT_SECRET", "expected-secret")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            current_principal(
                authorization=f"Bearer {token('wrong-secret')}",
                x_agent_id=None,
                x_agent_role=None,
            )
        )

    assert exc.value.status_code == 401

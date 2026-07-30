from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select

from .db import create_database, ensure_schema
from .db_models import OutboxEvent

log = structlog.get_logger()
MAX_ATTEMPTS = 5


async def dispatch(event: OutboxEvent) -> None:
    """Replace with typed OMS/CRM adapters; idempotency_key must be forwarded downstream."""

    log.info(
        "outbox_dispatch",
        event_id=event.id,
        action=event.action_type,
        idempotency_key=event.idempotency_key,
    )


async def process_batch(sessions) -> int:
    processed = 0
    now = datetime.now(UTC)
    async with sessions.begin() as session:
        events = list(
            (
                await session.scalars(
                    select(OutboxEvent)
                    .where(
                        OutboxEvent.status.in_(["PENDING", "RETRY"]),
                        OutboxEvent.next_attempt_at <= now,
                    )
                    .order_by(OutboxEvent.created_at)
                    .limit(20)
                    .with_for_update(skip_locked=True)
                )
            ).all()
        )
        for event in events:
            try:
                await dispatch(event)
                event.status = "PROCESSED"
                event.processed_at = now
                processed += 1
            except (ConnectionError, RuntimeError, TimeoutError) as exc:
                event.attempts += 1
                event.last_error = str(exc)[:2000]
                if event.attempts >= MAX_ATTEMPTS:
                    event.status = "DEAD_LETTER"
                else:
                    event.status = "RETRY"
                    event.next_attempt_at = now + timedelta(
                        seconds=min(300, 2**event.attempts)
                    )
    return processed


async def main() -> None:
    database_url = os.environ["DATABASE_URL"]
    engine, sessions = create_database(database_url)
    await ensure_schema(engine)
    try:
        while True:
            processed = await process_batch(sessions)
            await asyncio.sleep(0.2 if processed else 2)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())

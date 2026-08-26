"""Pydantic request/response models for the reconcile function."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ReconcileRequest(BaseModel):
    """
    Body of ``POST /reconcile``.

    The same request shape serves both the daily safety net (small, default
    caps) and the one-time full rebuild (both caps raised) — see the README.
    """

    limit: int = Field(
        default=50, ge=1, le=200_000, description="How many recent old-channel messages to scan"
    )
    ingest_limit: Optional[int] = Field(
        default=None,
        ge=1,
        le=200_000,
        description=(
            "Max missing messages to ingest this run (each costs one Gemini call). "
            "Defaults to the RECONCILE_INGEST_LIMIT env var."
        ),
    )


class MessageOutcome(BaseModel):
    """What happened when one missing old-channel message was ingested."""

    source_message_id: int
    action: str  # created | updated | unchanged | failed
    error: Optional[str] = None


class ReconcileResponse(BaseModel):
    """Result of ``POST /reconcile``."""

    ok: bool
    #: Old-channel messages with text scanned this run.
    checked: int
    #: Of those, how many had no row under ``source_channel == "old"``.
    missing: int
    #: Missing messages actually ingested this run (bounded by ``ingest_limit``).
    ingested: int
    #: Missing messages left for a future run because the cap was hit.
    deferred: int
    failed: int
    outcomes: List[MessageOutcome] = []


class HealthResponse(BaseModel):
    """Result of ``GET /health``."""

    status: str
    environment: str
    telegram: Dict[str, Any]
    next_api: Dict[str, Any]

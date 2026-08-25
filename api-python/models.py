"""Pydantic request/response models for the reconcile function."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ReconcileRequest(BaseModel):
    """Body of ``POST /reconcile``."""

    limit: int = Field(default=50, ge=1, le=500, description="How many recent messages to check")
    with_photos: bool = Field(
        default=True,
        description="Download and forward photos for messages missing from the DB",
    )


class MessageOutcome(BaseModel):
    """What happened to one channel message."""

    telegram_id: int
    action: str  # created | updated | unchanged | skipped | failed
    error: Optional[str] = None


class ReconcileResponse(BaseModel):
    """Result of ``POST /reconcile``."""

    ok: bool
    checked: int
    upserted: int
    unchanged: int
    failed: int
    outcomes: List[MessageOutcome] = []
    mirror: Optional[Dict[str, Any]] = None


class ImportHistoryRequest(BaseModel):
    """Body of ``POST /import-history``."""

    offset_id: int = Field(
        default=0,
        ge=0,
        description="Start below this message id; 0 starts at the newest message",
    )
    limit: int = Field(default=100, ge=1, le=500, description="Messages per page")
    with_photos: bool = Field(default=True, description="Download and forward photos")


class ImportHistoryResponse(BaseModel):
    """Result of one ``POST /import-history`` page."""

    ok: bool
    processed: int
    upserted: int
    failed: int
    next_offset_id: Optional[int] = None
    has_more: bool = False
    outcomes: List[MessageOutcome] = []


class HealthResponse(BaseModel):
    """Result of ``GET /health``."""

    status: str
    environment: str
    telegram: Dict[str, Any]
    next_api: Dict[str, Any]

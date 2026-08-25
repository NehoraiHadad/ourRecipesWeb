"""
HTTP client for the Next.js internal API.

This service holds **no database credentials** (ARCHITECTURE §4.6): every read
and write goes through `/api/internal/*` on the Next app, authenticated with
`INTERNAL_API_SECRET`. That keeps one ingest implementation — the same one the
Telegram webhook uses — instead of a second, drifting writer.
"""

import hashlib
from types import TracebackType
from typing import Any, Dict, Iterable, Optional, Type

import httpx

from config import logger, settings


def content_hash(text: str) -> str:
    """
    SHA-256 of the message text, matching `contentHash` in the Next route
    (`src/app/api/internal/recipes/summary/route.ts`).
    """
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


class NextInternalClient:
    """Async context manager wrapping the internal endpoints."""

    def __init__(self, base_url: Optional[str] = None, secret: Optional[str] = None):
        self.base_url = (base_url or settings.NEXT_BASE_URL).rstrip("/")
        self.secret = secret or settings.INTERNAL_API_SECRET
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "NextInternalClient":
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=settings.HTTP_TIMEOUT_SECONDS,
            headers={"Authorization": f"Bearer {self.secret}"},
        )
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc: Optional[BaseException],
        tb: Optional[TracebackType],
    ) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("NextInternalClient must be used as an async context manager")
        return self._client

    async def summary(self, telegram_ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
        """
        Fetch stored content hashes for the given message ids.

        Returns:
            ``{telegram_id: {"content_hash": str, "has_image": bool, ...}}``.
            Ids absent from the result do not exist in the DB.
        """
        ids = [str(i) for i in telegram_ids]
        if not ids:
            return {}

        response = await self.client.get(
            "/api/internal/recipes/summary",
            params={"ids": ",".join(ids), "limit": len(ids)},
        )
        response.raise_for_status()
        payload = response.json()

        return {item["telegram_id"]: item for item in payload.get("recipes", [])}

    async def upsert(
        self,
        telegram_id: int,
        text: str,
        date: Optional[str] = None,
        photo_base64: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Upsert one channel message. Idempotent — identical content is a no-op."""
        body: Dict[str, Any] = {"telegram_id": telegram_id, "text": text}
        if date:
            body["date"] = date
        if photo_base64:
            body["photo_base64"] = photo_base64

        response = await self.client.post("/api/internal/recipes/upsert", json=body)
        response.raise_for_status()
        return response.json()

    async def mirror_pending(self, limit: int = 20) -> Dict[str, Any]:
        """Ask Next to retry recipes whose Telegram mirror failed."""
        response = await self.client.post(
            "/api/internal/mirror-pending", json={"limit": limit}
        )
        response.raise_for_status()
        return response.json()


async def safe_mirror_pending(client: NextInternalClient, limit: int = 20) -> Dict[str, Any]:
    """`mirror_pending` that reports failure instead of raising — it is a tail task."""
    try:
        return await client.mirror_pending(limit)
    except Exception as error:  # noqa: BLE001 — best-effort by design
        logger.warning("mirror_pending_failed", error=str(error))
        return {"ok": False, "error": str(error)}

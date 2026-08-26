"""
HTTP client for the Next.js internal API.

This service holds **no database credentials** (ARCHITECTURE §4.6): every read
and write goes through `/api/internal/*` on the Next app, authenticated with
`INTERNAL_API_SECRET`. That keeps one ingest implementation — the same one the
Telegram webhook uses — instead of a second, drifting writer.
"""

from types import TracebackType
from typing import Any, Dict, Iterable, Optional, Type

import httpx

from config import settings


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

    #: The summary route accepts at most this many ids per request.
    SUMMARY_BATCH = 500

    async def summary_old_channel(self, message_ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
        """
        Fetch which of the given old-channel message ids already have a row.

        Returns ``{source_message_id: {...}}``. An id absent from the result
        has no row yet under ``source_channel == "old"`` and is a candidate
        for ``/old-channel/ingest``. Batched in chunks of ``SUMMARY_BATCH``
        so the full-rebuild scan (thousands of ids) works unchanged.
        """
        wanted = sorted({int(i) for i in message_ids})
        if not wanted:
            return {}

        known: Dict[int, Dict[str, Any]] = {}
        for start in range(0, len(wanted), self.SUMMARY_BATCH):
            batch = wanted[start : start + self.SUMMARY_BATCH]
            response = await self.client.get(
                "/api/internal/recipes/summary",
                params={"source_ids": ",".join(str(i) for i in batch)},
            )
            response.raise_for_status()
            payload = response.json()

            for item in payload.get("recipes", []):
                source_message_id = item.get("source_message_id")
                if source_message_id is not None:
                    known[int(source_message_id)] = item

        return known

    async def old_channel_ingest(
        self,
        source_message_id: int,
        text: str,
        date: Optional[int] = None,
        photo_base64: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Push one old-channel message through the AI reformat + store pipeline.

        Idempotent from the caller's point of view: whether the row already
        exists or not, the route decides (edit vs. create) and this just
        reports the outcome. ``photo_base64`` carries the post's photo —
        Telethon file references are MTProto-only, so the bytes travel in the
        payload and are stored to Vercel Blob on the Next side.
        """
        body: Dict[str, Any] = {"sourceMessageId": source_message_id, "text": text}
        if date is not None:
            body["date"] = date
        if photo_base64:
            body["photoBase64"] = photo_base64

        response = await self.client.post("/api/internal/old-channel/ingest", json=body)
        response.raise_for_status()
        return response.json()

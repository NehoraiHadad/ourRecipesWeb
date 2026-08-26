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

    async def summary_old_channel(self, message_ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
        """
        Fetch which of the given old-channel message ids already have a row.

        Returns ``{source_message_id: {...}}``. An id absent from the result
        has no row yet under ``source_channel == "old"`` and is a candidate
        for ``/old-channel/ingest``.

        Deliberately does **not** filter the request with ``ids=`` — that
        query param matches `Recipe.telegram_id` (the route's one remaining
        consumer before Wave 5 was the main-channel reconcile, keyed by
        `telegram_id`). Every old-channel row now gets its `telegram_id` from
        the internal negative-id generator, unrelated to the channel's real
        message id, so filtering by it would silently match nothing and make
        every message look "missing" on every run. Instead this pulls the
        most recent rows (ordered `telegram_id desc`, i.e. most recently
        created first — the right order for "did reconcile already see
        this?") and matches `source_message_id` against `message_ids`
        locally. ``limit`` is padded well past what was asked for, since the
        recipe most recently *created* is not always the one most recently
        *posted*.
        """
        wanted = {int(i) for i in message_ids}
        if not wanted:
            return {}

        limit = min(max(len(wanted) * 10, 200), 1000)  # summary route caps at 1000
        response = await self.client.get(
            "/api/internal/recipes/summary",
            params={"limit": limit},
        )
        response.raise_for_status()
        payload = response.json()

        known: Dict[int, Dict[str, Any]] = {}
        for item in payload.get("recipes", []):
            if item.get("source_channel") != "old":
                continue
            source_message_id = item.get("source_message_id")
            if source_message_id is None:
                continue
            source_message_id = int(source_message_id)
            if source_message_id in wanted:
                known[source_message_id] = item

        return known

    async def old_channel_ingest(
        self,
        source_message_id: int,
        text: str,
        date: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Push one old-channel message through the AI reformat + store pipeline.

        Idempotent from the caller's point of view: whether the row already
        exists or not, the route decides (edit vs. create) and this just
        reports the outcome.
        """
        body: Dict[str, Any] = {"sourceMessageId": source_message_id, "text": text}
        if date is not None:
            body["date"] = date

        response = await self.client.post("/api/internal/old-channel/ingest", json=body)
        response.raise_for_status()
        return response.json()

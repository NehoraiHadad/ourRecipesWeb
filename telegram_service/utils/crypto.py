"""
Security utilities for authentication and webhook signatures.
"""

import hmac
import hashlib
import json
from fastapi import HTTPException, Request
from config import settings


def generate_webhook_signature(payload: dict) -> str:
    """
    Generate HMAC SHA-256 signature for webhook payload.

    Used when sending webhooks from Python service to Next.js.
    Next.js should verify this signature to ensure authenticity.

    Args:
        payload: Dictionary payload to sign

    Returns:
        Hex-encoded HMAC signature
    """
    # Sort keys for deterministic signature
    payload_str = json.dumps(payload, sort_keys=True)

    signature = hmac.new(
        settings.WEBHOOK_SECRET.encode(),
        payload_str.encode(),
        hashlib.sha256
    ).hexdigest()

    return signature


async def verify_request_signature(request: Request) -> bool:
    """
    Verify incoming request has valid Bearer token.

    Used as FastAPI dependency to protect endpoints.
    Next.js must include: Authorization: Bearer <TELEGRAM_SERVICE_SECRET>

    Args:
        request: FastAPI request object

    Returns:
        True if valid

    Raises:
        HTTPException: 401 if invalid or missing token
    """
    auth_header = request.headers.get("Authorization")

    if not auth_header:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization header"
        )

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid Authorization header format. Expected: Bearer <token>"
        )

    token = auth_header.split(" ", 1)[1]

    if token != settings.TELEGRAM_SERVICE_SECRET:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )

    return True


def verify_webhook_signature(payload: dict, signature: str) -> bool:
    """
    Verify HMAC signature on incoming webhook (if needed in future).

    Args:
        payload: Dictionary payload
        signature: Hex-encoded HMAC signature to verify

    Returns:
        True if signature is valid
    """
    expected_signature = generate_webhook_signature(payload)

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)

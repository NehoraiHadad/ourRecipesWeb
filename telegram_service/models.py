"""
Pydantic models for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional


class MessageData(BaseModel):
    """Request model for sending a message to Telegram"""

    content: str = Field(
        ...,
        description="Message text content",
        min_length=1
    )
    image_data: Optional[str] = Field(
        None,
        description="Base64 encoded image data"
    )
    channel_url: Optional[str] = Field(
        None,
        description="Override default channel URL"
    )


class MessageEdit(BaseModel):
    """Request model for editing a message in Telegram"""

    message_id: int = Field(
        ...,
        description="Telegram message ID to edit",
        gt=0
    )
    content: str = Field(
        ...,
        description="New message text content",
        min_length=1
    )
    image_data: Optional[str] = Field(
        None,
        description="Base64 encoded image data"
    )
    channel_url: Optional[str] = Field(
        None,
        description="Override default channel URL"
    )


class MessageResponse(BaseModel):
    """Response model for message operations"""

    message_id: int = Field(..., description="Telegram message ID")
    date: str = Field(..., description="ISO timestamp")
    success: bool = Field(default=True)


class MessageEditResponse(BaseModel):
    """Response model for edit operations"""

    success: bool = Field(default=True)
    updated_at: str = Field(..., description="ISO timestamp")


class MessageDeleteResponse(BaseModel):
    """Response model for delete operations"""

    success: bool = Field(default=True)
    deleted_at: str = Field(..., description="ISO timestamp")


class SyncRequest(BaseModel):
    """Request model for sync operations"""

    limit: Optional[int] = Field(
        100,
        description="Number of messages to fetch",
        ge=1,
        le=1000
    )
    offset_id: Optional[int] = Field(
        0,
        description="Offset message ID for pagination",
        ge=0
    )
    reverse: Optional[bool] = Field(
        False,
        description="Reverse order (oldest first)"
    )
    channel_url: Optional[str] = Field(
        None,
        description="Override default channel URL"
    )


class TelegramMessage(BaseModel):
    """Model for a single Telegram message"""

    id: int = Field(..., description="Message ID")
    text: str = Field(..., description="Message text")
    date: str = Field(..., description="ISO timestamp")
    media_type: Optional[str] = Field(None, description="Media type if present")
    has_image: bool = Field(default=False, description="Whether message has image")


class SyncResponse(BaseModel):
    """Response model for sync operations"""

    messages: list[TelegramMessage]
    count: int = Field(..., description="Number of messages returned")
    has_more: bool = Field(default=False, description="Whether more messages available")


class HealthCheck(BaseModel):
    """Response model for health check"""

    status: str = Field(..., description="Overall health status")
    timestamp: str = Field(..., description="ISO timestamp")
    environment: str = Field(..., description="Environment name")
    checks: dict = Field(..., description="Individual check results")

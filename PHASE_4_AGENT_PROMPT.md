# 🤖 Phase 4: Telegram Service - Agent Instructions

## 🎯 Mission

מימוש **Phase 4 - Telegram Microservice**: יצירת Python FastAPI service נפרד שמטפל בכל פעולות הTelegram.

---

## 📚 Required Reading - קרא לפני התחלה

### 1. Architecture & Context (בסדר הזה!)

```bash
# קרא את הקבצים האלה לפני שמתחילים:
1. docs/refactor/phases/phase-4-telegram-service/README.md   # התוכנית הכוללת
2. docs/refactor/CURRENT_STATE.md                            # 15 Blocked endpoints
3. backend/ourRecipesBack/services/telegram_service.py       # Flask reference
4. backend/ourRecipesBack/routes/sync.py                     # Sync reference
```

### 2. Phase 4 Tasks (תעדוף עבודה)

```bash
docs/refactor/phases/phase-4-telegram-service/tasks/
├── task-4.1-fastapi-setup.md          # עדיפות גבוהה ✅
├── task-4.2-telethon-integration.md   # עדיפות גבוהה ✅
├── (Task 4.3-4.8 - see README.md)     # להלן
```

---

## 🏗️ What You Need to Build

### Project Structure

```
telegram_service/
├── main.py                      # FastAPI app + all endpoints
├── config.py                    # Settings (pydantic-settings)
├── models.py                    # Pydantic request/response models
├── telegram_client.py           # Telethon client singleton
├── background.py                # Background channel monitoring
├── utils/
│   ├── crypto.py                # HMAC signatures
│   └── formatters.py            # Recipe/Menu formatters
├── tests/
│   ├── test_api.py              # Integration tests
│   ├── test_telegram_client.py  # Unit tests
│   └── conftest.py              # Pytest fixtures
├── requirements.txt
├── Dockerfile
├── .env.example
└── README.md
```

---

## 📋 Implementation Strategy

### Wave 1: Foundation (Tasks 4.1-4.2) - 5-7 hours ✅

**Status**: Complete (if you're reading this, these should be done)

- [x] FastAPI project structure
- [x] Telethon client integration
- [x] Basic health checks

---

### Wave 2: Core Endpoints (Task 4.3) - 4-5 hours

**Goal**: Implement send/edit/delete message operations

#### POST `/telegram/send-message`

**Reference**: `backend/ourRecipesBack/services/telegram_service.py:175-197`

```python
# main.py
from fastapi import FastAPI, HTTPException, Depends
from models import MessageData
from telegram_client import get_telegram_client
from utils.crypto import verify_request_signature

@app.post("/telegram/send-message")
async def send_message(
    data: MessageData,
    verified: bool = Depends(verify_request_signature)
):
    """Send message to Telegram channel"""
    try:
        async with get_telegram_client() as client:
            channel = await client.get_entity(data.channel_url or settings.CHANNEL_URL)

            file = None
            if data.image_data:
                import base64
                from io import BytesIO
                file = BytesIO(base64.b64decode(data.image_data))
                file.name = "image.jpg"

            message = await client.send_message(
                channel,
                data.content,
                file=file
            )

            logger.info("message_sent", message_id=message.id)
            return {
                "message_id": message.id,
                "date": message.date.isoformat(),
                "success": True
            }
    except Exception as e:
        logger.error("send_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
```

#### PUT `/telegram/edit-message`

**Reference**: `backend/ourRecipesBack/services/telegram_service.py:145-172`

```python
@app.put("/telegram/edit-message")
async def edit_message(
    data: MessageEdit,
    verified: bool = Depends(verify_request_signature)
):
    """Edit message in Telegram channel"""
    try:
        async with get_telegram_client() as client:
            channel = await client.get_entity(data.channel_url or settings.CHANNEL_URL)

            file = None
            if data.image_data:
                import base64
                from io import BytesIO
                file = BytesIO(base64.b64decode(data.image_data))
                file.name = "image.jpg"

            await client.edit_message(
                channel,
                data.message_id,
                data.content,
                file=file
            )

            logger.info("message_edited", message_id=data.message_id)
            return {
                "success": True,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
    except Exception as e:
        logger.error("edit_failed", error=str(e), message_id=data.message_id)
        raise HTTPException(status_code=500, detail=str(e))
```

#### DELETE `/telegram/delete-message/{message_id}`

**Reference**: `backend/ourRecipesBack/services/telegram_service.py:200-211`

```python
@app.delete("/telegram/delete-message/{message_id}")
async def delete_message(
    message_id: int,
    channel_url: str = Query(None),
    verified: bool = Depends(verify_request_signature)
):
    """Delete message from Telegram channel"""
    try:
        async with get_telegram_client() as client:
            channel = await client.get_entity(channel_url or settings.CHANNEL_URL)
            await client.delete_messages(channel, [message_id])

            logger.info("message_deleted", message_id=message_id)
            return {
                "success": True,
                "deleted_at": datetime.now(timezone.utc).isoformat()
            }
    except Exception as e:
        logger.error("delete_failed", error=str(e), message_id=message_id)
        raise HTTPException(status_code=500, detail=str(e))
```

#### Pydantic Models (`models.py`)

```python
from pydantic import BaseModel, Field
from typing import Optional

class MessageData(BaseModel):
    """Request model for sending message"""
    content: str = Field(..., description="Message text content")
    image_data: Optional[str] = Field(None, description="Base64 encoded image")
    channel_url: Optional[str] = Field(None, description="Override channel URL")

class MessageEdit(BaseModel):
    """Request model for editing message"""
    message_id: int = Field(..., description="Telegram message ID")
    content: str = Field(..., description="New message text")
    image_data: Optional[str] = Field(None, description="Base64 encoded image")
    channel_url: Optional[str] = Field(None, description="Override channel URL")
```

**Success Criteria**:
- [ ] POST /telegram/send-message works
- [ ] PUT /telegram/edit-message works
- [ ] DELETE /telegram/delete-message works
- [ ] Images handled correctly (base64 ↔ BytesIO)
- [ ] All endpoints require authentication
- [ ] Proper error responses (400/401/500)

---

### Wave 3: Sync Operations (Task 4.4) - 3-4 hours

**Goal**: Implement message fetching for initial DB population

**Reference**: `backend/ourRecipesBack/routes/sync.py`

#### POST `/telegram/sync-messages`

```python
from models import SyncRequest

@app.post("/telegram/sync-messages")
async def sync_messages(
    data: SyncRequest,
    verified: bool = Depends(verify_request_signature)
):
    """
    Fetch messages from Telegram channel.
    Used for initial DB population and incremental sync.
    """
    try:
        async with get_telegram_client() as client:
            channel = await client.get_entity(data.channel_url or settings.CHANNEL_URL)

            messages = []
            async for message in client.iter_messages(
                channel,
                limit=data.limit or 100,
                offset_id=data.offset_id or 0,
                reverse=data.reverse or False
            ):
                if message.text:  # Skip empty messages
                    messages.append({
                        "id": message.id,
                        "text": message.text,
                        "date": message.date.isoformat(),
                        "media_type": message.media.__class__.__name__ if message.media else None,
                        "has_image": bool(message.photo or message.document)
                    })

            logger.info("messages_synced", count=len(messages), channel=data.channel_url or settings.CHANNEL_URL)
            return {
                "messages": messages,
                "count": len(messages),
                "has_more": len(messages) == data.limit
            }

    except Exception as e:
        logger.error("sync_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
```

**Pydantic Model**:
```python
class SyncRequest(BaseModel):
    """Request model for sync operation"""
    limit: Optional[int] = Field(100, description="Number of messages to fetch")
    offset_id: Optional[int] = Field(0, description="Offset message ID for pagination")
    reverse: Optional[bool] = Field(False, description="Reverse order (oldest first)")
    channel_url: Optional[str] = Field(None, description="Override channel URL")
```

**Success Criteria**:
- [ ] Can fetch 100+ messages
- [ ] Pagination works with offset_id
- [ ] Returns message metadata correctly
- [ ] /telegram/session/status works (already implemented in Task 4.2)

---

### Wave 4: Background Monitoring (Task 4.5) - 3-4 hours

**Goal**: Monitor old Telegram channel, copy to new, notify Next.js

**Reference**: User mentioned "מנגנון סנכרון מערוץ הטלגרם"

#### Create `background.py`

```python
from telethon import events
from telegram_client import TelegramClientManager
import httpx
import structlog
from utils.crypto import generate_webhook_signature
from config import settings
import json

logger = structlog.get_logger()

async def start_monitoring():
    """
    Start background monitoring of old Telegram channel.
    Copies new messages to new channel and notifies Next.js.
    """
    if not settings.OLD_CHANNEL_URL:
        logger.info("background_monitoring_disabled", reason="OLD_CHANNEL_URL not set")
        return

    client = await TelegramClientManager.get_client()

    @client.on(events.NewMessage(chats=settings.OLD_CHANNEL_URL))
    async def handle_new_message(event):
        """Copy message from old → new channel, notify Next.js"""
        try:
            # 1. Copy to new channel
            new_message = await client.send_message(
                settings.NEW_CHANNEL_URL or settings.CHANNEL_URL,
                event.text,
                file=event.media
            )

            logger.info(
                "message_copied",
                old_id=event.id,
                new_id=new_message.id,
                old_channel=settings.OLD_CHANNEL_URL
            )

            # 2. Prepare webhook payload
            payload = {
                "message_id": new_message.id,
                "content": event.text,
                "media_type": event.media.__class__.__name__ if event.media else None,
                "old_message_id": event.id,
                "timestamp": event.date.isoformat()
            }

            # 3. Send to Next.js webhook
            async with httpx.AsyncClient() as http_client:
                signature = generate_webhook_signature(payload)

                response = await http_client.post(
                    f"{settings.NEXTJS_URL}/api/webhooks/telegram-message",
                    json=payload,
                    headers={
                        "X-Webhook-Signature": signature,
                        "Content-Type": "application/json"
                    },
                    timeout=10.0
                )

                if response.status_code != 200:
                    logger.error(
                        "webhook_failed",
                        status=response.status_code,
                        body=response.text
                    )
                else:
                    logger.info("webhook_sent", message_id=new_message.id)

        except Exception as e:
            logger.error("message_copy_failed", error=str(e), old_message_id=event.id)

    logger.info("monitoring_started", channel=settings.OLD_CHANNEL_URL)
    await client.run_until_disconnected()
```

#### Update `main.py` Lifespan

```python
from background import start_monitoring
import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - start/stop background tasks"""
    logger.info("service_starting", environment=settings.ENVIRONMENT)

    # Startup: Connect to Telegram
    client = await TelegramClientManager.get_client()
    logger.info("telegram_startup_complete")

    # Start background monitoring (if configured)
    monitoring_task = None
    if settings.OLD_CHANNEL_URL:
        monitoring_task = asyncio.create_task(start_monitoring())
        logger.info("background_monitoring_started")

    yield

    # Shutdown
    if monitoring_task:
        monitoring_task.cancel()
        logger.info("background_monitoring_stopped")

    await TelegramClientManager.close()
    logger.info("service_shutting_down")
```

**Success Criteria**:
- [ ] Monitors old channel continuously
- [ ] Copies new messages to new channel
- [ ] Sends webhooks to Next.js with HMAC signature
- [ ] Handles reconnection on errors

---

### Wave 5: Security (Task 4.6) - 2-3 hours

**Goal**: HMAC signatures for webhooks + Bearer auth for endpoints

#### Create `utils/crypto.py`

```python
import hmac
import hashlib
import json
from fastapi import HTTPException, Request
from config import settings

def generate_webhook_signature(payload: dict) -> str:
    """Generate HMAC SHA-256 signature for webhook payload"""
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
    Used as FastAPI dependency.
    """
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header"
        )

    token = auth_header.split(" ")[1]

    if token != settings.TELEGRAM_SERVICE_SECRET:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )

    return True
```

**Next.js Webhook Verification** (for reference):

```typescript
// lib/utils/webhook-security.ts
import crypto from 'crypto';

export function verifyWebhookSignature(
  payload: unknown,
  signature: string
): boolean {
  const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
  const expectedSignature = crypto
    .createHmac('sha256', process.env.TELEGRAM_WEBHOOK_SECRET!)
    .update(payloadStr)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Success Criteria**:
- [ ] All endpoints require Bearer token
- [ ] Invalid tokens rejected with 401
- [ ] Webhook signatures generated correctly
- [ ] Next.js can verify signatures

---

### Wave 6: Production Ready (Tasks 4.7-4.8) - 4-6 hours

#### Enhanced Health Check (`main.py`)

```python
@app.get("/health")
async def health_check():
    """Comprehensive health check"""
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.ENVIRONMENT,
        "checks": {}
    }

    # Check Telegram connection
    telegram_health = await TelegramClientManager.check_health()
    health["checks"]["telegram"] = telegram_health

    if telegram_health["status"] != "healthy":
        health["status"] = "degraded"

    # Check environment variables
    required_vars = ["SESSION_STRING", "API_ID", "API_HASH", "WEBHOOK_SECRET"]
    missing = [var for var in required_vars if not getattr(settings, var, None)]

    if missing:
        health["status"] = "unhealthy"
        health["checks"]["config"] = {
            "status": "error",
            "missing_vars": missing
        }
    else:
        health["checks"]["config"] = {"status": "ok"}

    status_code = 200 if health["status"] in ["healthy", "degraded"] else 503
    return JSONResponse(content=health, status_code=status_code)
```

#### Railway Deployment

**Dockerfile** (already created in Task 4.1):
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

**Deploy to Railway**:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create project
railway init

# Deploy
railway up

# Set environment variables in Railway dashboard:
# - SESSION_STRING
# - API_ID, API_HASH
# - CHANNEL_URL
# - TELEGRAM_SERVICE_SECRET
# - WEBHOOK_SECRET
# - NEXTJS_URL

# Get service URL
railway domain
```

**Success Criteria**:
- [ ] Service deployed to Railway
- [ ] /health returns 200
- [ ] Environment variables configured
- [ ] Can send test message from Next.js
- [ ] Logs visible in Railway dashboard

---

## 🔗 Next.js Integration (Post Phase 4)

After Python service is deployed, update Next.js:

### Environment Variables

```env
# .env.local (Next.js)
TELEGRAM_SERVICE_URL=https://your-service.railway.app
TELEGRAM_SERVICE_SECRET=<same-as-railway>
TELEGRAM_WEBHOOK_SECRET=<same-as-railway>
```

### Telegram Client Library

```typescript
// lib/services/telegramClient.ts
const TELEGRAM_SERVICE_URL = process.env.TELEGRAM_SERVICE_URL!;
const SECRET = process.env.TELEGRAM_SERVICE_SECRET!;

export async function sendToTelegram(
  content: string,
  imageData?: Buffer
): Promise<number> {
  const response = await fetch(`${TELEGRAM_SERVICE_URL}/telegram/send-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SECRET}`
    },
    body: JSON.stringify({
      content,
      image_data: imageData?.toString('base64')
    })
  });

  if (!response.ok) {
    throw new Error('Failed to send to Telegram');
  }

  const data = await response.json();
  return data.message_id;
}
```

### Update Blocked Endpoints

Replace placeholders in these Next.js routes:

1. `app/api/recipes/route.ts` - POST (create)
2. `app/api/recipes/[id]/route.ts` - PUT (update), DELETE
3. `app/api/menus/save/route.ts` - POST
4. `app/api/menus/[id]/route.ts` - PUT, DELETE
5. `app/api/places/route.ts` - POST
6. `app/api/places/[id]/route.ts` - PUT, DELETE
7. `app/api/sync/route.ts` - POST
8. `app/api/sync/full/route.ts` - POST

**Example Update**:
```typescript
// Before (blocked):
export async function POST(req: Request) {
  const recipe = await prisma.recipe.create({ data });
  // TODO: Send to Telegram
  return successResponse(recipe);
}

// After (working):
export async function POST(req: Request) {
  const recipe = await prisma.recipe.create({ data });

  // Send to Telegram
  try {
    const messageId = await sendToTelegram(
      formatRecipeForTelegram(recipe),
      recipe.image_data
    );

    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { telegram_id: messageId }
    });
  } catch (error) {
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { sync_status: 'error', sync_error: error.message }
    });
  }

  return successResponse(recipe);
}
```

---

## ✅ Success Criteria - Phase 4 Complete

- [ ] **Python Service**: Deployed to Railway
- [ ] **Endpoints**: All 4 core ops work (send/edit/delete/sync)
- [ ] **Security**: HMAC + Bearer auth implemented
- [ ] **Background**: Old channel monitoring (if configured)
- [ ] **Health**: /health shows Telegram status
- [ ] **Logging**: JSON logs in Railway
- [ ] **Tests**: >70% coverage
- [ ] **Next.js**: 15 blocked endpoints now functional
- [ ] **End-to-End**: Can create recipe from web → appears in Telegram

---

## ⚠️ Critical Rules

1. **אל תשנה Flask** - עדיין רץ בparallel
2. **StringSession Only** - לא file sessions
3. **Singleton Client** - רק connection אחד
4. **Error Logging** - כל error ב-structlog JSON
5. **Tests First** - כל endpoint צריך test

---

## 📝 סדר עבודה מומלץ

```bash
# Day 1-2: Foundation
✅ Task 4.1: FastAPI Setup (2-3h)
✅ Task 4.2: Telethon Integration (3-4h)

# Day 3: Core Endpoints
⬜ Task 4.3: Send/Edit/Delete (4-5h)

# Day 4: Sync & Monitoring
⬜ Task 4.4: Sync Operations (3-4h)
⬜ Task 4.5: Background Monitoring (3-4h)

# Day 5: Security & Polish
⬜ Task 4.6: HMAC Security (2-3h)
⬜ Task 4.7: Health & Logging (2-3h)

# Day 6: Deployment & Integration
⬜ Task 4.8: Railway Deployment (2-3h)
⬜ Next.js Integration (3-4h)
```

---

## 🆘 When Stuck

### Telethon Issues:
```bash
# Regenerate session string
python -c "
from telethon import TelegramClient
from telethon.sessions import StringSession
API_ID = int(input('API_ID: '))
API_HASH = input('API_HASH: ')
with TelegramClient(StringSession(), API_ID, API_HASH) as client:
    print(client.session.save())
"
```

### Railway Logs:
```bash
railway logs --tail 100
```

### Test Telegram Connection:
```bash
curl -H "Authorization: Bearer $SECRET" \
  http://localhost:8000/telegram/session/status
```

---

**Ready? Start with Task 4.3!** 🚀

**Created**: 2025-11-23
**For**: Phase 4 Implementation
**Prerequisites**: Tasks 4.1-4.2 Complete ✅

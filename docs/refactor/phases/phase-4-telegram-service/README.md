# 📱 Phase 4: Telegram Microservice

**Timeline**: שבוע 5-6 (18-24 שעות)
**Status**: 📝 Planned
**Dependencies**: Phase 2 Complete (~70% done)
**Priority**: 🔴 Critical - Unblocks 15 endpoints

---

## 🎯 Overview

Phase 4 יוצר Python microservice נפרד (FastAPI + Telethon) שמטפל **רק** ב-Telegram operations.
זה משחרר את Next.js להתמקד בlogic עסקי, בזמן שPython מנהל את הcomplexity של Telethon.

### למה Microservice ולא TypeScript?

1. **Telethon = Python Only** - אין JavaScript client איכותי
2. **Async Complexity** - Telethon דורש async/await מורכב שלא מתאים ל-Next.js
3. **Session Management** - Telegram session strings דורשים Python runtime
4. **Background Tasks** - Monitoring של channel ישן דורש long-running process
5. **Separation of Concerns** - Telegram logic נפרד מבusiness logic

---

## 🏗️ Architecture

### Current State (Phase 2 - ~70% complete)

```
┌─────────────────────────────────────┐
│         Next.js App (Vercel)        │
│  ┌──────────────────────────────┐   │
│  │   API Routes (19/59 done)    │   │
│  │  ✅ Recipes Read (4/4)       │   │
│  │  ✅ Recipe AI (5/6)          │   │
│  │  ✅ Menus Read (3/3)         │   │
│  │  ✅ Menu AI (1/1)            │   │
│  │  ✅ Categories (1/1)         │   │
│  │  ✅ Shopping Lists (3+)      │   │
│  │                               │   │
│  │  ❌ 15 Blocked (Telegram)    │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │   Prisma ORM → PostgreSQL    │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Target Architecture (After Phase 4)

```
┌──────────────────────────────────┐      ┌─────────────────────────────┐
│      Next.js App (Vercel)        │      │  Python Service (Railway)   │
│                                   │      │                             │
│  ┌────────────────────────────┐  │      │  ┌───────────────────────┐ │
│  │   API Routes (59/59) ✅    │  │      │  │  FastAPI Endpoints    │ │
│  │                            │  │      │  │                       │ │
│  │  Recipes, Menus, etc.      │  │◄────►│  │  /telegram/send      │ │
│  │                            │  │ HTTP │  │  /telegram/edit      │ │
│  └────────────────────────────┘  │      │  │  /telegram/delete    │ │
│                                   │      │  │  /telegram/sync      │ │
│  ┌────────────────────────────┐  │      │  └───────────────────────┘ │
│  │  Webhook Handler           │  │      │                             │
│  │  /api/webhooks/telegram    │  │◄─────┤  Async Webhooks            │
│  └────────────────────────────┘  │      │                             │
│                                   │      │  ┌───────────────────────┐ │
│  ┌────────────────────────────┐  │      │  │  Telethon Client      │ │
│  │  PostgreSQL (Prisma)       │  │      │  │                       │ │
│  └────────────────────────────┘  │      │  │  - Session mgmt       │ │
└──────────────────────────────────┘      │  │  - Channel ops        │ │
                                           │  │  - Background monitor │ │
                                           │  └───────────────────────┘ │
                                           └─────────────────────────────┘
```

---

## 🚫 15 Blocked Endpoints (Waiting for Phase 4)

Phase 2 cannot complete these endpoints without Telegram integration:

### Group 1: Recipes CRUD (3 endpoints)
| Endpoint | Method | Description | Current Status |
|----------|--------|-------------|----------------|
| `/api/recipes` | POST | Create recipe → Send to Telegram | ❌ Blocked |
| `/api/recipes/[id]` | PUT | Update recipe → Edit in Telegram | ❌ Blocked |
| `/api/recipes/[id]` | DELETE | Delete recipe → Remove from Telegram | ❌ Blocked |

**Impact**: Users cannot create/edit/delete recipes from web app.

---

### Group 2: Menus CRUD (4 endpoints)
| Endpoint | Method | Description | Current Status |
|----------|--------|-------------|----------------|
| `/api/menus/save` | POST | Save menu → Send to Telegram | ❌ Blocked |
| `/api/menus/[id]` | PUT | Update menu → Edit in Telegram | ❌ Blocked |
| `/api/menus/[id]` | DELETE | Delete menu → Remove from Telegram | ❌ Blocked |
| `/api/menus/[id]/meals/*` | POST/PUT | Update meal → Edit menu in Telegram | ❌ Blocked |

**Impact**: Users can generate menus (AI works!) but cannot save them.

---

### Group 3: Places CRUD (3 endpoints)
| Endpoint | Method | Description | Current Status |
|----------|--------|-------------|----------------|
| `/api/places` | POST | Create place → Backup to Telegram | ❌ Blocked |
| `/api/places/[id]` | PUT | Update place → Update in Telegram | ❌ Blocked |
| `/api/places/[id]` | DELETE | Delete place (soft) → Update Telegram | ❌ Blocked |

**Impact**: Places feature completely unavailable.

---

### Group 4: Sync Operations (4 endpoints)
| Endpoint | Method | Description | Current Status |
|----------|--------|-------------|----------------|
| `/api/sync` | POST | Incremental sync from Telegram | ❌ Blocked |
| `/api/sync/full` | POST | Full sync (initial population) | ❌ Blocked |
| `/api/sync/session/status` | GET | Check Telegram session health | ❌ Blocked |
| `/api/sync/session/refresh` | POST | Refresh Telegram session | ❌ Blocked |

**Impact**: Cannot populate DB from Telegram channel (critical for initial data!).

---

### Group 5: Version Restore (1 endpoint)
| Endpoint | Method | Description | Current Status |
|----------|--------|-------------|----------------|
| `/api/versions/recipe/[id]/restore/[versionId]` | POST | Restore old version → Update Telegram | ❌ Blocked |

**Impact**: Version history works (read-only), but cannot restore.

---

**Total Blocked**: 15/59 endpoints (25%)
**Critical for Launch**: Group 1 (Recipes) + Group 2 (Menus) + Group 4 (Sync)

---

## 🔄 Communication Flows

### Flow 1: Synchronous Operations (Next.js → Python → Next.js)

**Use Case**: User creates/edits/deletes content

```typescript
// Next.js API Route: app/api/recipes/route.ts
export async function POST(req: Request) {
  const body = await req.json();

  // 1. Save to PostgreSQL first
  const recipe = await prisma.recipe.create({
    data: {
      title: body.title,
      raw_content: body.raw_content,
      // ... other fields
    }
  });

  // 2. Send to Telegram (synchronous call to Python service)
  try {
    const telegramResponse = await fetch(
      `${process.env.TELEGRAM_SERVICE_URL}/telegram/send-message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TELEGRAM_SERVICE_SECRET}`
        },
        body: JSON.stringify({
          content: formatRecipeForTelegram(recipe),
          image_data: body.image_data // base64
        })
      }
    );

    const { message_id } = await telegramResponse.json();

    // 3. Update DB with Telegram message ID
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { telegram_id: message_id }
    });

    return successResponse(recipe, 'Recipe created', 201);
  } catch (error) {
    // Rollback or mark as sync error
    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { sync_status: 'error', sync_error: error.message }
    });
    throw new Error('Failed to sync to Telegram');
  }
}
```

**Python Service Response**:
```python
# FastAPI: telegram_service/main.py
@app.post("/telegram/send-message")
async def send_message(data: MessageData):
    """Send message to Telegram channel"""
    async with get_telegram_client() as client:
        channel = await client.get_entity(CHANNEL_URL)

        file = None
        if data.image_data:
            file = BytesIO(base64.b64decode(data.image_data))
            file.name = "image.jpg"

        message = await client.send_message(
            channel,
            data.content,
            file=file
        )

        return {"message_id": message.id, "date": message.date.isoformat()}
```

---

### Flow 2: Asynchronous Operations (Python → Next.js Webhook)

**Use Case**: Background monitoring of old Telegram channel

```python
# Python Service: telegram_service/background.py
from telethon import events

@telegram_client.on(events.NewMessage(chats=OLD_CHANNEL_URL))
async def on_new_message(event):
    """Monitor old channel, copy to new channel, notify Next.js"""

    # 1. Copy message to new channel
    new_message = await telegram_client.send_message(
        NEW_CHANNEL_URL,
        event.text,
        file=event.media
    )

    # 2. Notify Next.js via webhook
    async with httpx.AsyncClient() as http_client:
        # Calculate HMAC signature
        payload = {
            "message_id": new_message.id,
            "content": event.text,
            "media_type": event.media.__class__.__name__ if event.media else None,
            "old_message_id": event.id,
            "timestamp": event.date.isoformat()
        }

        signature = hmac.new(
            WEBHOOK_SECRET.encode(),
            json.dumps(payload).encode(),
            hashlib.sha256
        ).hexdigest()

        await http_client.post(
            f"{NEXTJS_URL}/api/webhooks/telegram-message",
            json=payload,
            headers={
                "X-Webhook-Signature": signature,
                "Content-Type": "application/json"
            },
            timeout=10.0
        )
```

**Next.js Webhook Handler**:
```typescript
// app/api/webhooks/telegram-message/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // 1. Verify HMAC signature
  const signature = request.headers.get('x-webhook-signature');
  const body = await request.text();

  const expectedSignature = crypto
    .createHmac('sha256', process.env.TELEGRAM_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Parse and save to DB
  const payload = JSON.parse(body);

  await prisma.recipe.create({
    data: {
      telegram_id: payload.message_id,
      raw_content: payload.content,
      // ... parse content and extract fields
    }
  });

  return new Response('OK', { status: 200 });
}
```

---

## 📋 Tasks Breakdown

### Task 4.1: FastAPI Project Setup (2-3 hours)
**Goal**: Bootstrap Python service with FastAPI + basic structure

**Files to Create**:
```
telegram_service/
├── main.py              # FastAPI app + routes
├── config.py            # Environment configuration
├── models.py            # Pydantic request/response models
├── telegram_client.py   # Telethon client singleton
├── background.py        # Background monitoring tasks
├── utils/
│   ├── crypto.py        # HMAC signature utils
│   └── formatters.py    # Recipe/Menu text formatting
├── requirements.txt     # Python dependencies
├── Dockerfile          # Container for deployment
├── .env.example        # Environment variables template
└── README.md           # Service documentation
```

**Dependencies**:
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
telethon==1.33.0
pydantic==2.5.0
httpx==0.25.1
python-dotenv==1.0.0
structlog==23.2.0
```

**Success Criteria**:
- FastAPI runs on `http://localhost:8000`
- `/health` endpoint returns 200
- `/docs` (Swagger) accessible
- Environment variables loading correctly

**AI Agent Instructions**: קרא `backend/ourRecipesBack/` כדי להבין Flask structure. השתמש בדפוסים דומים אבל עם FastAPI.

---

### Task 4.2: Telethon Integration (3-4 hours)
**Goal**: Setup Telegram client with session string management

**Reference**: `backend/ourRecipesBack/services/telegram_service.py:1-232`

**Implementation**:
```python
# telegram_client.py
from telethon import TelegramClient
from telethon.sessions import StringSession
from config import settings
import asyncio
from contextlib import asynccontextmanager

class TelegramClientManager:
    """Singleton Telegram client manager"""

    _client: TelegramClient | None = None
    _lock = asyncio.Lock()

    @classmethod
    async def get_client(cls) -> TelegramClient:
        """Get or create Telegram client"""
        async with cls._lock:
            if cls._client is None:
                cls._client = TelegramClient(
                    session=StringSession(settings.SESSION_STRING),
                    api_id=settings.API_ID,
                    api_hash=settings.API_HASH
                )
                await cls._client.start()
            return cls._client

    @classmethod
    async def close(cls):
        """Close client on shutdown"""
        if cls._client:
            await cls._client.disconnect()
            cls._client = None

@asynccontextmanager
async def get_telegram_client():
    """Context manager for Telegram operations"""
    client = await TelegramClientManager.get_client()
    try:
        yield client
    finally:
        # Don't close - keep connection alive
        pass
```

**Key Operations** (from Flask reference):
- `send_message(text, image_data)` - Line 175-197
- `edit_message(message_id, new_text, image_data)` - Line 145-172
- `delete_message(message_id)` - Line 200-211
- `check_permissions(user_id, channel_url)` - Line 114-142

**Success Criteria**:
- Client connects successfully
- Can send test message to channel
- Session string persists across restarts
- Error handling for network issues

---

### Task 4.3: Send/Edit/Delete Endpoints (4-5 hours)
**Goal**: Implement core Telegram operations as FastAPI endpoints

**API Specification**:

#### POST `/telegram/send-message`
```typescript
// Request
{
  "content": string,           // Formatted recipe/menu text
  "image_data"?: string,       // Base64 encoded image
  "channel_url"?: string       // Optional, defaults to env var
}

// Response
{
  "message_id": number,        // Telegram message ID
  "date": string,              // ISO timestamp
  "success": true
}
```

#### PUT `/telegram/edit-message`
```typescript
// Request
{
  "message_id": number,
  "content": string,
  "image_data"?: string,
  "channel_url"?: string
}

// Response
{
  "success": true,
  "updated_at": string
}
```

#### DELETE `/telegram/delete-message/{message_id}`
```typescript
// Query Params
?channel_url=...  // Optional

// Response
{
  "success": true,
  "deleted_at": string
}
```

**Implementation**:
```python
# main.py
from fastapi import FastAPI, HTTPException, Depends
from models import MessageData, MessageEdit
from telegram_client import get_telegram_client
from utils.crypto import verify_request_signature
import structlog

logger = structlog.get_logger()
app = FastAPI(title="Telegram Service", version="1.0.0")

@app.post("/telegram/send-message")
async def send_message(
    data: MessageData,
    verified: bool = Depends(verify_request_signature)
):
    """Send message to Telegram channel"""
    try:
        async with get_telegram_client() as client:
            channel = await client.get_entity(data.channel_url or CHANNEL_URL)

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

**Success Criteria**:
- All 3 operations work end-to-end
- Images handled correctly (base64 ↔ BytesIO)
- Proper error responses (400/401/500)
- Request logging with structlog

**AI Agent Instructions**: Copy patterns from `telegram_service.py` lines 145-211. Add FastAPI decorators and Pydantic validation.

---

### Task 4.4: Sync Operations (3-4 hours)
**Goal**: Implement sync endpoints for initial DB population

**Reference**: `backend/ourRecipesBack/routes/sync.py`

#### POST `/telegram/sync-messages`
```python
@app.post("/telegram/sync-messages")
async def sync_messages(data: SyncRequest):
    """
    Fetch messages from Telegram channel

    Used for:
    - Initial DB population (full sync)
    - Incremental sync (with offset_id)
    """
    try:
        async with get_telegram_client() as client:
            channel = await client.get_entity(data.channel_url or CHANNEL_URL)

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

            logger.info("messages_synced", count=len(messages))
            return {"messages": messages, "count": len(messages)}

    except Exception as e:
        logger.error("sync_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
```

#### GET `/telegram/session/status`
```python
@app.get("/telegram/session/status")
async def session_status():
    """Check Telegram session health"""
    try:
        async with get_telegram_client() as client:
            me = await client.get_me()
            return {
                "status": "healthy",
                "user_id": me.id,
                "username": me.username,
                "phone": me.phone,
                "connected": client.is_connected()
            }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
```

**Success Criteria**:
- Can fetch 100+ messages from channel
- Handles pagination with `offset_id`
- Session status check works
- Errors handled gracefully

---

### Task 4.5: Background Monitoring (3-4 hours)
**Goal**: Monitor old Telegram channel, copy to new channel + notify Next.js

**Reference**: User mentioned "מנגנון סנכרון מערוץ הטלגרם" (sync mechanism from Telegram channel)

**Implementation**:
```python
# background.py
from telethon import events
from telegram_client import TelegramClientManager
import httpx
import structlog
from utils.crypto import generate_webhook_signature
from config import settings

logger = structlog.get_logger()

async def start_monitoring():
    """Start background monitoring of old channel"""
    client = await TelegramClientManager.get_client()

    @client.on(events.NewMessage(chats=settings.OLD_CHANNEL_URL))
    async def handle_new_message(event):
        """Copy message from old → new channel, notify Next.js"""
        try:
            # 1. Copy to new channel
            new_message = await client.send_message(
                settings.NEW_CHANNEL_URL,
                event.text,
                file=event.media
            )

            logger.info(
                "message_copied",
                old_id=event.id,
                new_id=new_message.id
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

        except Exception as e:
            logger.error("message_copy_failed", error=str(e))

    logger.info("monitoring_started", channel=settings.OLD_CHANNEL_URL)
    await client.run_until_disconnected()
```

**Startup Integration**:
```python
# main.py
from contextlib import asynccontextmanager
import asyncio

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - start/stop background tasks"""
    # Startup
    monitoring_task = asyncio.create_task(start_monitoring())
    yield
    # Shutdown
    monitoring_task.cancel()
    await TelegramClientManager.close()

app = FastAPI(lifespan=lifespan)
```

**Success Criteria**:
- Monitors old channel continuously
- Copies new messages to new channel
- Sends webhooks to Next.js
- Handles reconnection on errors

---

### Task 4.6: Webhook Security (HMAC) (2-3 hours)
**Goal**: Secure communication between Python ↔ Next.js

**Implementation**:

```python
# utils/crypto.py
import hmac
import hashlib
import json
from config import settings

def generate_webhook_signature(payload: dict) -> str:
    """Generate HMAC signature for webhook"""
    payload_str = json.dumps(payload, sort_keys=True)
    signature = hmac.new(
        settings.WEBHOOK_SECRET.encode(),
        payload_str.encode(),
        hashlib.sha256
    ).hexdigest()
    return signature

def verify_request_signature(request: Request) -> bool:
    """Verify incoming request signature"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")

    token = auth_header.split(" ")[1]
    if token != settings.TELEGRAM_SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Invalid token")

    return True
```

**Next.js Verification**:
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
- All Python→Next.js webhooks have HMAC signature
- All Next.js→Python requests have Bearer token
- Invalid signatures rejected (401)
- Timing-safe comparison used

---

### Task 4.7: Health Checks & Logging (2-3 hours)
**Goal**: Production-ready monitoring and debugging

**Health Endpoint**:
```python
# main.py
@app.get("/health")
async def health_check():
    """Comprehensive health check"""
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {}
    }

    # Check Telegram connection
    try:
        async with get_telegram_client() as client:
            me = await client.get_me()
            health["checks"]["telegram"] = {
                "status": "ok",
                "connected": client.is_connected(),
                "user_id": me.id
            }
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["telegram"] = {
            "status": "error",
            "error": str(e)
        }

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

    status_code = 200 if health["status"] == "healthy" else 503
    return JSONResponse(content=health, status_code=status_code)
```

**Structured Logging**:
```python
# config.py
import structlog

def configure_logging():
    """Setup structlog for production"""
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

configure_logging()
logger = structlog.get_logger()

# Usage
logger.info("message_sent", message_id=123, user_id=456)
logger.error("send_failed", error=str(e), message_id=123)
```

**Success Criteria**:
- `/health` returns detailed status
- Logs in JSON format (Railway/Render friendly)
- All operations logged (send, edit, delete, sync)
- Errors include context (message_id, user_id, etc.)

---

### Task 4.8: Railway Deployment (2-3 hours)
**Goal**: Deploy Python service to Railway

**Setup**:
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create new project
railway init

# Link to repository
railway link
```

**Environment Variables** (Railway Dashboard):
```bash
# Telegram
SESSION_STRING=<your-session-string>
API_ID=<telegram-api-id>
API_HASH=<telegram-api-hash>
CHANNEL_URL=<your-channel-url>
OLD_CHANNEL_URL=<old-channel-url-if-monitoring>

# Security
TELEGRAM_SERVICE_SECRET=<random-secret-for-nextjs>
WEBHOOK_SECRET=<random-secret-for-hmac>

# Next.js
NEXTJS_URL=https://your-app.vercel.app

# Optional
LOG_LEVEL=info
PORT=8000
```

**Dockerfile**:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Railway provides PORT env var
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
```

**Deploy**:
```bash
# Deploy to Railway
railway up

# Check logs
railway logs

# Get service URL
railway domain
```

**Next.js Integration**:
```env
# .env.local (Next.js)
TELEGRAM_SERVICE_URL=https://your-service.railway.app
TELEGRAM_SERVICE_SECRET=<same-as-railway>
TELEGRAM_WEBHOOK_SECRET=<same-as-railway>
```

**Success Criteria**:
- Service deployed and accessible
- `/health` returns 200
- Can send test message from Next.js
- Logs visible in Railway dashboard
- Auto-redeploy on git push

---

## 🧪 Testing Strategy

### Unit Tests (pytest)
```python
# tests/test_telegram_client.py
import pytest
from unittest.mock import AsyncMock, patch
from telegram_client import get_telegram_client

@pytest.mark.asyncio
async def test_send_message():
    """Test sending message to Telegram"""
    with patch('telegram_client.TelegramClient') as mock_client:
        mock_message = AsyncMock()
        mock_message.id = 12345
        mock_client.send_message.return_value = mock_message

        async with get_telegram_client() as client:
            result = await client.send_message("Test", "Hello")
            assert result.id == 12345
```

### Integration Tests (FastAPI TestClient)
```python
# tests/test_api.py
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_endpoint():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code in [200, 503]
    assert "status" in response.json()
    assert "checks" in response.json()

def test_send_message_unauthorized():
    """Test send without auth token"""
    response = client.post("/telegram/send-message", json={
        "content": "Test"
    })
    assert response.status_code == 401
```

### E2E Tests (from Next.js)
```typescript
// tests/e2e/telegram-service.test.ts
describe('Telegram Service Integration', () => {
  it('should send message to Telegram', async () => {
    const recipe = await createTestRecipe();

    const response = await fetch('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(recipe)
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.data.telegram_id).toBeDefined();
  });
});
```

**Coverage Goal**: >70%

---

## 📦 Project Structure (Complete)

```
telegram_service/
├── main.py                      # FastAPI app + routes
├── config.py                    # Settings (pydantic-settings)
├── models.py                    # Pydantic models
├── telegram_client.py           # Telethon client manager
├── background.py                # Background monitoring
│
├── utils/
│   ├── crypto.py                # HMAC signature helpers
│   ├── formatters.py            # Recipe/Menu text formatting
│   └── __init__.py
│
├── tests/
│   ├── __init__.py
│   ├── test_telegram_client.py  # Unit tests
│   ├── test_api.py              # Integration tests
│   └── conftest.py              # Pytest fixtures
│
├── requirements.txt             # Production dependencies
├── requirements-dev.txt         # Development dependencies
├── Dockerfile                   # Container image
├── .env.example                 # Environment template
├── .gitignore
├── pytest.ini                   # Pytest configuration
└── README.md                    # Service documentation
```

---

## ✅ Success Criteria

Phase 4 complete when:

- [ ] **Deployment**: Python service deployed to Railway
- [ ] **Endpoints**: All 4 core endpoints work (send/edit/delete/sync)
- [ ] **Security**: HMAC signatures implemented and verified
- [ ] **Background**: Old channel monitoring active
- [ ] **Webhooks**: Next.js receives and processes webhooks
- [ ] **Health**: `/health` endpoint reports status
- [ ] **Logging**: Structured logs visible in Railway
- [ ] **Tests**: >70% coverage, all tests passing
- [ ] **Integration**: 15 blocked endpoints now functional
- [ ] **Documentation**: README with deployment instructions

---

## 🚀 Execution Strategy

### Wave 1: Local Development (Day 1-2)
**Goal**: Get service running locally

1. **Task 4.1**: FastAPI Setup (2-3h)
   - Bootstrap project structure
   - Setup environment variables
   - Test `/health` endpoint

2. **Task 4.2**: Telethon Integration (3-4h)
   - Connect to Telegram
   - Test send/edit/delete locally

3. **Task 4.3**: Core Endpoints (4-5h)
   - Implement 3 CRUD operations
   - Test with Postman/curl

**Checkpoint**: Can send/edit/delete via `http://localhost:8000`

---

### Wave 2: Advanced Features (Day 3-4)
**Goal**: Add sync and monitoring

4. **Task 4.4**: Sync Operations (3-4h)
   - Implement message fetching
   - Test initial DB population

5. **Task 4.5**: Background Monitoring (3-4h)
   - Setup event listeners
   - Test webhook delivery

6. **Task 4.6**: Security (2-3h)
   - Add HMAC signatures
   - Verify in Next.js

**Checkpoint**: Background monitoring works, webhooks verified

---

### Wave 3: Production Readiness (Day 5-6)
**Goal**: Deploy and integrate

7. **Task 4.7**: Health & Logging (2-3h)
   - Structured logging
   - Health checks

8. **Task 4.8**: Railway Deployment (2-3h)
   - Deploy to Railway
   - Configure environment variables

9. **Next.js Integration**: Update API routes (3-4h)
   - Replace placeholders
   - Test end-to-end
   - Deploy to Vercel

**Checkpoint**: All 15 blocked endpoints functional in production

---

## 📊 Estimated Timeline

| Wave | Tasks | Hours | Days |
|------|-------|-------|------|
| Wave 1 | 4.1-4.3 | 9-12h | 2 |
| Wave 2 | 4.4-4.6 | 8-11h | 2 |
| Wave 3 | 4.7-4.8 + Integration | 7-10h | 2 |
| **Total** | **8 tasks** | **24-33h** | **6 days** |

---

## 🔗 Dependencies

**Requires** (from previous phases):
- ✅ Phase 1: PostgreSQL + Prisma schema
- ✅ Phase 2: API routes infrastructure (~70% done)

**Enables** (next phase):
- Phase 3: Auth can now work with full CRUD
- Phase 5: Deployment can include Python service

---

## 📝 AI Agent Instructions

### Before Starting:
1. קרא `backend/ourRecipesBack/services/telegram_service.py` - זה הייחוס שלך
2. קרא `backend/ourRecipesBack/routes/sync.py` - להבין sync operations
3. קרא `docs/refactor/CURRENT_STATE.md` - לראות איזה endpoints חסומים

### During Implementation:
1. **Task 4.1-4.2**: התחל local, ודא שTelethon מתחבר
2. **Task 4.3**: כל endpoint = commit נפרד
3. **Task 4.4**: בדוק sync עם 10 messages קודם, אז 100
4. **Task 4.5**: Log כל webhook sent/received
5. **Task 4.6**: אל תדלג על security - זה קריטי!
6. **Task 4.7**: Health check צריך לזהות בעיות מוקדם
7. **Task 4.8**: בדוק logs ב-Railway אחרי deploy

### Common Pitfalls:
- ⚠️ **Session String**: Must be from Telegram account with channel admin rights
- ⚠️ **Async Context**: Always use `async with get_telegram_client()`
- ⚠️ **Image Handling**: BytesIO needs `.name` attribute
- ⚠️ **Webhook Signatures**: Must use same secret in Python & Next.js
- ⚠️ **Background Tasks**: Use FastAPI lifespan, not bare `asyncio.run()`

---

## 🆘 Troubleshooting

### Telethon Connection Issues
```python
# Check session status
async with get_telegram_client() as client:
    me = await client.get_me()
    print(f"Connected as: {me.username}")
```

### Webhook Not Received
```python
# Add debug logging
logger.info("sending_webhook", url=webhook_url, payload=payload)
response = await http_client.post(...)
logger.info("webhook_response", status=response.status_code, body=response.text)
```

### Railway Deployment Failed
```bash
# Check logs
railway logs --tail 100

# Verify environment variables
railway variables

# Test locally first
docker build -t telegram-service .
docker run -p 8000:8000 --env-file .env telegram-service
```

---

## 📚 References

**External Docs**:
- [Telethon Documentation](https://docs.telethon.dev/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Railway Deployment Guide](https://docs.railway.app/)
- [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)

**Internal Refs**:
- Flask Reference: `backend/ourRecipesBack/services/telegram_service.py`
- Sync Routes: `backend/ourRecipesBack/routes/sync.py`
- Blocked Endpoints: `docs/refactor/CURRENT_STATE.md`
- Phase 2 Status: `docs/refactor/phases/phase-2-api-migration/README.md`

---

**Next Phase**: [Phase 5: Testing & Deployment](../phase-5-deployment/README.md)

**Created**: 2025-11-23
**Status**: 📝 Planned
**Estimated**: 24-33 hours over 6 days

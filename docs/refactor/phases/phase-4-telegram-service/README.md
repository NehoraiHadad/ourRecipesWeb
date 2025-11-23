# 📱 Phase 4: Telegram Microservice

**Timeline**: שבוע 5-6 (16-20 שעות)
**Status**: 📝 Planned
**Dependencies**: Phase 3 complete

---

## 🎯 Phase Goals

ליצור Python microservice (FastAPI + Telethon) לטיפול בכל ה-Telegram operations.

**קריטריון הצלחה**:
- Python service deployed (Railway/Render)
- All 15 Telegram endpoints work
- Webhook communication Next.js ↔ Python
- Background monitoring active
- Group D operations functional

---

## 📊 Architecture

### Current (Flask Monolith)
```
Flask App
├── Routes (Next.js API)
├── Services (Next.js/TypeScript)
└── Telegram (Python/Telethon) ← Problem!
```

### Future (Microservice)
```
Next.js App                    Python Telegram Service
├── API Routes                 ├── FastAPI endpoints
│   └── Call Python →          │   ├── /telegram/send-message
│                              │   ├── /telegram/edit-message
│                              │   └── /telegram/sync-messages
└── Webhooks                   └── Background Tasks
    ← Webhook from Python          └── Monitor old channel
```

---

## 📋 Tasks Breakdown

### Task 4.1: FastAPI Setup (2-3 hours)
**Goal**: Setup Python FastAPI service

**Files to create**:
```
telegram_service/
├── main.py              # FastAPI app
├── telegram.py          # Telethon client
├── models.py            # Pydantic models
├── config.py            # Environment config
├── requirements.txt     # Dependencies
└── Dockerfile           # For deployment
```

**Dependencies**:
```txt
fastapi
uvicorn
telethon
pydantic
httpx
python-dotenv
```

---

### Task 4.2: Telethon Integration (3-4 hours)
**Goal**: Setup Telegram client with Telethon

**Implementation**:
```python
# telegram.py
from telethon import TelegramClient

client = TelegramClient(
    'session',
    api_id=API_ID,
    api_hash=API_HASH
)

async def send_message(channel: str, text: str, image: bytes = None):
    """Send message to Telegram channel"""
    message = await client.send_message(
        entity=channel,
        message=text,
        file=image
    )
    return message.id

async def edit_message(channel: str, message_id: int, text: str, image: bytes = None):
    """Edit existing message"""
    await client.edit_message(
        entity=channel,
        message=message_id,
        text=text,
        file=image
    )

async def delete_message(channel: str, message_id: int):
    """Delete message"""
    await client.delete_messages(
        entity=channel,
        message_ids=[message_id]
    )
```

---

### Task 4.3: FastAPI Endpoints (4-5 hours)
**Goal**: Implement all Telegram operations

**Endpoints**:
```python
# main.py
from fastapi import FastAPI, HTTPException
from models import MessageData, MessageEdit

app = FastAPI()

@app.post("/telegram/send-message")
async def send_telegram_message(data: MessageData):
    """Next.js → Python: Send new message"""
    try:
        message_id = await telegram.send_message(
            channel=data.channel,
            text=data.content,
            image=data.image_data
        )
        return {"message_id": message_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/telegram/edit-message")
async def edit_telegram_message(data: MessageEdit):
    """Next.js → Python: Edit message"""
    await telegram.edit_message(
        channel=data.channel,
        message_id=data.message_id,
        text=data.content,
        image=data.image_data
    )
    return {"success": True}

@app.delete("/telegram/delete-message/{message_id}")
async def delete_telegram_message(message_id: int, channel: str):
    """Next.js → Python: Delete message"""
    await telegram.delete_message(channel, message_id)
    return {"success": True}

@app.post("/telegram/sync-messages")
async def sync_telegram_messages(data: SyncRequest):
    """Next.js → Python: Sync messages"""
    messages = []
    async for message in telegram.client.iter_messages(
        entity=data.channel,
        limit=data.limit,
        offset_id=data.offset_id
    ):
        messages.append({
            "id": message.id,
            "text": message.text,
            "media": message.media,
            "date": message.date.isoformat()
        })
    return {"messages": messages}
```

---

### Task 4.4: Background Monitoring (3-4 hours)
**Goal**: Monitor old channel and copy to new channel

**Implementation**:
```python
from telethon import events

@telegram.client.on(events.NewMessage(chats=OLD_CHANNEL))
async def handle_new_message(event):
    """Monitor old channel, copy to new channel"""
    # Copy message to new channel
    new_msg = await telegram.send_message(
        channel=NEW_CHANNEL,
        text=event.text,
        image=event.media
    )

    # Notify Next.js via webhook
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{NEXTJS_URL}/api/webhooks/telegram-message",
            json={
                "message_id": new_msg.id,
                "content": event.text,
                "media": event.media,
                "old_message_id": event.id
            },
            headers={
                "X-Webhook-Secret": WEBHOOK_SECRET
            }
        )
```

---

### Task 4.5: Next.js Integration (2-3 hours)
**Goal**: Update Next.js to call Python service

**Implementation**:
```typescript
// lib/services/telegramClient.ts
import { logger } from '@/lib/logger';

const TELEGRAM_SERVICE_URL = process.env.TELEGRAM_SERVICE_URL!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;

export async function sendToTelegram(
  content: string,
  imageData?: Buffer
): Promise<number> {
  const response = await fetch(`${TELEGRAM_SERVICE_URL}/telegram/send-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({
      channel: process.env.TELEGRAM_CHANNEL_URL,
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

export async function editInTelegram(
  messageId: number,
  content: string,
  imageData?: Buffer
): Promise<void> {
  const response = await fetch(`${TELEGRAM_SERVICE_URL}/telegram/edit-message`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({
      channel: process.env.TELEGRAM_CHANNEL_URL,
      message_id: messageId,
      content,
      image_data: imageData?.toString('base64')
    })
  });

  if (!response.ok) {
    throw new Error('Failed to edit in Telegram');
  }
}
```

---

### Task 4.6: Webhook Handler (2-3 hours)
**Goal**: Handle webhooks from Python service

**Implementation**:
```typescript
// app/api/webhooks/telegram-message/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  // Verify webhook signature
  const signature = request.headers.get('X-Webhook-Secret');
  if (signature !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json();

  // Process new message from Telegram
  await prisma.recipe.create({
    data: {
      telegram_id: body.message_id,
      raw_content: body.content,
      // ... parse and save
    }
  });

  return new Response('OK', { status: 200 });
}
```

---

## 📊 Deployment

### Railway (Recommended)
```bash
# Create new project on Railway
railway init

# Deploy Python service
railway up

# Set environment variables
railway variables set API_ID=...
railway variables set API_HASH=...
railway variables set SESSION_STRING=...
railway variables set NEXTJS_URL=https://app.vercel.app
```

### Render (Alternative)
```yaml
# render.yaml
services:
  - type: web
    name: telegram-service
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: API_ID
        sync: false
      - key: API_HASH
        sync: false
```

---

## ✅ Success Criteria

- [ ] Python service deployed
- [ ] All 15 Telegram endpoints work
- [ ] Background monitoring active
- [ ] Webhooks working
- [ ] Security (HMAC) in place
- [ ] Error handling works
- [ ] Logs accessible

---

## 🔗 Related

**Implements**:
- Task 2.9 stubs (all 15 endpoints)

**Enables**:
- Recipe create/update
- Menu save/update/delete
- Places CRUD
- Sync operations
- Version restore

---

**Next**: [Phase 5: Deployment & Testing](../phase-5-deployment/README.md)

**Created**: 2025-11-22
**Status**: 📝 Planned

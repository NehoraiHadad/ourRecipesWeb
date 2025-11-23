# 📱 Telegram Service

Python FastAPI microservice for handling Telegram operations using Telethon.

## 🎯 Purpose

This service acts as a bridge between the Next.js application and Telegram, handling:
- Sending messages to Telegram channels
- Editing existing messages
- Deleting messages
- Syncing messages from channels to the database
- Background monitoring of channels (optional)

## 🏗️ Architecture

```
Next.js App (Vercel)  ←→  Telegram Service (Railway)  ←→  Telegram API
                HTTP REST              Telethon
```

## 📋 Requirements

- Python 3.11+
- Telegram API credentials (API_ID, API_HASH)
- Telegram session string (StringSession)
- Channel admin permissions

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `SESSION_STRING` - Telegram session string
- `API_ID` - Telegram API ID
- `API_HASH` - Telegram API hash
- `CHANNEL_URL` - Your Telegram channel URL
- `TELEGRAM_SERVICE_SECRET` - Random secret for auth
- `WEBHOOK_SECRET` - Random secret for HMAC signatures

### 3. Generate Session String

```python
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(input('API_ID: '))
API_HASH = input('API_HASH: ')

with TelegramClient(StringSession(), API_ID, API_HASH) as client:
    print("Session String:", client.session.save())
```

### 4. Run Locally

```bash
# Development mode (auto-reload)
uvicorn main:app --reload --port 8000

# Production mode
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 5. Test

Visit:
- http://localhost:8000 - Service info
- http://localhost:8000/health - Health check
- http://localhost:8000/docs - Swagger UI (interactive docs)
- http://localhost:8000/telegram/session/status - Telegram connection status

## 📡 API Endpoints

### Health & Status

#### `GET /health`
Comprehensive health check with Telegram connection status.

#### `GET /telegram/session/status`
Check Telegram session health and user information.

### Telegram Operations

#### `POST /telegram/send-message`
Send a message to Telegram channel.

**Request:**
```json
{
  "content": "Message text",
  "image_data": "base64_encoded_image",
  "channel_url": "optional_override"
}
```

**Response:**
```json
{
  "message_id": 12345,
  "date": "2025-11-23T10:00:00Z",
  "success": true
}
```

#### `PUT /telegram/edit-message`
Edit an existing message.

**Request:**
```json
{
  "message_id": 12345,
  "content": "Updated text",
  "image_data": "base64_encoded_image",
  "channel_url": "optional_override"
}
```

#### `DELETE /telegram/delete-message/{message_id}`
Delete a message from the channel.

**Query Params:**
- `channel_url` (optional) - Override default channel

#### `POST /telegram/sync-messages`
Fetch messages from Telegram channel for database population.

**Request:**
```json
{
  "limit": 100,
  "offset_id": 0,
  "reverse": false,
  "channel_url": "optional_override"
}
```

## 🔒 Security

### Authentication

All endpoints (except `/health` and `/`) require Bearer token authentication:

```bash
Authorization: Bearer YOUR_TELEGRAM_SERVICE_SECRET
```

### Webhook Signatures

Webhooks sent to Next.js include HMAC SHA-256 signatures:

```
X-Webhook-Signature: <hmac_sha256_hex>
```

Verify signatures on the receiving end to ensure authenticity.

## 🐳 Docker

Build and run with Docker:

```bash
# Build image
docker build -t telegram-service .

# Run container
docker run -p 8000:8000 --env-file .env telegram-service
```

## 🚢 Deployment (Railway)

### 1. Install Railway CLI

```bash
npm i -g @railway/cli
```

### 2. Login and Deploy

```bash
railway login
railway init
railway up
```

### 3. Set Environment Variables

In Railway dashboard, add all variables from `.env.example`.

### 4. Get Service URL

```bash
railway domain
```

## 🧪 Testing

Run tests with pytest:

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/test_api.py
```

## 📊 Logging

Service uses structured JSON logging (structlog):

```json
{
  "event": "message_sent",
  "level": "info",
  "message_id": 12345,
  "timestamp": "2025-11-23T10:00:00Z"
}
```

View logs in Railway:
```bash
railway logs --tail 100
```

## 🔧 Troubleshooting

### Connection Issues

```bash
# Test Telegram connection
curl http://localhost:8000/telegram/session/status
```

### Invalid Session String

Regenerate session string using the Python script in step 3 of Quick Start.

### Permission Errors

Ensure the Telegram account has admin permissions in the target channel.

## 📚 Documentation

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Telethon Documentation](https://docs.telethon.dev/)
- [Phase 4 Implementation Guide](../docs/refactor/phases/phase-4-telegram-service/README.md)

## 📝 Project Structure

```
telegram_service/
├── main.py              # FastAPI app + routes
├── config.py            # Settings & logging
├── models.py            # Pydantic models
├── telegram_client.py   # Telethon client manager
├── background.py        # Background monitoring (Wave 4)
├── utils/
│   ├── crypto.py        # HMAC signatures (Wave 5)
│   └── formatters.py    # Text formatting (Wave 6)
├── tests/
│   ├── test_api.py      # API tests
│   ├── test_telegram_client.py
│   └── conftest.py
├── requirements.txt
├── Dockerfile
├── .env.example
└── README.md
```

## 🎯 Current Status

- ✅ **Wave 1**: FastAPI Setup + Telethon Integration
- ⬜ **Wave 2**: Send/Edit/Delete Endpoints
- ⬜ **Wave 3**: Sync Operations
- ⬜ **Wave 4**: Background Monitoring
- ⬜ **Wave 5**: Security (HMAC)
- ⬜ **Wave 6**: Production Readiness

## 📞 Support

For issues or questions, see:
- [Phase 4 Agent Prompt](../PHASE_4_AGENT_PROMPT.md)
- [Project README](../README.md)

---

**Created**: 2025-11-23
**Version**: 1.0.0 (Wave 1 Complete)
**Python**: 3.11+

# 📋 Task 4.2: Telethon Integration

**משימה**: Setup Telegram Client with Telethon
**מזהה**: TASK-4-2
**שלב**: Phase 4 - Telegram Microservice
**סטטוס**: ⬜ Not Started
**זמן משוער**: 3-4 שעות

---

## 🎯 Goal (מטרה)

לשלב את Telethon ב-FastAPI service וליצור singleton client manager שמטפל בconnections ל-Telegram.
Client זה ישמש לכל פעולות הTelegram (send/edit/delete messages).

### Why This Task?

1. **Telethon = Only Option**: אין JavaScript library איכותי ל-Telegram MTProto
2. **Session Management**: Telegram session strings דורשים Python runtime
3. **Connection Pooling**: Singleton pattern מבטיח connection אחד בלבד
4. **Async/Await**: Telethon async native - מתאים ל-FastAPI

---

## 📦 Prerequisites (תלויות)

**חייב להשלים לפני:**
- [x] TASK-4-1: FastAPI Setup completed
- [ ] Telegram API credentials (API_ID, API_HASH)
- [ ] Telegram session string generated
- [ ] Access to Telegram channel (as admin)

**Session String Setup:**

```bash
# Install telethon locally
pip install telethon

# Run session generator
python -c "
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(input('Enter API_ID: '))
API_HASH = input('Enter API_HASH: ')

with TelegramClient(StringSession(), API_ID, API_HASH) as client:
    print('Your session string:')
    print(client.session.save())
"
# Copy the output to .env as SESSION_STRING
```

---

## 📋 Implementation Guide (הנחיות מימוש)

### Step 1: יצירת `telegram_client.py` - Client Manager

**קובץ**: `telegram_service/telegram_client.py`

```python
from telethon import TelegramClient
from telethon.sessions import StringSession
from config import settings
import asyncio
from contextlib import asynccontextmanager
from typing import Optional
import structlog

logger = structlog.get_logger()


class TelegramClientManager:
    """
    Singleton manager for Telegram client connection.

    Ensures only one connection to Telegram is maintained across
    all requests, preventing connection exhaustion.
    """

    _client: Optional[TelegramClient] = None
    _lock = asyncio.Lock()
    _connection_attempts = 0
    _max_retries = 3

    @classmethod
    async def get_client(cls) -> TelegramClient:
        """
        Get or create Telegram client.

        Returns:
            TelegramClient: Connected Telegram client instance

        Raises:
            ConnectionError: If unable to connect after retries
        """
        async with cls._lock:
            if cls._client is None or not cls._client.is_connected():
                await cls._create_client()

            return cls._client

    @classmethod
    async def _create_client(cls):
        """Create and connect new Telegram client"""
        for attempt in range(cls._max_retries):
            try:
                logger.info(
                    "telegram_connecting",
                    attempt=attempt + 1,
                    max_retries=cls._max_retries
                )

                cls._client = TelegramClient(
                    session=StringSession(settings.SESSION_STRING),
                    api_id=settings.API_ID,
                    api_hash=settings.API_HASH
                )

                await cls._client.start()

                # Verify connection
                me = await cls._client.get_me()
                logger.info(
                    "telegram_connected",
                    user_id=me.id,
                    username=me.username,
                    phone=me.phone
                )

                cls._connection_attempts = 0
                return

            except Exception as e:
                logger.error(
                    "telegram_connection_failed",
                    attempt=attempt + 1,
                    error=str(e)
                )
                cls._connection_attempts += 1

                if attempt < cls._max_retries - 1:
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                else:
                    raise ConnectionError(f"Failed to connect to Telegram after {cls._max_retries} attempts")

    @classmethod
    async def close(cls):
        """Close Telegram client connection"""
        if cls._client:
            logger.info("telegram_disconnecting")
            await cls._client.disconnect()
            cls._client = None
            logger.info("telegram_disconnected")

    @classmethod
    async def check_health(cls) -> dict:
        """
        Check Telegram connection health

        Returns:
            dict: Health status with connection details
        """
        try:
            if cls._client is None:
                return {
                    "status": "disconnected",
                    "connected": False
                }

            if not cls._client.is_connected():
                return {
                    "status": "error",
                    "connected": False,
                    "error": "Client exists but not connected"
                }

            me = await cls._client.get_me()
            return {
                "status": "healthy",
                "connected": True,
                "user_id": me.id,
                "username": me.username,
                "phone": me.phone
            }

        except Exception as e:
            return {
                "status": "error",
                "connected": False,
                "error": str(e)
            }


@asynccontextmanager
async def get_telegram_client():
    """
    Context manager for Telegram operations.

    Usage:
        async with get_telegram_client() as client:
            message = await client.send_message(channel, "Hello")

    Yields:
        TelegramClient: Connected Telegram client
    """
    client = await TelegramClientManager.get_client()
    try:
        yield client
    except Exception as e:
        logger.error("telegram_operation_failed", error=str(e))
        raise
    # Note: Don't close client here - keep connection alive
```

**הנחיות:**
- השתמש ב-`StringSession` - לא ב-file session
- Singleton pattern מבטיח connection אחד בלבד
- Exponential backoff על retry attempts
- Context manager לשימוש נוח

---

### Step 2: עדכון `main.py` - Lifespan Integration

**מה לעדכן**:
- [ ] Import the TelegramClientManager
- [ ] Connect at startup
- [ ] Disconnect at shutdown

**עדכן את הlifespan function ב-`main.py`:**

```python
# main.py
from telegram_client import TelegramClientManager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - startup and shutdown events"""
    logger.info("service_starting", environment=settings.ENVIRONMENT)

    # Startup: Connect to Telegram
    try:
        client = await TelegramClientManager.get_client()
        logger.info("telegram_startup_complete")
    except Exception as e:
        logger.error("telegram_startup_failed", error=str(e))
        # Don't crash - service can still start for health checks

    yield

    # Shutdown: Disconnect from Telegram
    await TelegramClientManager.close()
    logger.info("service_shutting_down")
```

---

### Step 3: עדכון `/health` Endpoint - Telegram Status

**עדכן ב-`main.py`:**

```python
@app.get("/health")
async def health_check():
    """Comprehensive health check including Telegram"""
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

    # Check required environment variables
    required_vars = ["SESSION_STRING", "API_ID", "API_HASH", "CHANNEL_URL"]
    missing = [var for var in required_vars if not hasattr(settings, var) or not getattr(settings, var)]

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

---

### Step 4: הוספת `/telegram/session/status` Endpoint

**הוסף ב-`main.py`:**

```python
@app.get("/telegram/session/status")
async def session_status():
    """
    Get detailed Telegram session status

    Returns:
        dict: Session status and user info
    """
    try:
        async with get_telegram_client() as client:
            me = await client.get_me()

            return {
                "status": "connected",
                "user_id": me.id,
                "username": me.username,
                "phone": me.phone,
                "is_bot": me.bot,
                "first_name": me.first_name,
                "last_name": me.last_name
            }
    except Exception as e:
        logger.error("session_status_failed", error=str(e))
        raise HTTPException(
            status_code=503,
            detail=f"Telegram session error: {str(e)}"
        )
```

---

### Step 5: יצירת Tests

**קובץ**: `telegram_service/tests/test_telegram_client.py`

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from telegram_client import TelegramClientManager, get_telegram_client


@pytest.mark.asyncio
async def test_get_client_creates_new_client():
    """Test that get_client creates new client if none exists"""
    # Reset singleton
    TelegramClientManager._client = None

    with patch('telegram_client.TelegramClient') as mock_telegram_client:
        mock_client = AsyncMock()
        mock_client.is_connected.return_value = True
        mock_client.get_me.return_value = MagicMock(
            id=123,
            username="testuser",
            phone="+1234567890"
        )
        mock_telegram_client.return_value = mock_client

        client = await TelegramClientManager.get_client()

        assert client is not None
        assert mock_client.start.called


@pytest.mark.asyncio
async def test_get_client_reuses_existing_client():
    """Test that get_client reuses existing connected client"""
    mock_client = AsyncMock()
    mock_client.is_connected.return_value = True

    TelegramClientManager._client = mock_client

    client = await TelegramClientManager.get_client()

    assert client is mock_client


@pytest.mark.asyncio
async def test_context_manager():
    """Test context manager usage"""
    mock_client = AsyncMock()
    mock_client.is_connected.return_value = True

    TelegramClientManager._client = mock_client

    async with get_telegram_client() as client:
        assert client is mock_client


@pytest.mark.asyncio
async def test_close_disconnects_client():
    """Test that close method disconnects client"""
    mock_client = AsyncMock()
    TelegramClientManager._client = mock_client

    await TelegramClientManager.close()

    assert mock_client.disconnect.called
    assert TelegramClientManager._client is None
```

**קובץ**: `telegram_service/tests/conftest.py`

```python
import pytest
from telegram_client import TelegramClientManager


@pytest.fixture(autouse=True)
async def reset_telegram_client():
    """Reset singleton before each test"""
    TelegramClientManager._client = None
    TelegramClientManager._connection_attempts = 0
    yield
    TelegramClientManager._client = None
```

---

## ✅ Success Criteria (קריטריוני הצלחה)

### Functional Requirements:
- [ ] Telegram client מתחבר בהצלחה בstartup
- [ ] `/health` מציג Telegram connection status
- [ ] `/telegram/session/status` מחזיר user info
- [ ] Context manager (`get_telegram_client`) עובד
- [ ] Singleton pattern - רק connection אחד

### Technical Requirements:
- [ ] StringSession used (not file sessions)
- [ ] Exponential backoff on connection errors
- [ ] Proper error logging
- [ ] Async/await throughout
- [ ] Type hints on all functions

### Testing:
- [ ] All tests pass: `pytest tests/test_telegram_client.py -v`
- [ ] Can connect to real Telegram (manual test)
- [ ] Health check shows "healthy" when connected

---

## 🧪 Testing Instructions (הנחיות בדיקה)

### Manual Testing:

```bash
# 1. Update .env with real credentials
cat >> telegram_service/.env << EOF
API_ID=your_api_id
API_HASH=your_api_hash
SESSION_STRING=your_session_string
CHANNEL_URL=https://t.me/your_channel
EOF

# 2. Start server
cd telegram_service
source venv/bin/activate
python main.py
```

**Expected logs:**
```json
{"event": "service_starting", ...}
{"event": "telegram_connecting", "attempt": 1, ...}
{"event": "telegram_connected", "user_id": 12345, "username": "youruser", ...}
{"event": "telegram_startup_complete"}
```

**Test endpoints:**
```bash
# Health check - should show Telegram connected
curl http://localhost:8000/health | jq .
# Expected: {"status": "healthy", "checks": {"telegram": {"status": "healthy", ...}}}

# Session status
curl http://localhost:8000/telegram/session/status | jq .
# Expected: {"status": "connected", "user_id": 12345, ...}
```

### Automated Testing:

```bash
# Run tests with coverage
pytest tests/test_telegram_client.py -v --cov=telegram_client

# Expected: All tests pass, >80% coverage
```

---

## 🔄 Rollback Strategy (אסטרטגיית חזרה)

**אם Telegram לא מתחבר:**

1. **Verify Session String:**
   ```bash
   # Regenerate session string
   python scripts/generate_session.py
   # Copy new SESSION_STRING to .env
   ```

2. **Check API Credentials:**
   - Verify API_ID and API_HASH at https://my.telegram.org/apps
   - Ensure account has access to channel

3. **Check Channel Permissions:**
   - Account must be admin in channel
   - Channel URL must be correct

4. **Fallback to Previous Task:**
   ```bash
   # If all else fails, revert to basic FastAPI
   git checkout main.py config.py
   # Service will run but without Telegram
   ```

---

## 📊 Estimated Time

- **Minimum**: 3 hours (if session string works first try)
- **Expected**: 3.5 hours (including session generation + debugging)
- **Maximum**: 4 hours (if session issues or channel permissions problems)

---

## 📝 Implementation Notes

### Important Considerations:

1. **Session String Security**:
   - Never commit SESSION_STRING to git
   - Rotate session strings periodically
   - Use different sessions for dev/prod

2. **Connection Pooling**:
   - Only ONE client instance per service
   - Don't create new clients per request
   - Reuse connection across all operations

3. **Error Handling**:
   - Service should start even if Telegram fails
   - Health endpoint should reflect degraded state
   - Retry connections with exponential backoff

### Potential Issues:

- **Issue**: `FloodWaitError` from Telegram
  - **Solution**: Respect rate limits, add delays between operations

- **Issue**: Session expired
  - **Solution**: Regenerate session string using the generator script

- **Issue**: "No user has session" error
  - **Solution**: Ensure SESSION_STRING is from authorized session (ran client.start() with phone verification)

### References:

- [Telethon Documentation](https://docs.telethon.dev/)
- [Session Strings Guide](https://docs.telethon.dev/en/stable/concepts/sessions.html#string-sessions)
- **Flask Reference**: `backend/ourRecipesBack/services/telegram_service.py:62-102`

---

## 🔗 Related Tasks

**Depends on:**
- TASK-4-1: FastAPI Setup ✅

**Blocks:**
- TASK-4-3: Send/Edit/Delete Endpoints
- TASK-4-4: Sync Operations
- TASK-4-5: Background Monitoring

**Related:**
- None

---

## ✏️ AI Agent Instructions

```
Task: Integrate Telethon into FastAPI service with singleton client manager

Context:
- FastAPI service already running (Task 4.1 complete)
- Need to connect to Telegram using Telethon
- Connection must be singleton (one per service, not per request)
- Service should start even if Telegram fails (degraded mode)

Your job:
1. Create telegram_client.py with TelegramClientManager class
2. Implement singleton pattern with asyncio.Lock
3. Update main.py lifespan to connect/disconnect
4. Update /health to show Telegram status
5. Add /telegram/session/status endpoint
6. Write tests for client manager

Constraints:
- Use StringSession (not file sessions)
- Must be async/await throughout
- Single client instance - no new clients per request
- Include exponential backoff on connection errors
- Don't crash service if Telegram fails

Reference implementation:
- See backend/ourRecipesBack/services/telegram_service.py:62-102

Expected output:
- telegram_client.py created
- main.py updated with Telegram integration
- Tests passing
- Service connects to Telegram on startup
- /health shows Telegram connection status

Test command:
python main.py
# Should see: "telegram_connected" in logs
curl http://localhost:8000/health
# Should show: "checks": {"telegram": {"status": "healthy"}}
```

---

**Created**: 2025-11-23
**Last Updated**: 2025-11-23
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

**Previous**: [Task 4.1: FastAPI Setup](task-4.1-fastapi-setup.md)
**Next**: [Task 4.3: Send/Edit/Delete Endpoints](task-4.3-send-edit-delete.md)

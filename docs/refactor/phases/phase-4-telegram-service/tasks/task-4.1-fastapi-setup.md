# 📋 Task 4.1: FastAPI Project Setup

**משימה**: Bootstrap Python FastAPI Microservice
**מזהה**: TASK-4-1
**שלב**: Phase 4 - Telegram Microservice
**סטטוס**: ⬜ Not Started
**זמן משוער**: 2-3 שעות

---

## 🎯 Goal (מטרה)

ליצור Python microservice עם FastAPI שמשמש בסיס לכל פעולות הTelegram.
Service זה יהיה נפרד לחלוטין מהNext.js app וייפרס באופן עצמאי ל-Railway.

### Why This Task?

1. **Separation of Concerns**: Telegram logic (Python/Telethon) נפרד מבusiness logic (TypeScript/Next.js)
2. **Technology Match**: Telethon דורש Python - אין אלטרנטיבה טובה ב-TypeScript
3. **Independent Scaling**: Python service יכול להתרחב בנפרד
4. **Clear Boundaries**: HTTP API מוגדר בין שני השירותים

---

## 📦 Prerequisites (תלויות)

**חייב להשלים לפני:**
- [x] Python 3.11+ מותקן
- [x] pip package manager
- [ ] Telegram API credentials (API_ID, API_HASH) - [קבל כאן](https://my.telegram.org/apps)
- [ ] Telegram session string - [הנחיות ליצירה](#session-string-setup)

**Nice to have (אבל לא חובה):**
- [ ] Docker Desktop (לבדיקות מקומיות)
- [ ] Railway CLI (לפריסה)

**External dependencies:**
- None - זה המשימה הראשונה ב-Phase 4

---

## 📋 Implementation Guide (הנחיות מימוש)

### Step 1: יצירת מבנה הפרוייקט

**מה לעשות:**
- [ ] צור תיקייה `telegram_service/` בroot של הפרוייקט
- [ ] צור את כל הקבצים הבסיסיים לפי המבנה למטה

**קבצים ליצור:**

```bash
# Create directory structure
mkdir -p telegram_service/utils telegram_service/tests

# Create all base files
touch telegram_service/{main.py,config.py,models.py,telegram_client.py,background.py}
touch telegram_service/utils/{__init__.py,crypto.py,formatters.py}
touch telegram_service/tests/{__init__.py,test_api.py,test_telegram_client.py,conftest.py}
touch telegram_service/{requirements.txt,requirements-dev.txt,Dockerfile,.env.example,.gitignore,README.md,pytest.ini}
```

**מבנה סופי:**
```
telegram_service/
├── main.py                      # FastAPI app + routes
├── config.py                    # Environment configuration (pydantic-settings)
├── models.py                    # Pydantic request/response models
├── telegram_client.py           # Telethon client manager
├── background.py                # Background monitoring tasks
├── utils/
│   ├── __init__.py
│   ├── crypto.py                # HMAC signature helpers
│   └── formatters.py            # Recipe/Menu text formatting
├── tests/
│   ├── __init__.py
│   ├── test_api.py              # Integration tests
│   ├── test_telegram_client.py  # Unit tests
│   └── conftest.py              # Pytest fixtures
├── requirements.txt             # Production dependencies
├── requirements-dev.txt         # Development dependencies
├── Dockerfile                   # Container for Railway
├── .env.example                 # Environment variables template
├── .gitignore
├── pytest.ini                   # Pytest configuration
└── README.md                    # Service documentation
```

---

### Step 2: כתיבת `requirements.txt`

**מה לעשות:**
- [ ] צור קובץ `requirements.txt` עם dependencies מינימליים

**תוכן הקובץ:**
```txt
# FastAPI and server
fastapi==0.104.1
uvicorn[standard]==0.24.0

# Telegram client
telethon==1.33.0

# Data validation
pydantic==2.5.0
pydantic-settings==2.1.0

# HTTP client for webhooks
httpx==0.25.1

# Logging
structlog==23.2.0

# Environment variables
python-dotenv==1.0.0
```

**Development dependencies** (`requirements-dev.txt`):
```txt
# Testing
pytest==7.4.3
pytest-asyncio==0.21.1
pytest-cov==4.1.0
pytest-mock==3.12.0

# Code quality
black==23.11.0
ruff==0.1.6
mypy==1.7.1
```

---

### Step 3: בניית `config.py` - Environment Configuration

**מה לעשות:**
- [ ] השתמש ב-`pydantic-settings` לניהול environment variables מרוכז
- [ ] הגדר ערכי ברירת מחדל סבירים

**תוכן הקובץ:**
```python
# config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import structlog

class Settings(BaseSettings):
    """Application settings from environment variables"""

    # Telegram credentials
    API_ID: int
    API_HASH: str
    SESSION_STRING: str
    CHANNEL_URL: str

    # Optional: Old channel monitoring
    OLD_CHANNEL_URL: Optional[str] = None

    # Next.js integration
    NEXTJS_URL: str
    TELEGRAM_SERVICE_SECRET: str  # Bearer token for Next.js → Python
    WEBHOOK_SECRET: str           # HMAC secret for Python → Next.js

    # Server configuration
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    LOG_LEVEL: str = "info"
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True
    )


def configure_logging(log_level: str = "info"):
    """Configure structured logging"""
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


# Create global settings instance
settings = Settings()  # type: ignore
configure_logging(settings.LOG_LEVEL)
```

---

### Step 4: יצירת `main.py` - FastAPI App בסיסי

**מה לעשות:**
- [ ] צור FastAPI app עם `/health` endpoint פשוט
- [ ] הגדר CORS אם נדרש
- [ ] הוסף lifespan context manager (לשימוש מאוחר יותר)

**תוכן הקובץ:**
```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog
from datetime import datetime, timezone

from config import settings

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan - startup and shutdown events"""
    logger.info("service_starting", environment=settings.ENVIRONMENT)

    # Startup logic will go here (Task 4.5)
    yield

    # Shutdown logic will go here
    logger.info("service_shutting_down")


app = FastAPI(
    title="Telegram Service",
    description="Python microservice for Telegram operations",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.NEXTJS_URL] if settings.ENVIRONMENT == "production" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Telegram Microservice",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Basic health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.ENVIRONMENT
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
        log_level=settings.LOG_LEVEL.lower()
    )
```

---

### Step 5: יצירת `.env.example` Template

**מה לעשות:**
- [ ] צור template עם כל ה-environment variables הנדרשים
- [ ] הוסף הסברים לכל משתנה

**תוכן הקובץ:**
```bash
# Telegram API Credentials
# Get from: https://my.telegram.org/apps
API_ID=12345678
API_HASH=abcdef1234567890abcdef1234567890

# Telegram Session String
# Generate using: python scripts/generate_session.py
SESSION_STRING=your_session_string_here

# Telegram Channel URL
CHANNEL_URL=https://t.me/your_channel_name

# Optional: Old channel to monitor (for migration)
# OLD_CHANNEL_URL=https://t.me/old_channel_name

# Next.js Integration
NEXTJS_URL=http://localhost:3000
TELEGRAM_SERVICE_SECRET=your_random_secret_here
WEBHOOK_SECRET=your_random_webhook_secret_here

# Server Configuration
PORT=8000
HOST=0.0.0.0
LOG_LEVEL=info
ENVIRONMENT=development
```

---

### Step 6: `.gitignore` Configuration

**תוכן הקובץ:**
```gitignore
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Environment
.env
.venv
env/
venv/
ENV/

# Telegram sessions
*.session
*.session-journal

# Testing
.coverage
htmlcov/
.pytest_cache/

# IDE
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log
logs/
```

---

### Step 7: `Dockerfile` ליצירת Container

**מה לעשות:**
- [ ] צור Dockerfile optimized ל-production
- [ ] השתמש ב-multi-stage build אם אפשר

**תוכן הקובץ:**
```dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Railway will override with $PORT)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

# Run application
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```

---

### Step 8: `pytest.ini` Configuration

**תוכן הקובץ:**
```ini
[pytest]
asyncio_mode = auto
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    -v
    --cov=.
    --cov-report=term-missing
    --cov-report=html
    --cov-fail-under=70
markers =
    asyncio: mark test as async
    unit: mark test as unit test
    integration: mark test as integration test
```

---

### Step 9: Basic README.md

**תוכן הקובץ:**
```markdown
# Telegram Service

Python microservice לניהול כל פעולות Telegram עבור ourRecipes.

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Telegram API credentials ([Get here](https://my.telegram.org/apps))
- Telegram session string

### Installation

\`\`\`bash
# Clone repository
cd telegram_service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\\Scripts\\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Setup environment
cp .env.example .env
# Edit .env with your credentials
\`\`\`

### Running Locally

\`\`\`bash
# Development mode (with auto-reload)
python main.py

# Or with uvicorn directly
uvicorn main:app --reload --port 8000
\`\`\`

Service will be available at http://localhost:8000

### Testing

\`\`\`bash
# Run all tests
pytest

# Run with coverage
pytest --cov

# Run specific test file
pytest tests/test_api.py -v
\`\`\`

## 📚 API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 🔗 Environment Variables

See `.env.example` for all required variables.

## 📦 Deployment

See [Phase 4 README](../README.md#task-48-railway-deployment) for Railway deployment instructions.
```

---

## ✅ Success Criteria (קריטריוני הצלחה)

### Functional Requirements:
- [ ] FastAPI server מתחיל בהצלחה
- [ ] `/health` endpoint מחזיר status 200
- [ ] `/docs` (Swagger UI) נגיש
- [ ] Environment variables נטענים מ-`.env`

### Technical Requirements:
- [ ] כל הקבצים במבנה נכון
- [ ] `requirements.txt` תקין ומותקן
- [ ] Logging מוגדר (structlog JSON format)
- [ ] No errors בזמן startup

### Testing:
- [ ] `pytest` רץ בהצלחה (גם אם אין עדיין tests)
- [ ] Docker build עובד: `docker build -t telegram-service .`

---

## 🧪 Testing Instructions (הנחיות בדיקה)

### Manual Testing:

```bash
# 1. Install dependencies
cd telegram_service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Create .env file
cp .env.example .env
# Edit with dummy values for now

# 3. Start server
python main.py
```

**Expected result:**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
{"event": "service_starting", "environment": "development", ...}
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**Test endpoints:**
```bash
# Root endpoint
curl http://localhost:8000/
# Should return: {"service": "Telegram Microservice", "version": "1.0.0", "status": "running"}

# Health check
curl http://localhost:8000/health
# Should return: {"status": "healthy", "timestamp": "...", "environment": "development"}

# Swagger UI
open http://localhost:8000/docs
```

### Automated Testing:

```bash
# Run pytest
pytest -v

# Should see:
# collected 0 items (no tests yet - that's OK!)
```

### Docker Testing:

```bash
# Build image
docker build -t telegram-service .

# Run container
docker run -p 8000:8000 --env-file .env telegram-service

# Test health check
curl http://localhost:8000/health
```

---

## 🔄 Rollback Strategy (אסטרטגיית חזרה)

**אם משהו משתבש:**

1. **Dependencies Installation Failed:**
   ```bash
   # Delete venv and recreate
   rm -rf venv
   python -m venv venv
   source venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

2. **Server Won't Start:**
   - בדוק את ה-`.env` file - ודא שכל המשתנים מוגדרים
   - בדוק logs:
     ```bash
     python main.py 2>&1 | tee startup.log
     ```

3. **Port Already in Use:**
   ```bash
   # Change port in .env
   PORT=8001

   # Or kill existing process
   lsof -ti:8000 | xargs kill -9
   ```

---

## 📊 Estimated Time

- **Minimum**: 2 hours (אם הכל עובד חלק)
- **Expected**: 2.5 hours (כולל debugging קטן)
- **Maximum**: 3 hours (אם יש בעיות עם Python setup)

---

## 📝 Implementation Notes

### Important Considerations:

1. **Python Version**: חייב Python 3.11+ בגלל async/await features ו-Telethon compatibility
2. **Virtual Environment**: תמיד השתמש ב-venv/virtualenv - אל תתקין globally
3. **Environment Variables**: אל תcommit את `.env` - רק `.env.example`
4. **Session String**: המשימה הזו לא דורשת session string אמיתי עדיין - Task 4.2 יטפל בזה

### Potential Issues:

- **Issue**: `uvicorn` לא נמצא
  - **Solution**: `pip install uvicorn[standard]` (with brackets!)

- **Issue**: `pydantic_settings` not found
  - **Solution**: `pip install pydantic-settings` (with dash, not underscore)

- **Issue**: Port 8000 in use
  - **Solution**: Change `PORT` in `.env` to 8001 or kill the process

### References:

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [structlog Documentation](https://www.structlog.org/)
- [Telethon Documentation](https://docs.telethon.dev/) (for next task)

---

## 🔗 Related Tasks

**Blocks** (משימות שתלויות במשימה זו):
- TASK-4-2: Telethon Integration
- TASK-4-3: Send/Edit/Delete Endpoints
- All other Phase 4 tasks

**Related** (משימות קשורות):
- None - זו המשימה הראשונה

---

## ✏️ AI Agent Instructions

**For Claude Code or similar AI agents:**

```
Task: Bootstrap Python FastAPI microservice for Telegram operations

Context:
- This is Phase 4 of a refactor from Flask monolith to Next.js + Python microservice
- Python service will handle ONLY Telegram operations (Telethon)
- Next.js will call this service via HTTP
- Service will be deployed to Railway

Your job:
1. Create all files in the structure shown in Step 1
2. Copy the exact content for each file (requirements.txt, config.py, main.py, etc.)
3. Do NOT implement Telegram functionality yet - that's Task 4.2
4. Focus on getting FastAPI running with /health endpoint

Constraints:
- Use Python 3.11+
- Use pydantic-settings for config (NOT plain os.getenv)
- Use structlog for JSON logging
- Do NOT add extra dependencies not listed
- Keep it minimal - this is just the foundation

Expected output:
- telegram_service/ directory with all files
- Server starts successfully
- /health returns 200
- /docs (Swagger) accessible

Test command:
cd telegram_service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python main.py

Expected to see:
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

**Created**: 2025-11-23
**Last Updated**: 2025-11-23
**Assignee**: AI Agent / Developer
**Reviewer**: Tech Lead

**Next Task**: [Task 4.2: Telethon Integration](task-4.2-telethon-integration.md)

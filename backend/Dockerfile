# backend/Dockerfile
FROM python:3.12.1-slim AS builder

# Set working directory
WORKDIR /app

# Copy only requirements first to leverage cache
COPY requirements.txt .

# Install dependencies in a virtual environment
RUN python -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --no-cache-dir -r requirements.txt

# Final stage
FROM python:3.12.1-slim

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY . .

# Make sure we use the virtualenv
ENV PATH="/opt/venv/bin:$PATH"

# Set environment variables
ENV FLASK_APP=ourRecipesBack
ENV PYTHONUNBUFFERED=1

# Create directory for sessions if it doesn't exist
RUN mkdir -p /app/sessions

# ARG declarations for build-time variables
ARG BOT_ID
ARG API_HASH
ARG CHANNEL_URL
ARG OLD_CHANNEL_URL
ARG BOT_TOKEN
ARG SECRET_JWT
ARG OPENAI_API_KEY
ARG ORIGIN_CORS
ARG GOOGLE_API_KEY
ARG HF_TOKEN

# ENV declarations for runtime
ENV BOT_ID=${BOT_ID}
ENV API_HASH=${API_HASH}
ENV CHANNEL_URL=${CHANNEL_URL}
ENV OLD_CHANNEL_URL=${OLD_CHANNEL_URL}
ENV BOT_TOKEN=${BOT_TOKEN}
ENV SECRET_JWT=${SECRET_JWT}
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV ORIGIN_CORS=${ORIGIN_CORS}
ENV GOOGLE_API_KEY=${GOOGLE_API_KEY}
ENV HF_TOKEN=${HF_TOKEN}

CMD ["flask", "run", "--host=0.0.0.0"]

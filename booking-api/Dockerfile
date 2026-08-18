# Stage 1: install dependencies into an isolated venv
FROM python:3.12-slim AS builder

WORKDIR /app
COPY requirements.txt .

RUN python -m venv /venv && \
    /venv/bin/pip install --no-cache-dir --upgrade pip && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt


# Stage 2: lean runtime image — only the venv and source, no build tools
FROM python:3.12-slim AS runtime

ENV PATH="/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY --from=builder /venv /venv
COPY app/ ./app/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

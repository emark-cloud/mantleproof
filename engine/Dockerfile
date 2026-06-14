FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2 / web3 build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt ./
# Install the [cdp] extra: production runs x402_facilitator=cdp, which lazily
# imports cdp-sdk. Without it the CDP facilitator raises 502 on /verify.
RUN pip install --no-cache-dir -e '.[cdp]'

COPY . .

EXPOSE 8000
# Railway injects $PORT; fall back to 8000 for local `docker run`.
CMD ["sh", "-c", "uvicorn mantleproof.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

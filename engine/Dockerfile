FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg2 / web3 build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir -e .

COPY . .

EXPOSE 8000
CMD ["uvicorn", "mantleproof.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python:3.12-slim

WORKDIR /app

# Install deps first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the ingestion scripts (scraper.py, relay.py, topology.py, db.py)
COPY . .

# Default command is overridden per-service in docker-compose
CMD ["python", "scraper.py"]

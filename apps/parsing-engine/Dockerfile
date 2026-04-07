FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir pip --upgrade && \
    pip install --no-cache-dir "."

# Copy source
COPY src/ ./src/

EXPOSE 8100

RUN adduser --disabled-password --gecos '' appuser
USER appuser

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "2"]

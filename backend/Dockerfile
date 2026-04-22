FROM python:3.14.4-alpine3.23

WORKDIR /app

RUN adduser -D -h /home/appuser appuser
RUN mkdir -p /app/data && chown -R appuser:appuser /app/data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

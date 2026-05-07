FROM python:3.12-slim
WORKDIR /app

COPY apps/bot-py/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/bot-py/main.py .
CMD ["python", "-u", "main.py"]

FROM python:3.14-slim

WORKDIR /service

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY demo_app.py .

EXPOSE 8081

CMD ["python", "-m", "uvicorn", "demo_app:app", "--host", "0.0.0.0", "--port", "8081"]
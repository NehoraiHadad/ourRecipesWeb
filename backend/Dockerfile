# backend/Dockerfile
FROM python:3.12.1
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["sh", "-c", "flask run --host=0.0.0.0 --debug"]
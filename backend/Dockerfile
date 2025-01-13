# backend/Dockerfile
FROM python:3.12.1
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["gunicorn", "--workers", "1", "--bind", "0.0.0.0:5000", "ourRecipesBack:create_app()"]
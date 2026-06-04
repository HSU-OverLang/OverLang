from celery import Celery
import os
from dotenv import load_dotenv

load_dotenv()
print("REDIS_URL =", os.getenv("REDIS_URL"))
print("PWD =", os.getcwd())

REDIS_URL = os.getenv("REDIS_URL")

if REDIS_URL:
    BROKER_URL = REDIS_URL
    BACKEND_URL = REDIS_URL
else:
    REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT = os.getenv("REDIS_PORT", "6379")
    REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")

    if REDIS_PASSWORD:
        BROKER_URL = f"redis://default:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0"
    else:
        BROKER_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}/0"

    BACKEND_URL = BROKER_URL

celery_app = Celery(
    "ai_worker",
    broker=BROKER_URL,
    backend=BACKEND_URL,
    include=["ai.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
)
from celery import Celery
import os
from dotenv import load_dotenv

load_dotenv()
print("REDIS_URL =", os.getenv("REDIS_URL"))
print("PWD =", os.getcwd())


def _resolve_redis_url() -> str:
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        return redis_url

    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = os.getenv("REDIS_PORT", "6379")
    return f"redis://{redis_host}:{redis_port}/0"


# Redis Config
BROKER_URL = _resolve_redis_url()
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
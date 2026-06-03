from __future__ import annotations

import argparse
import json
import logging
import os
import time
from typing import Any

import redis
from dotenv import load_dotenv

from ai.pipeline.callback_client import is_backend_job_valid
from ai.worker.celery_app import celery_app

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_QUEUE_KEY = "job-queue"
DEFAULT_BLOCK_TIMEOUT_SECONDS = 5
DEFAULT_RETRY_DELAY_SECONDS = 3.0
PROCESS_JOB_TASK_NAME = "ai.worker.tasks.process_job_task"


def main() -> None:
    parser = argparse.ArgumentParser(description="OverLang backend job queue consumer")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Consume one payload and exit. Useful for smoke tests.",
    )
    parser.add_argument(
        "--queue-key",
        default=os.getenv("BACKEND_JOB_QUEUE_KEY", DEFAULT_QUEUE_KEY),
        help="Redis list key used by the backend job producer.",
    )
    parser.add_argument(
        "--block-timeout",
        type=int,
        default=int(
            os.getenv(
                "BACKEND_JOB_QUEUE_BLOCK_TIMEOUT_SECONDS",
                str(DEFAULT_BLOCK_TIMEOUT_SECONDS),
            )
        ),
        help="Redis BLPOP timeout in seconds.",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    consume_backend_job_queue(
        queue_key=args.queue_key,
        block_timeout_seconds=args.block_timeout,
        once=args.once,
    )


def consume_backend_job_queue(
    queue_key: str,
    block_timeout_seconds: int = DEFAULT_BLOCK_TIMEOUT_SECONDS,
    once: bool = False,
) -> None:
    redis_client = _build_redis_client()
    logger.info("Backend job queue consumer started: queueKey=%s", queue_key)

    while True:
        try:
            queued_item = redis_client.blpop(queue_key, timeout=block_timeout_seconds)
            if queued_item is None:
                if once:
                    logger.info("No payload received before timeout: queueKey=%s", queue_key)
                    return
                continue

            _, raw_payload = queued_item
            try:
                _dispatch_payload(raw_payload)
            except Exception:
                redis_client.lpush(queue_key, raw_payload)
                logger.exception(
                    "Dispatch failed. Payload was requeued: queueKey=%s",
                    queue_key,
                )
                time.sleep(_resolve_retry_delay_seconds())
                if once:
                    raise

            if once:
                return
        except redis.RedisError:
            logger.exception("Redis job queue read failed. Retrying after delay.")
            time.sleep(_resolve_retry_delay_seconds())
        except Exception:
            logger.exception("Unexpected job queue consumer error.")
            if once:
                raise


def _build_redis_client() -> redis.Redis:
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        return redis.from_url(redis_url, decode_responses=True)

    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    return redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)


def _dispatch_payload(raw_payload: str) -> None:
    payload = _parse_payload(raw_payload)
    if payload is None:
        return

    job_id = payload.get("jobId") or payload.get("job_id")
    if job_id is not None and not is_backend_job_valid(job_id):
        logger.info(
            "Backend job payload skipped because job is no longer valid: jobId=%s",
            job_id,
        )
        return

    task = celery_app.send_task(PROCESS_JOB_TASK_NAME, args=[payload])
    logger.info(
        "Backend job payload dispatched: jobId=%s celeryTaskId=%s",
        job_id,
        task.id,
    )


def _parse_payload(raw_payload: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError:
        logger.error("Invalid backend job payload skipped: %s", raw_payload)
        return None

    if not isinstance(payload, dict):
        logger.error("Backend job payload must be a JSON object: %s", raw_payload)
        return None

    return payload


def _resolve_retry_delay_seconds() -> float:
    return float(
        os.getenv(
            "BACKEND_JOB_QUEUE_RETRY_DELAY_SECONDS",
            str(DEFAULT_RETRY_DELAY_SECONDS),
        )
    )


if __name__ == "__main__":
    main()

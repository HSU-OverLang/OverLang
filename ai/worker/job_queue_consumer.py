from __future__ import annotations

import argparse
import json
import logging
import os
import time
from typing import Any

import redis
from dotenv import load_dotenv

from ai.api.schemas import CallbackPayload, CurrentStage, ErrorCode, JobStatus
from ai.pipeline.callback_client import is_backend_job_valid, send_callback
from ai.worker.celery_app import celery_app

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_QUEUE_KEY = "job-queue"
DEFAULT_BLOCK_TIMEOUT_SECONDS = 5
DEFAULT_RETRY_DELAY_SECONDS = 3.0
DEFAULT_IDLE_WAIT_SECONDS = 2.0
PROCESS_JOB_TASK_NAME = "ai.worker.tasks.process_job_task"
ACTIVE_JOB_LOCK_PATTERN = "overlang:job-lock:*"
CELERY_QUEUE_KEY = "celery"


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
            if _should_wait_for_idle_worker(redis_client):
                if _fail_job_when_worker_busy():
                    queued_item = redis_client.blpop(
                        queue_key,
                        timeout=block_timeout_seconds,
                    )
                    if queued_item is None:
                        if once:
                            logger.info(
                                "No payload received before timeout: queueKey=%s",
                                queue_key,
                            )
                            return
                        continue

                    _, raw_payload = queued_item
                    _fail_payload_because_worker_is_busy(raw_payload)
                    if once:
                        return
                    continue

                time.sleep(_resolve_idle_wait_seconds())
                continue

            queued_item = redis_client.blpop(queue_key, timeout=block_timeout_seconds)
            if queued_item is None:
                if once:
                    logger.info(
                        "No payload received before timeout: queueKey=%s",
                        queue_key,
                    )
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


def _should_wait_for_idle_worker(redis_client: redis.Redis) -> bool:
    if not _require_idle_worker_before_dispatch():
        return False

    if redis_client.llen(CELERY_QUEUE_KEY) > 0:
        return True

    active_lock = next(
        redis_client.scan_iter(match=ACTIVE_JOB_LOCK_PATTERN, count=1),
        None,
    )
    return active_lock is not None


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


def _fail_payload_because_worker_is_busy(raw_payload: str) -> None:
    payload = _parse_payload(raw_payload)
    if payload is None:
        return

    job_id = payload.get("jobId") or payload.get("job_id")
    if job_id is None:
        logger.warning("Backend job payload has no jobId and cannot be failed.")
        return

    if not is_backend_job_valid(job_id):
        logger.info(
            "Busy job failure skipped because job is no longer valid: jobId=%s",
            job_id,
        )
        return

    send_callback(
        CallbackPayload(
            job_id=job_id,
            status=JobStatus.FAILED,
            progress=0,
            current_stage=CurrentStage.QUEUED,
            segments=[],
            ocr_items=[],
            learning_data=None,
            error_code=ErrorCode.UNKNOWN_ERROR.value,
            error_message="AI worker is busy. The job was not started.",
        )
    )
    logger.warning(
        "Backend job failed because worker is busy: jobId=%s",
        job_id,
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


def _resolve_idle_wait_seconds() -> float:
    return float(
        os.getenv(
            "BACKEND_JOB_DISPATCH_IDLE_WAIT_SECONDS",
            str(DEFAULT_IDLE_WAIT_SECONDS),
        )
    )


def _require_idle_worker_before_dispatch() -> bool:
    value = os.getenv("BACKEND_JOB_DISPATCH_REQUIRE_IDLE_WORKER", "true")
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _fail_job_when_worker_busy() -> bool:
    value = os.getenv("BACKEND_JOB_FAIL_WHEN_WORKER_BUSY", "false")
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


if __name__ == "__main__":
    main()

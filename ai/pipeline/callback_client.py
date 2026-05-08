from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request

from ai.api.schemas import CallbackPayload

logger = logging.getLogger(__name__)


def send_callback(payload: CallbackPayload) -> None:
    base_url = os.getenv("BACKEND_INTERNAL_BASE_URL")
    worker_secret = os.getenv("WORKER_SECRET")
    callback_strict = os.getenv("CALLBACK_STRICT", "false").lower() == "true"
    retry_count = int(os.getenv("CALLBACK_RETRY_COUNT", "3"))
    retry_delay_seconds = float(os.getenv("CALLBACK_RETRY_DELAY_SECONDS", "1.0"))

    if not base_url:
        logger.info(
            "Callback skipped because BACKEND_INTERNAL_BASE_URL is not configured "
            "(jobId=%s status=%s)",
            payload.job_id,
            payload.status,
        )
        return

    if not worker_secret:
        logger.warning(
            "Callback skipped because WORKER_SECRET is not configured "
            "(jobId=%s status=%s)",
            payload.job_id,
            payload.status,
        )
        return

    callback_url = (
        f"{base_url.rstrip('/')}/api/v1/internal/jobs/{payload.job_id}/callback"
    )
    callback_body = payload.model_dump(by_alias=True)
    request = urllib.request.Request(
        callback_url,
        data=json.dumps(callback_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Worker-Secret": worker_secret,
        },
        method="POST",
    )

    last_error = None
    for attempt in range(1, retry_count + 1):
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                logger.info(
                    "Callback sent: jobId=%s status=%s stage=%s httpStatus=%s "
                    "attempt=%s/%s",
                    payload.job_id,
                    payload.status,
                    payload.current_stage,
                    response.status,
                    attempt,
                    retry_count,
                )
                return
        except urllib.error.HTTPError as error:
            error_body = error.read().decode("utf-8", errors="replace")
            last_error = error
            logger.warning(
                "Callback HTTP error: jobId=%s status=%s httpStatus=%s "
                "attempt=%s/%s body=%s",
                payload.job_id,
                payload.status,
                error.code,
                attempt,
                retry_count,
                error_body,
            )
            if attempt == retry_count:
                break
            time.sleep(retry_delay_seconds)
        except urllib.error.URLError as error:
            last_error = error
            logger.warning(
                "Callback request error: jobId=%s status=%s attempt=%s/%s error=%s",
                payload.job_id,
                payload.status,
                attempt,
                retry_count,
                error,
            )
            if attempt == retry_count:
                break
            time.sleep(retry_delay_seconds)

    if callback_strict:
        raise RuntimeError(f"Callback request failed: {last_error}") from last_error

    logger.warning("Callback request skipped after retries: %s", last_error)

from __future__ import annotations

import argparse

from ai.api.schemas import CallbackPayload, CurrentStage, JobStatus
from ai.pipeline.callback_client import send_callback


def main() -> None:
    parser = argparse.ArgumentParser(description="Send a sample AI callback payload")
    parser.add_argument("--job-id", type=str, default="1", help="Backend job id")
    parser.add_argument(
        "--status",
        type=str,
        default=JobStatus.RUNNING.value,
        choices=[status.value for status in JobStatus],
        help="Callback job status",
    )
    parser.add_argument(
        "--stage",
        type=str,
        default=CurrentStage.OCR_TEXT_DETECTION.value,
        choices=[stage.value for stage in CurrentStage],
        help="Callback current stage",
    )
    parser.add_argument("--progress", type=float, default=55.0, help="Progress percent")

    args = parser.parse_args()
    send_callback(
        CallbackPayload(
            job_id=args.job_id,
            status=JobStatus(args.status),
            progress=args.progress,
            current_stage=CurrentStage(args.stage),
            segments=[],
            ocr_items=[],
            learning_data=None,
            error_code=None,
            error_message=None,
        )
    )


if __name__ == "__main__":
    main()

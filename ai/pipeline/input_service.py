from __future__ import annotations

import shutil
import urllib.parse
import urllib.request
from pathlib import Path

from ai.api.schemas import AnalysisRequest, SourceType, WorkerJobPayload


def resolve_input_source(
    job: AnalysisRequest | WorkerJobPayload,
    video_dir: Path,
    timeout_seconds: int = 60,
) -> Path:
    video_dir.mkdir(parents=True, exist_ok=True)

    if isinstance(job, AnalysisRequest):
        return _resolve_analysis_request(job)

    if job.source_type == SourceType.YOUTUBE:
        raise NotImplementedError(
            "YOUTUBE source resolution will be implemented after input_service skeleton."
        )

    if not job.presigned_url:
        raise ValueError("presignedUrl is required when sourceType is UPLOAD")

    if job.presigned_url.startswith("file://"):
        return Path(job.presigned_url.removeprefix("file://"))

    local_path = Path(job.presigned_url)
    if local_path.exists():
        return local_path

    parsed_url = urllib.parse.urlparse(job.presigned_url)
    if parsed_url.scheme not in {"http", "https"}:
        raise ValueError(f"Unsupported input scheme: {parsed_url.scheme}")

    target_name = _resolve_target_filename(job.file_key, parsed_url.path)
    target_path = video_dir / target_name

    with urllib.request.urlopen(job.presigned_url, timeout=timeout_seconds) as response:
        with target_path.open("wb") as file:
            shutil.copyfileobj(response, file)

    return target_path


def _resolve_analysis_request(job: AnalysisRequest) -> Path:
    if job.source_type != SourceType.UPLOAD or not job.file_url:
        raise ValueError("The current analyze API only supports UPLOAD fileUrl input")

    if job.file_url.startswith("file://"):
        return Path(job.file_url.removeprefix("file://"))

    local_path = Path(job.file_url)
    if local_path.exists():
        return local_path

    raise NotImplementedError(
        "Remote fileUrl handling for AnalysisRequest will be implemented after the worker flow."
    )


def _resolve_target_filename(file_key: str | None, url_path: str) -> str:
    if file_key:
        return Path(file_key).name

    url_name = Path(url_path).name
    if url_name:
        return url_name

    return "source.bin"

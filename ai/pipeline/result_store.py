from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

BASE_TEMP_DIR = Path(tempfile.gettempdir()) / "overlang"
JOB_SUBDIRECTORIES = ("video", "audio", "frames", "result")


def get_job_dir(job_id: str | int) -> Path:
    return BASE_TEMP_DIR / str(job_id)


def ensure_job_dirs(job_id: str | int) -> dict[str, Path]:
    job_dir = get_job_dir(job_id)
    directories = {"root": job_dir}

    for directory_name in JOB_SUBDIRECTORIES:
        directory_path = job_dir / directory_name
        directory_path.mkdir(parents=True, exist_ok=True)
        directories[directory_name] = directory_path

    return directories


def save_result(job_id: str | int, result: dict[str, Any]) -> Path:
    directories = ensure_job_dirs(job_id)
    output_path = directories["result"] / "analysis_result.json"
    _write_json(output_path, result)
    return output_path


def save_intermediate(job_id: str | int, stage: str, data: dict[str, Any] | list[Any]) -> Path:
    directories = ensure_job_dirs(job_id)
    safe_stage_name = stage.strip().replace(" ", "_").lower()
    output_path = directories["result"] / f"{safe_stage_name}.json"
    _write_json(output_path, data)
    return output_path


def cleanup(job_id: str | int, keep_result_files: bool = True) -> None:
    job_dir = get_job_dir(job_id)
    if not job_dir.exists():
        return

    if not keep_result_files:
        shutil.rmtree(job_dir, ignore_errors=True)
        return

    for directory_name in ("video", "audio", "frames"):
        shutil.rmtree(job_dir / directory_name, ignore_errors=True)


def _write_json(path: Path, data: dict[str, Any] | list[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)

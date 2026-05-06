from __future__ import annotations

import os
from pathlib import Path
from typing import Any


DEFAULT_YOUTUBE_MAX_DURATION_SECONDS = 60 * 60


class YoutubeDownloadError(RuntimeError):
    pass


class YoutubeVideoTooLongError(RuntimeError):
    pass


def download_youtube_video(
    source_url: str,
    output_dir: str | Path,
    max_duration_seconds: int | None = None,
) -> Path:
    try:
        import yt_dlp
    except ImportError as error:
        raise YoutubeDownloadError(
            "yt-dlp is not installed. Rebuild the AI Docker image after "
            "updating requirements."
        ) from error

    destination_dir = Path(output_dir)
    destination_dir.mkdir(parents=True, exist_ok=True)
    duration_limit = _resolve_max_duration_seconds(max_duration_seconds)
    output_template = str(destination_dir / "youtube_%(id)s.%(ext)s")

    options = {
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            info = downloader.extract_info(source_url, download=False)
            _validate_video_duration(info, duration_limit)
            downloaded_info = downloader.extract_info(source_url, download=True)
    except YoutubeVideoTooLongError:
        raise
    except Exception as error:
        raise YoutubeDownloadError(f"YouTube download failed: {error}") from error

    downloaded_path = _resolve_downloaded_path(
        destination_dir,
        downloaded_info,
    )
    if not downloaded_path.exists():
        raise YoutubeDownloadError(
            f"YouTube download finished but output file was not found: {downloaded_path}"
        )

    return downloaded_path


def _resolve_max_duration_seconds(max_duration_seconds: int | None) -> int:
    if max_duration_seconds is not None:
        return max_duration_seconds

    return int(
        os.getenv(
            "YOUTUBE_MAX_DURATION_SECONDS",
            str(DEFAULT_YOUTUBE_MAX_DURATION_SECONDS),
        )
    )


def _validate_video_duration(
    video_info: dict[str, Any] | None,
    max_duration_seconds: int,
) -> None:
    duration = (video_info or {}).get("duration")
    if duration is None:
        return

    if float(duration) > max_duration_seconds:
        raise YoutubeVideoTooLongError(
            "YouTube video is too long: "
            f"{float(duration):.0f}s exceeds {max_duration_seconds}s"
        )


def _resolve_downloaded_path(
    destination_dir: Path,
    downloaded_info: dict[str, Any] | None,
) -> Path:
    downloaded_files = sorted(
        destination_dir.glob("youtube_*"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for downloaded_file in downloaded_files:
        if downloaded_file.suffix.lower() == ".mp4":
            return downloaded_file

    if downloaded_files:
        return downloaded_files[0]

    requested_downloads = (downloaded_info or {}).get("requested_downloads") or []
    for download in requested_downloads:
        filepath = download.get("filepath")
        if filepath:
            return Path(filepath)

    filepath = (downloaded_info or {}).get("filepath")
    if filepath:
        return Path(filepath)

    return destination_dir / "youtube_source.mp4"

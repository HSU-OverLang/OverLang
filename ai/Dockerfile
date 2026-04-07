# CUDA 12.1 Runtime Base Image
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    git ffmpeg curl python3 python3-venv python3-dev python3-pip pkg-config \
    libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev \
    libswscale-dev libswresample-dev libavfilter-dev \
    && rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/bin/python3 /usr/bin/python
RUN python3 -m pip install --upgrade pip

WORKDIR /app
COPY requirements.txt .

# 1. 빌드 도구 고정
RUN pip install "cython<3.0" "setuptools<70.0.0"

# 2. PyTorch 설치
RUN pip install --no-cache-dir \
    torch==2.1.2+cu121 \
    torchaudio==2.1.2+cu121 \
    --index-url https://download.pytorch.org/whl/cu121

# 3. 핵심 수정: 의존성 체인을 한 번에 해결
# av 바이너리를 먼저 깔고, faster-whisper 1.0.3이 요구하는 ctranslate2 4.x 버전을 설치합니다.
RUN pip install --no-cache-dir --only-binary=:all: "av==12.3.0"
RUN pip install --no-cache-dir \
    "ctranslate2>=4.0,<5.0" \
    "faster-whisper==1.0.3"

# 4. WhisperX 설치
# 의존성 충돌을 피하기 위해 --no-deps를 사용하거나 
# 이미 설치된 패키지들과 호환되는지 확인하며 설치합니다.
RUN pip install --no-cache-dir \
    git+https://github.com/m-bain/whisperX.git

# 5. 나머지 의존성 설치
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /app
COPY . /app/ai
ENV PYTHONPATH=/app

EXPOSE 8000
CMD ["uvicorn", "ai.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
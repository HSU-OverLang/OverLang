# 🎬 OverLang - AI 영상 번역 및 학습 플랫폼

> 영상을 업로드하면 AI가 음성 자막과 화면 텍스트를 분석하고, 번역 결과를 편집 및 학습 데이터로 활용할 수 있는 웹 플랫폼입니다.

---

## 📋 프로젝트 소개

OverLang는 영상 기반 언어 학습을 돕기 위한 AI 분석 플랫폼입니다.
프론트엔드에서 영상을 업로드하고, 백엔드는 인증/프로젝트/작업/파일 업로드를 관리하며, AI 모듈은 STT, OCR, 번역 파이프라인을 비동기 작업으로 처리합니다.

### 주요 기능

- 🎯 **AI 영상 분석**: STT, OCR, 번역, 학습 데이터 생성을 하나의 작업으로 처리
- 🔐 **Firebase 인증**: Firebase ID Token 기반 로그인 및 사용자 정보 조회
- 📁 **파일 업로드**: 영상 파일을 S3에 업로드하고 프로젝트 생성에 활용
- 🧩 **프로젝트/작업 관리**: 프로젝트별 AI 작업 생성, 목록 조회, 상태 조회
- 📝 **자막 편집 화면**: 분석 결과를 기반으로 자막과 OCR 텍스트를 편집하는 프론트엔드 UI
- 📚 **학습 기능 UI**: 단어장, 학습 노트, 마이페이지 등 학습 흐름을 위한 화면 구성

---

## 🏗️ 기술 스택

### Frontend

- **Framework**: React 19.2.0
- **Language**: TypeScript 5.9.3
- **Build Tool**: Vite 7.3.1
- **Styling**: Tailwind CSS 4.1.18
- **Routing**: React Router DOM 7.13.0
- **Auth**: Firebase Web SDK 12.9.0
- **Icons**: Lucide React 0.563.0
- **Utilities**: clsx, tailwind-merge

### Backend

- **Framework**: Spring Boot 3.5.10
- **Language**: Java 21
- **Database**: PostgreSQL
- **ORM**: Spring Data JPA (Hibernate)
- **Cache / Queue**: Redis
- **Auth**: Firebase Admin SDK + Custom Auth Interceptor
- **Storage**: AWS S3 SDK
- **API Docs**: SpringDoc OpenAPI
- **Build Tool**: Gradle
- **Formatter**: Spotless + Google Java Format

### AI

- **Language**: Python 3
- **Runtime**: CUDA 12.1 Docker image
- **AI Framework**: PyTorch 2.1.2 + CUDA 12.1
- **Speech Recognition**: WhisperX, Faster-Whisper 1.0.3
- **OCR**: EasyOCR, OpenCV
- **API**: FastAPI, Uvicorn
- **Worker**: Celery + Redis

### Infrastructure

- **Containerization**: Docker & Docker Compose
- **Database**: PostgreSQL 16
- **Cache / Broker**: Redis 7
- **Object Storage**: AWS S3

---

## 📁 프로젝트 구조

```text
OverLang/
├── frontend/                     # React 프론트엔드
│   ├── src/
│   │   ├── api/                  # API 클라이언트와 인증 요청
│   │   ├── app/
│   │   │   ├── pages/            # 페이지 컴포넌트
│   │   │   ├── providers/        # 전역 Provider
│   │   │   └── router.tsx        # 라우터 설정
│   │   ├── components/
│   │   │   ├── layout/           # 레이아웃 컴포넌트
│   │   │   └── ui/               # 공통 UI 컴포넌트
│   │   ├── hooks/                # 커스텀 훅
│   │   ├── lib/                  # Firebase 등 외부 설정
│   │   └── utils/                # 유틸 함수
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                      # Spring Boot 백엔드
│   ├── src/main/java/com/overlang/
│   │   ├── api/
│   │   │   ├── controller/       # REST 컨트롤러
│   │   │   └── dto/              # Request/Response DTO
│   │   ├── domain/               # 도메인 계층
│   │   │   ├── apikey/
│   │   │   ├── common/
│   │   │   ├── file/
│   │   │   ├── job/
│   │   │   ├── learning/
│   │   │   ├── member/
│   │   │   ├── ocr/
│   │   │   ├── project/
│   │   │   └── segment/
│   │   └── global/               # 인증, 설정, 예외, 공통 응답
│   ├── build.gradle
│   └── gradlew
│
├── ai/                           # AI API 및 Worker
│   ├── api/                      # FastAPI 라우터와 스키마
│   ├── ocr/                      # OCR 처리
│   ├── pipeline/                 # 영상/오디오/프레임 처리 파이프라인
│   ├── worker/                   # Celery 작업
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker-compose.yml            # Redis, PostgreSQL, AI 서비스 구성
└── README.md
```

---

## 🚀 시작하기

### 사전 요구사항

- **Node.js**: 22 이상 권장
- **Java**: 21
- **Python**: 3.10 이상 권장
- **Docker**: 최신 버전
- **NVIDIA GPU**: AI Docker 실행 시 필요
- **AWS S3 / Firebase**: 실제 업로드 및 인증 테스트 시 필요

### 설치 및 실행

#### 1️⃣ 저장소 클론

```bash
git clone https://github.com/your-org/OverLang.git
cd OverLang
```

#### 2️⃣ 환경 변수 설정

각 디렉터리의 `.env.example`을 복사해 `.env` 파일을 생성한 뒤, 실제 값은 로컬 `.env`에만 입력합니다.

**Frontend (`/frontend/.env`)**

```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_VIDEO_UPLOAD_MAX_SIZE=500

# Firebase Web SDK
VITE_FIREBASE_API_KEY=your_firebase_web_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

**Backend (`/backend/.env`)**

```env
# Database (PostgreSQL)
DB_URL=jdbc:postgresql://localhost:5432/overlang
DB_USERNAME=your_username
DB_PASSWORD=your_password

# Firebase Admin SDK
# 서비스 계정 JSON 파일은 backend/src/main/resources/ 아래에 둡니다.
FIREBASE_SERVICE_ACCOUNT_PATH=classpath:your-firebase-admin.json

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
```

**AI (`/ai/.env`)**

```env
CUDA_VISIBLE_DEVICES=0

# Redis (Local: localhost, Docker: redis)
REDIS_HOST=localhost
REDIS_PORT=6379

# Internal callback
BACKEND_INTERNAL_BASE_URL=http://host.docker.internal:8080
WORKER_SECRET=replace_with_strong_worker_secret
CALLBACK_STRICT=false
CALLBACK_RETRY_COUNT=3
CALLBACK_RETRY_DELAY_SECONDS=1.0

# Backend Redis queue consumer
BACKEND_JOB_QUEUE_KEY=job-queue
BACKEND_JOB_QUEUE_BLOCK_TIMEOUT_SECONDS=5
BACKEND_JOB_QUEUE_RETRY_DELAY_SECONDS=3.0

# Default runtime options for backend-created worker jobs
AI_DEFAULT_MODEL=small
AI_DEFAULT_BATCH_SIZE=2
AI_DEFAULT_COMPUTE_TYPE=int8_float16
AI_DEFAULT_NO_ALIGN=true
AI_DEFAULT_FRAME_INTERVAL=3.0
AI_DEFAULT_OCR_GPU=true
```

> ⚠️ **보안 주의**: 실제 API 키, Firebase 설정, DB 비밀번호, worker secret은 `.env`에만 저장하고 `.env.example`이나 README에는 커밋하지 않습니다.

#### 3️⃣ 로컬 개발 서버 실행

**Frontend 개발 서버**

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

**Backend 개발 서버**

```bash
cd backend
./gradlew bootRun
# http://localhost:8080
```

**AI API 실행**

```bash
cd ai

python -m venv venv

# Windows
.\venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
uvicorn ai.api.app:app --reload --host 0.0.0.0 --port 8000
```

> 전체 AI 파이프라인은 PyTorch, Faster-Whisper, WhisperX까지 필요합니다. 로컬 설치 대신 `ai/Dockerfile` 기반 Docker 실행을 권장합니다.

- AI API 문서: [http://localhost:8000/docs](http://localhost:8000/docs)
- AI 상태 조회: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

**Celery Worker 실행**

```bash
# Windows에서는 pool=solo 옵션을 사용합니다.
celery -A ai.worker.celery_app worker --loglevel=info --pool=solo
```

**Backend Job Queue Consumer 실행**

Backend는 Redis list `job-queue`에 AI 작업 payload를 저장합니다.
AI가 Backend 작업을 자동으로 처리하려면 Celery worker와 별도로 queue consumer를 실행해야 합니다.

```bash
python -m ai.worker.job_queue_consumer
```

#### 4️⃣ Docker 실행

**Redis + PostgreSQL 실행**

```bash
docker-compose up -d redis postgres
```

**AI 포함 실행 (GPU 환경)**

```bash
docker-compose --profile gpu-only up -d --build
```

**로그 확인 및 중지**

```bash
docker-compose logs -f
docker-compose down
```

---

## 🧪 검증

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

### Backend

```bash
cd backend
./gradlew spotlessCheck
./gradlew test
```

### AI

```bash
cd ai
uvicorn ai.api.app:app --reload --host 0.0.0.0 --port 8000
celery -A ai.worker.celery_app worker --loglevel=info --pool=solo
```

FastAPI 작업 요청 예시:

```powershell
$body = @{
    sourceType = "UPLOAD"
    fileUrl = "file:///absolute/path/to/sample.mp4"
    jobType = "FULL_ANALYSIS"
    sourceLanguage = "en"
    targetLanguage = "ko"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/analyze" -ContentType "application/json" -Body $body
```

---

## 📝 개발 가이드

### Git Workflow

이 프로젝트는 **GitHub Flow**를 따릅니다.

1. **브랜치 생성**

   ```bash
   git checkout -b fe/upload
   git checkout -b be/project-api
   git checkout -b ai/pipeline
   git checkout -b doc/readme
   ```

2. **커밋 메시지 규칙**

   ```bash
   git commit -m "feat: 영상 업로드 API 연동"
   git commit -m "fix: Firebase 로그인 오류 수정"
   git commit -m "doc: 환경 변수 문서 정리"
   ```

3. **Pull Request**
   - `main` 브랜치로 PR 생성
   - 리뷰 후 Squash Merge 방식 사용

### 브랜치 네이밍

| 타입                 | 형식          | 예시                   |
| -------------------- | ------------- | ---------------------- |
| 프론트엔드           | `fe/기능명`   | `fe/upload`            |
| 백엔드               | `be/기능명`   | `be/auth`              |
| AI                   | `ai/기능명`   | `ai/ocr-pipeline`      |
| 문서                 | `doc/내용`    | `doc/readme`           |

### 커밋 타입

| 타입       | 설명                                      |
| ---------- | ----------------------------------------- |
| `feat`     | 새로운 기능 추가 또는 기존 기능 개선      |
| `fix`      | 버그 수정                                 |
| `refactor` | 기능 변화 없는 구조 개선                  |
| `doc`      | README, API 문서 등 문서 수정             |
| `test`     | 테스트 코드 추가 또는 수정                |
| `chore`    | 환경 설정, 빌드, 패키지 관련 작업         |
| `design`   | UI/UX 스타일 작업                         |
| `style`    | 포맷팅 등 기능 변화 없는 코드 스타일 수정 |
| `comment`  | 주석 수정 또는 추가                       |

### 코드 스타일

**Frontend**

```bash
cd frontend
npm run lint
npm run format
```

**Backend**

```bash
cd backend
./gradlew spotlessApply
```

**AI**

```bash
cd ai
python -m compileall .
```

---

## 🔌 API 명세

서버 실행 후 브라우저에서 아래 주소로 접속하면 API 문서를 확인할 수 있습니다.

- **Backend Swagger UI**: [http://localhost:8080/swagger-ui/index.html](http://localhost:8080/swagger-ui/index.html)
- **AI FastAPI Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### 공통 응답 형식

Backend API는 다음 응답 형식을 사용합니다.

**성공 응답**

```json
{
  "status": "SUCCESS",
  "data": {
    "id": 1,
    "name": "example"
  },
  "error": null
}
```

**에러 응답**

```json
{
  "status": "ERROR",
  "data": null,
  "error": {
    "code": "AUTH_001",
    "message": "Invalid token"
  }
}
```

### Backend 주요 엔드포인트

| 메서드 | 엔드포인트                         | 설명                                  |
| ------ | ---------------------------------- | ------------------------------------- |
| POST   | `/api/v1/auth/firebase`            | Firebase 토큰 검증 및 로그인/회원가입 |
| GET    | `/api/v1/auth/me`                  | 현재 로그인한 사용자 정보 조회        |
| GET    | `/api/v1/health`                   | 서버 및 DB 상태 체크                  |
| POST   | `/api/v1/files/upload`             | 영상 파일 S3 업로드                   |
| POST   | `/api/v1/projects`                 | 프로젝트 생성                         |
| GET    | `/api/v1/projects`                 | 프로젝트 목록 조회                    |
| GET    | `/api/v1/projects/{projectId}`     | 프로젝트 상세 조회                    |
| POST   | `/api/v1/projects/{projectId}/jobs` | 프로젝트 AI 작업 생성                 |
| GET    | `/api/v1/projects/{projectId}/jobs` | 프로젝트 AI 작업 목록 조회            |
| GET    | `/api/v1/jobs/{jobId}`             | AI 작업 상태 조회                     |

### AI 주요 엔드포인트

| 메서드 | 엔드포인트               | 설명                       |
| ------ | ------------------------ | -------------------------- |
| GET    | `/`                      | AI 서버 기본 상태 확인     |
| GET    | `/api/v1/health`         | AI API 상태 확인           |
| POST   | `/api/v1/analyze`        | AI 분석 작업 등록          |
| GET    | `/api/v1/status/{jobId}` | AI 분석 작업 상태 조회     |

### AI 에러 코드

| 코드         | 설명                  |
| ------------ | --------------------- |
| `WORKER_001` | GPU Out of Memory     |
| `WORKER_002` | FFmpeg 처리 실패      |
| `WORKER_003` | LLM 토큰 제한 초과    |
| `WORKER_004` | OCR 엔진 실패         |
| `WORKER_005` | 모델 로드 실패        |
| `WORKER_006` | 영상 길이 제한 초과   |
| `WORKER_007` | 잘못된 옵션           |
| `WORKER_008` | 인증 실패             |
| `WORKER_009` | 작업 타임아웃         |
| `WORKER_010` | 다운로드 실패         |
| `WORKER_999` | 알 수 없는 오류       |

---

## 🐳 Docker 구성

### 서비스 목록

| 서비스     | 포트 | 설명                         |
| ---------- | ---- | ---------------------------- |
| PostgreSQL | 5432 | 백엔드 데이터베이스          |
| Redis      | 6379 | AI 작업 브로커 및 캐시       |
| AI         | 8000 | FastAPI 분석 API             |
| AI Worker  | -    | Celery 기반 비동기 분석 작업 |

### GPU 사용 설정

AI 컨테이너는 Docker Compose profile로 GPU 환경에서 실행합니다.

```bash
docker-compose --profile gpu-only up -d --build
```

**사전 요구사항**: NVIDIA Driver, NVIDIA Container Toolkit 설치

---

## 👥 팀 구성

| 역할     | 주요 기술                    |
| -------- | ---------------------------- |
| Frontend | React, TypeScript, Tailwind  |
| Backend  | Spring Boot, JPA, PostgreSQL |
| AI       | Python, PyTorch, WhisperX    |

---

## 📄 라이센스

라이센스 파일이 추가되면 이 섹션에 배포 조건을 명시합니다.

---

## 🔗 관련 링크

- **React**: [https://react.dev](https://react.dev)
- **Vite**: [https://vite.dev](https://vite.dev)
- **Tailwind CSS**: [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **Spring Boot**: [https://spring.io/projects/spring-boot](https://spring.io/projects/spring-boot)
- **FastAPI**: [https://fastapi.tiangolo.com](https://fastapi.tiangolo.com)
- **WhisperX**: [https://github.com/m-bain/whisperX](https://github.com/m-bain/whisperX)

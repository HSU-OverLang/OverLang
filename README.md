# 🎬 OverLang - AI 영상 번역 및 학습 플랫폼

> 영상을 업로드하면 AI가 음성 자막과 화면 텍스트를 분석하고, 번역 결과를 편집 및 학습 데이터로 활용할 수 있는 웹 플랫폼입니다.

---

## 📋 프로젝트 소개

OverLang은 영상 기반 언어 학습을 돕기 위한 AI 통합 분석 플랫폼입니다. YouTube URL 또는 직접 업로드한 영상을 입력하면, AI가 음성 인식(STT)과 화면 텍스트(OCR)를 동시에 추출하고 번역·분석하여 완성된 학습 경험을 제공합니다.

프론트엔드에서 영상을 업로드하면, 백엔드가 인증·프로젝트·작업·파일 업로드를 관리하고, AI 모듈이 STT → OCR → 번역 → LLM 분석 파이프라인을 Redis 큐 + Celery Worker 기반으로 비동기 처리합니다. 각 단계의 진행 상황은 실시간으로 프론트엔드에 표시됩니다.

### 주요 기능

- 🎯 **AI 영상 분석**: STT, OCR, 번역, 학습 데이터 생성을 하나의 파이프라인으로 처리 (최대 10단계)
- 🔐 **Firebase 인증**: Firebase ID Token 기반 이메일/비밀번호 및 Google OAuth 로그인
- 📁 **파일 업로드 / YouTube 연동**: 영상 파일 S3 업로드 또는 YouTube URL로 프로젝트 생성
- 🧩 **프로젝트 대시보드**: 프로젝트 목록 조회, 처리 상태 뱃지, 썸네일, 선택 삭제, 재처리 요청
- 📝 **번역 뷰어 (TranslatePage)**: 자막 목록 조회·편집, 단어 클릭/드래그 즉시 분석, OCR 오버레이, 구간 반복, 자막 저장
- 🔍 **단어 분석 패널**: 단어 뜻·관련 단어 AI 분석, 관용표현 감지(matchedExpression), TTS 발음 재생, 학습 노트 저장
- 📚 **AI 학습 콘텐츠**: 영상 요약, 빈출 단어 카드(설명 펼치기), 관용 표현 카드
- 🃏 **단어장 (StudyPage)**: 저장 단어 플래시카드(앞면: 단어 / 뒷면: 직역·실제 의미), AI 예문 생성, TTS 발음 듣기
- 👤 **마이페이지**: 학습 통계, 최근 시청 프로젝트, 프로필 설정

---

## 🏗️ 기술 스택

### Frontend

| 항목 | 버전 | 용도 |
|------|------|------|
| React | 19.2.0 | UI 프레임워크 |
| TypeScript | 5.9.3 | 타입 안전성 |
| Vite | 7.3.1 | 번들러 및 개발 서버 |
| Tailwind CSS | 4.1.18 | 유틸리티 기반 스타일링 |
| React Router DOM | 7.13.0 | 클라이언트 사이드 라우팅 |
| Firebase Web SDK | 12.9.0 | 인증 (Google OAuth + 이메일) |
| Lucide React | 0.563.0 | 아이콘 라이브러리 |
| clsx + tailwind-merge | — | 조건부 클래스 유틸리티 |

### 프론트엔드 페이지 구성

| 페이지 | 경로 | 설명 |
| ------ | ---- | ---- |
| HomePage | `/` | 랜딩 페이지, 플로팅 문자 애니메이션 |
| LoginPage | `/login` | Firebase 이메일 로그인 |
| RegisterPage | `/register` | 회원가입 |
| ForgotPasswordPage | `/forgot-password` | 비밀번호 재설정 |
| DashboardPage | `/dashboard` | 프로젝트 목록, 상태 뱃지, 선택 삭제 |
| UploadPage | `/upload` | 영상 업로드 / YouTube URL 입력 |
| ProcessingPage | `/processing/:jobId` | AI 처리 진행 상태 표시 |
| TranslatePage | `/translate/:projectId` | 자막 뷰어·편집, 단어 분석, OCR, 학습 콘텐츠 |
| StudyPage | `/study` | 저장 단어 플래시카드, AI 예문, TTS |
| WordsPage | `/words` | 저장 단어 전체 목록 |
| MyPage | `/mypage` | 학습 통계, 최근 시청, 프로필 설정 |

### Backend

| 항목 | 버전 / 내용 | 용도 |
|------|-------------|------|
| Spring Boot | 3.5.10 | API 서버 프레임워크 |
| Java | 21 | 런타임 |
| PostgreSQL | 16 | 주 데이터베이스 |
| Spring Data JPA | — | ORM (Hibernate) |
| Redis | 7 | 캐시 및 AI 작업 큐 |
| Firebase Admin SDK | 9.2.0 | 서버 사이드 토큰 검증 |
| AWS S3 SDK | 2.25.20 | 영상 파일 스토리지 |
| SpringDoc OpenAPI | 2.8.5 | Swagger UI 자동 생성 |
| Gradle | — | 빌드 도구 |
| Spotless + Google Java Format | — | 코드 포맷터 |
| Kuromoji (일본어) / Jieba (중국어) | — | 형태소 분석기 |

### AI

| 항목 | 버전 / 내용 | 용도 |
|------|-------------|------|
| Python | 3.10+ | 런타임 |
| PyTorch + CUDA | 2.1.2 + 12.1 | GPU 연산 |
| WhisperX + faster-whisper | — | 음성 인식 (STT) + 타임스탬프 정렬 |
| pyannote.audio | 3.1.1 | 화자 분리 (diarization) |
| EasyOCR + OpenCV | — | 화면 텍스트 추출 (OCR) |
| OpenAI GPT API | — | 번역 및 LLM 분석 |
| FastAPI + Uvicorn | 0.110+ | AI API 서버 |
| Celery + Redis | 5.3+ | 비동기 작업 큐 |
| yt-dlp | 2025.1.15+ | YouTube 영상 다운로드 |

### Infrastructure

| 항목 | 내용 |
|------|------|
| 컨테이너 | Docker & Docker Compose |
| GPU 지원 | NVIDIA Container Toolkit (docker compose profile: `gpu-only`) |
| 오브젝트 스토리지 | AWS S3 |

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

| 항목 | 버전 | 비고 |
|------|------|------|
| Node.js | 20 이상 | 프론트엔드 개발 |
| Java | 21 | 백엔드 개발 |
| Python | 3.10 이상 | AI 로컬 실행 시 |
| Docker + Docker Compose | 최신 | 전체 스택 실행 |
| NVIDIA GPU + Container Toolkit | — | AI 파이프라인 실행 시 필요 |
| Firebase 프로젝트 | — | 인증 (서비스 계정 JSON 필요) |
| AWS S3 버킷 | — | 영상 파일 업로드 |
| OpenAI API Key | — | 번역 및 LLM 분석 |

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

| 컨테이너 | 포트 | 설명 | 프로파일 |
|----------|------|------|----------|
| `overlang_backend` | 8080 | Spring Boot API 서버 | 기본 |
| `overlang_postgres` | 5432 | PostgreSQL 데이터베이스 | 기본 |
| `redis` | 6379 | Redis (큐 + 캐시) | 기본 |
| `overlang_ai` | 8000 | FastAPI AI 서버 | `gpu-only` |
| `overlang_ai_worker` | — | Celery 비동기 워커 | `gpu-only` |
| `overlang_ai_queue_consumer` | — | Redis 큐 컨슈머 | `gpu-only` |

### GPU 사용 설정

AI 컨테이너는 Docker Compose profile로 GPU 환경에서 실행합니다.

```bash
docker-compose --profile gpu-only up -d --build
```

**사전 요구사항**: NVIDIA Driver, NVIDIA Container Toolkit 설치

### 아키텍처 다이어그램

```
사용자 브라우저
      │
      │ HTTPS
      ▼
  Frontend (React + Vite)  :5173
      │
      │ REST API (Firebase ID Token)
      ▼
  Backend (Spring Boot)    :8080
      │                         │
      │ Redis LPUSH              │ HTTP Callback
      ▼                         │
  Job Queue (Redis)  :6379      │
      │                         │
      ▼                         │
  AI Queue Consumer             │
      │                         │
      ▼                         │
  Celery Worker                 │
      │                         │
      ▼                         │
  AI Pipeline                   │
  (WhisperX → EasyOCR →        │
   GPT 번역 → GPT 분석)         │
      │                         │
      └─────────────────────────┘
            결과 → PostgreSQL 저장
```

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

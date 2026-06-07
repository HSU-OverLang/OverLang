# OverLang

AI 기반 영상 번역 및 학습 지원 플랫폼입니다. 사용자가 영상 파일을 업로드하거나 YouTube URL을 입력하면, 음성은 STT로 자막화하고 화면 텍스트는 OCR로 추출한 뒤 번역합니다. 분석 결과는 영상 위 자막과 OCR 오버레이로 제공되며, 단어 저장, 단어 설명, 학습 콘텐츠 조회 기능을 통해 영상 시청과 언어 학습을 함께 지원합니다.

## 주요 기능

- 영상 파일 업로드 및 YouTube URL 기반 프로젝트 생성
- WhisperX 기반 STT 자막 생성 및 문장 단위 분리
- EasyOCR 기반 화면 텍스트 추출, 위치 기반 OCR 오버레이 생성
- OpenAI 기반 번역 및 학습 콘텐츠 생성
- 자막 번역문 수정 및 수정 후 단어 재생성
- 원문/번역문 단어 클릭, 단어 설명, 관련 단어 조회
- 저장 단어 목록, 학습 노트, 플래시카드
- 영상 요약, 핵심 단어, 관용 표현 학습 콘텐츠 조회

## 기술 스택


## 프로젝트 구조

```
OverLang/
├─ frontend/                 # React 클라이언트
│  ├─ src/api/               # API 클라이언트
│  ├─ src/app/pages/         # 라우트 페이지
│  ├─ src/components/        # 공통 UI 및 레이아웃
│  └─ vite.config.ts
│ 
├─ backend/                  # Spring Boot API 서버
│  ├─ src/main/java/com/overlang/api/
│  ├─ src/main/java/com/overlang/domain/
│  └─ src/main/resources/application.properties
│ 
├─ ai/                       # AI API 및 worker
│  ├─ api/                   # FastAPI 라우트 및 스키마
│  ├─ learning/              # 학습 콘텐츠 생성
│  ├─ ocr/                   # OCR 감지, 후처리, style 생성
│  ├─ pipeline/              # STT/OCR/번역 통합 파이프라인
│  ├─ translation/           # 번역 provider
│  └─ worker/                # Celery worker, Redis queue consumer
├─ docker-compose.yml
└─ README.md
```

## 페이지 구성

| 경로 | 페이지 | 설명 |
| --- | --- | --- |
| `/` | HomePage | 서비스 소개 및 랜딩 페이지 |
| `/login` | LoginPage | 로그인 |
| `/join` | RegisterPage | 회원가입 |
| `/forgot-password` | ForgotPasswordPage | 비밀번호 재설정 |
| `/dashboard` | DashboardPage | 프로젝트 목록, 상태 확인, 삭제 |
| `/upload` | UploadPage | 영상 파일 업로드 및 YouTube URL 입력 |
| `/processing` | ProcessingPage | AI 작업 진행 상태 조회 |
| `/translate/:projectId` | TranslatePage | 영상 재생, 자막/OCR 확인, 번역 수정, 단어 학습 |
| `/study` | StudyPage | 저장 단어 학습 및 플래시카드 |
| `/words` | WordsPage | 저장 단어 목록 |
| `/mypage` | MyPage | 사용자 정보 및 학습 통계 |

## 환경변수

### Frontend

```
VITE_API_BASE_URL=http://localhost:8080/api
VITE_VIDEO_UPLOAD_MAX_SIZE=500

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Railway 배포 FE는 Backend 배포 주소를 바라보도록 설정합니다.

```
VITE_API_BASE_URL=
```

### Backend

`backend/src/main/resources/application.properties`는 기본적으로 `.env` 값을 사용합니다.

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=overlang
DB_USERNAME=overlang
DB_PASSWORD=overlang1234

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

WORKER_SECRET=replace_with_strong_worker_secret
FIREBASE_SERVICE_ACCOUNT_PATH=classpath:overlang-firebase-admin.json
FIREBASE_SERVICE_ACCOUNT_JSON=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
OPENAI_API_KEY=
```

### AI

로컬 Docker Compose에서는 `REDIS_HOST=redis`를 사용하고, Railway Redis를 사용할 때는 `REDIS_URL`을 우선 사용합니다.

```
CUDA_VISIBLE_DEVICES=0

REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=

BACKEND_INTERNAL_BASE_URL=http://host.docker.internal:8080
WORKER_SECRET=replace_with_strong_worker_secret

BACKEND_JOB_QUEUE_KEY=job-queue
BACKEND_JOB_VALIDATION_INTERVAL_SECONDS=5.0
BACKEND_JOB_LOCK_TTL_SECONDS=21600
BACKEND_JOB_DISPATCH_REQUIRE_IDLE_WORKER=true
BACKEND_JOB_DISPATCH_IDLE_WAIT_SECONDS=2.0
BACKEND_JOB_FAIL_WHEN_WORKER_BUSY=false

AI_DEFAULT_MODEL=small
AI_DEFAULT_BATCH_SIZE=2
AI_DEFAULT_COMPUTE_TYPE=int8_float16
AI_DEFAULT_FRAME_INTERVAL=0.5

AI_OCR_TRACKING_ENABLED=true
AI_OCR_REGIONS=full
AI_OCR_SKIP_UNCHANGED_FRAMES=true
AI_OCR_REFINE_ENABLED=false

OPENAI_API_KEY=
OPENAI_TRANSLATION_MODEL=gpt-5.4-mini
OPENAI_LEARNING_MODEL=gpt-5.4-mini
```

AI worker를 Railway Backend와 연동할 경우:

```
BACKEND_INTERNAL_BASE_URL=
REDIS_URL=redis://default:<password>@<host>:<port>
WORKER_SECRET=<backend와 동일한 값>
```

## 로컬 실행

### 1. Docker로 Backend, Redis, PostgreSQL 실행

Backend도 `docker-compose.yml`에 포함되어 있으므로 Docker로 실행할 수 있습니다.

```powershell
cd OverLang
docker compose up -d --build backend redis postgres
```

Backend 기본 주소:

- API: `http://localhost:8080`
- Swagger: `http://localhost:8080/swagger-ui/index.html`
- Health: `http://localhost:8080/api/v1/health`

Backend 로그 확인:

```powershell
docker logs -f overlang_backend
```

### 2. Backend를 Gradle로 직접 실행하는 경우

Docker로 Redis와 PostgreSQL만 실행하고 Backend를 IDE 또는 Gradle로 직접 실행할 수도 있습니다.

```powershell
cd OverLang
docker compose up -d redis postgres

cd backend
.\\gradlew bootRun
```

### 3. Frontend 실행

```powershell
cd frontend
npm install
npm run dev
```

Frontend 기본 주소:

- `http://localhost:5173`

### 4. AI 실행

GPU Docker 환경을 권장합니다.

```powershell
cd OverLang
docker compose --profile gpu-only up -d --build ai ai-worker ai-queue-consumer
```

AI API:

- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/v1/health`

로그 확인:

```powershell
docker logs -f overlang_ai
docker logs -f overlang_ai_worker
docker logs -f overlang_ai_queue_consumer
```

재시작:

```powershell
docker compose --profile gpu-only restart ai ai-worker ai-queue-consumer
```

## AI 작업 흐름

```
Frontend
  ↓ REST API
Backend
  ↓ Redis LPUSH job-queue
AI queue consumer
  ↓ Celery task dispatch
AI worker
  ↓ STT / OCR / Translation / Learning
Backend internal callback
  ↓
PostgreSQL 저장
  ↓
Frontend 결과 조회
```

## 주요 Backend API

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `POST` | `/api/v1/auth/firebase` | Firebase 로그인/회원가입 |
| `GET` | `/api/v1/auth/me` | 현재 사용자 조회 |
| `POST` | `/api/v1/files/upload` | 영상 파일 S3 업로드 |
| `POST` | `/api/v1/projects` | 프로젝트 생성 |
| `GET` | `/api/v1/projects` | 프로젝트 목록 조회 |
| `GET` | `/api/v1/projects/{projectId}` | 프로젝트 상세 조회 |
| `PATCH` | `/api/v1/projects/{projectId}` | 프로젝트 제목 수정 |
| `DELETE` | `/api/v1/projects/{projectId}` | 프로젝트 삭제 |
| `GET` | `/api/v1/projects/{projectId}/video-url` | 영상 presigned URL 조회 |
| `PATCH` | `/api/v1/projects/{projectId}/results` | 번역문 수정 |
| `POST` | `/api/v1/projects/{projectId}/jobs` | AI 작업 생성 |
| `GET` | `/api/v1/projects/{projectId}/jobs` | 프로젝트 작업 목록 조회 |
| `GET` | `/api/v1/jobs/{jobId}` | 작업 상태 조회 |
| `POST` | `/api/v1/projects/{projectId}/jobs/retry` | 재처리 요청 |
| `GET` | `/api/v1/jobs/{jobId}/segments` | STT 세그먼트 조회 |
| `GET` | `/api/v1/jobs/{jobId}/ocr-items` | OCR 결과 조회 |
| `GET` | `/api/v1/jobs/{jobId}/learning-contents` | 학습 콘텐츠 조회 |
| `POST` | `/api/v1/words/explain` | 클릭 단어 설명 |
| `POST` | `/api/v1/saved-words` | 단어 저장 |
| `GET` | `/api/v1/me/saved-words` | 저장 단어 목록 |
| `DELETE` | `/api/v1/saved-words/{savedWordId}` | 저장 단어 삭제 |
| `POST` | `/api/v1/me/saved-words/{savedWordId}/examples` | 저장 단어 예문 생성 |

Backend 내부 callback API:

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `GET` | `/api/v1/internal/jobs/{jobId}/valid` | AI worker가 job 삭제 여부 확인 |
| `POST` | `/api/v1/internal/jobs/{jobId}/callback` | AI worker 결과 및 상태 callback |

## AI 처리 단계

| Stage | 설명 |
| --- | --- |
| `QUEUED` | 작업 대기 |
| `AUDIO_EXTRACTION` | 오디오 추출 |
| `STT_TRANSCRIPTION` | WhisperX 음성 인식 |
| `WHISPER_ALIGNMENT` | 단어 단위 timestamp 정렬 |
| `OCR_FRAME_EXTRACTION` | OCR 프레임 추출 |
| `OCR_TEXT_DETECTION` | OCR 텍스트 감지 및 후처리 |
| `TRANSLATION` | 자막/OCR 번역 |
| `LLM_ANALYSIS` | 학습 콘텐츠 생성 |
| `MERGING_RESULTS` | 결과 병합 |
| `FINALIZING` | 최종 callback |

## AI 오류 코드

| 코드 | 의미 |
| --- | --- |
| `WORKER_001` | GPU Out of Memory |
| `WORKER_002` | FFmpeg 처리 실패 |
| `WORKER_003` | LLM 토큰 제한 초과 |
| `WORKER_004` | OCR 엔진 실패 |
| `WORKER_005` | 모델 로드 실패 |
| `WORKER_006` | 영상 길이 제한 초과 |
| `WORKER_007` | 잘못된 옵션 |
| `WORKER_008` | 인증 실패 |
| `WORKER_009` | 작업 timeout |
| `WORKER_010` | 다운로드 실패 |
| `WORKER_999` | 알 수 없는 오류 |

## 참고 문서

- Backend Swagger UI: `http://localhost:8080/swagger-ui/index.html`
- AI FastAPI Docs: `http://localhost:8000/docs`

## 관련 링크

- **React**: https://react.dev
- **Vite**: https://vite.dev
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Spring Boot**: https://spring.io/projects/spring-boot
- **FastAPI**: https://fastapi.tiangolo.com
- **WhisperX**: https://github.com/m-bain/whisperX
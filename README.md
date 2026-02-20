# 🎬 AI 자막 생성 및 편집 플랫폼

> 영상을 업로드하면 AI가 자동으로 자막을 생성하고, 직관적인 에디터로 편집 및 번역까지 한 번에!

---

## 📋 프로젝트 소개

AI 기반 자막 자동 생성 및 실시간 편집이 가능한 웹 플랫폼입니다.
WhisperX를 활용하여 높은 정확도의 음성 인식을 제공하며, 타임라인 기반 비주얼 에디터로 자막 편집 작업을 간편하게 수행할 수 있습니다.

### 주요 기능

- 🎯 **AI 자동 자막 생성**: WhisperX 모델을 사용한 고정밀 음성 인식
- ✏️ **실시간 자막 편집**: 비디오 플레이어와 동기화된 타임라인 에디터
- 🌐 **다국어 번역**: 자막 자동 번역 기능 지원
- 💾 **다양한 포맷 지원**: SRT, VTT 등 주요 자막 포맷 내보내기
- 🎨 **직관적인 UI/UX**: React 기반의 반응형 웹 인터페이스

---

## 🏗️ 기술 스택

### Frontend

- **Framework**: React 19.2.4
- **Language**: TypeScript 5.9.3
- **Build Tool**: Vite 7.3.1
- **Styling**: Tailwind CSS 4.1.18
- **Routing**: React Router DOM 7.13.0
- **Video Player**: video.js 8.23.6, react-player 3.4.0
- **Icons**: Lucide React 0.563.0

### Backend

- **Framework**: Spring Boot 3.5.10
- **Language**: Java 21
- **Security**: Spring Security (JWT)
- **Database**: PostgreSQL
- **ORM**: Spring Data JPA (Hibernate)
- **Build Tool**: Gradle

### AI

- **Language**: Python 3.10
- **AI Framework**: PyTorch 2.1.2 (CUDA 12.1)
- **Speech Recognition**: WhisperX 3.1.1, Faster-Whisper 1.0.3
- **NLP**: Transformers 4.36.2

### Infrastructure

- **Containerization**: Docker & Docker Compose
- **Cache**: Redis 7
- **Database**: PostgreSQL

---

## 📁 프로젝트 구조

```
OverLang/
├── frontend/                # React 프론트엔드
│   ├── src/
│   │   ├── assets/         # 이미지, 폰트 등
│   │   ├── components/     # 재사용 컴포넌트
│   │   ├── pages/          # 페이지 컴포넌트
│   │   ├── hooks/          # Custom Hooks
│   │   ├── services/       # API 통신
│   │   ├── types/          # TypeScript 타입
│   │   └── utils/          # 유틸 함수
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                 # Spring Boot 백엔드
│   ├── src/main/java/com/overlang/
│   │   ├── api/
│   │   │   ├── controller/ # REST 컨트롤러 (Dummy 포함)
│   │   │   └── dto/        # Request/Response DTO
│   │   ├── domain/         # 도메인 계층
│   │   │   ├── common/     # 공통 엔티티
│   │   │   ├── job/        # 작업 도메인
│   │   │   ├── member/     # 회원 도메인
│   │   │   ├── project/    # 프로젝트 도메인
│   │   │   └── segment/    # 자막 구간 도메인
│   │   └── global/         # Infrastructure / Common Settings
│   │       ├── advice/     # 예외 처리
│   │       ├── config/     # 보안, Swagger, Firebase 등 설정
│   │       └── response/   # 공통 응답 규격
│   └── build.gradle
│
├── ai/                  # AI (Python)
│   ├── models/             # AI 모델 관련
│   ├── services/           # 자막 생성 로직
│   ├── utils/              # 유틸리티
│   ├── Dockerfile
│   └── requirements.txt
│
├── docker-compose.yml       # 전체 서비스 오케스트레이션
└── README.md
```

---

## 🚀 시작하기

### 사전 요구사항

- **Node.js**: 22.19.0
- **Java**: 21 (LTS)
- **Python**: 3.10
- **Docker**: 최신 버전
- **NVIDIA GPU**: CUDA 12.6 이상 (AI 용, VRAM 8GB 이상 권장)

### 설치 및 실행

#### 1️⃣ 저장소 클론

```bash
git clone https://github.com/your-org/subtitle-platform.git
cd subtitle-platform
```

#### 2️⃣ 환경 변수 설정

각 디렉토리에 `.env` 파일을 생성합니다.

**Frontend (`/frontend/.env`)**

```env
VITE_API_BASE_URL=http://localhost:8080/api
```

**Backend (`/backend/.env`)**

```env
# Database 설정 (PostgreSQL)
# docker-compose.yml 및 ai/.env 와 동일한 규격 사용
DB_HOST=localhost
DB_PORT=5432
DB_NAME=overlang
DB_USERNAME=your_username
DB_PASSWORD=your_password

# Firebase 설정 (Admin SDK)
# 파일은 backend/src/main/resources/ 경로에 위치해야 합니다.
FIREBASE_SERVICE_ACCOUNT_PATH=your-firebase-admin.json
```

**ai (`/ai/.env`)**

```env
REDIS_HOST=redis
REDIS_PORT=6379
DB_HOST=postgres
DB_PORT=5432
CUDA_VISIBLE_DEVICES=0
```

> ⚠️ **보안 주의**: 실제 API 키와 비밀번호는 `.env.example` 파일을 참고하여 노션에서 확인하세요.



##### 3️⃣ CLI 사용 (Legacy)
FastAPI 서버를 실행하여 외부 요청을 처리할 수 있습니다.

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

**AI 실행**
```bash
cd ai

# 가상환경 생성
python -m venv venv

# 활성화
# Windows
.\venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt
```
````bash
cd ai
uvicorn ai.api.app:app --reload --host 0.0.0.0 --port 8000
````

- API 문서: [http://localhost:8000/docs](http://localhost:8000/docs)
- 상태 조회: [http://localhost:8000/api/v1/health](http://localhost:8000/)

**Celery Worker 실행 (비동기 작업용)**

```bash
# Windows (pool=solo 필수)
celery -A ai.worker.celery_app worker --loglevel=info --pool=solo
```

#### 4️⃣ Docker로 전체 스택 실행

**Docker 실행**
**일반 실행 (AI 제외, FE/BE 개발자용)**

```bash
docker-compose up -d
```

**AI 포함 실행 (GPU 보유자용)**

```bash
docker-compose --profile gpu-only up -d
```

````bash
# 로그 확인
docker-compose logs -f
# 서비스 중지
docker-compose down
````



**AI 모듈 실행 (Docker Only)**

**1. 전체 스택 실행 (API + Worker + Redis)**
```bash
docker-compose --profile gpu-only up -d --build
```

**2. 로그 확인 (실시간)**
```bash
docker-compose logs -f ai ai-worker
```
- **API 서버**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Celery Worker**: 백그라운드에서 동작 (Redis 통해 작업 수신)

**3. 테스트 방법 (Powershell)**
Docker 내부 경로(`/app/...`)를 사용하여 요청을 보냅니다.

```powershell
$body = @{
    file_path = "/app/ai/test_audio.mp3"
    options   = @{
        language   = "ko"        # ko, en, ja, etc.
        model      = "large-v2"  # base, medium, large-v2, large-v3
        batch_size = 16
        no_align   = $true       # $true: 속도 우선, $false: 정밀 타임스탬프
    }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/analyze" -ContentType "application/json" -Body $body
```

**4. 외부 접속 (Radmin VPN) 테스트**
- 서버 설정은 이미 외부 접속(`0.0.0.0`)이 허용되어 있습니다.
- Radmin VPN IP(예: `26.x.x.x`)를 사용하여 외부 기기에서 접속하세요.
- 예: `http://26.155.20.10:8000/docs`

---

## 🧪 테스트

### Frontend 테스트

```bash
cd frontend
npm run test        # Unit 테스트
npm run test:e2e    # E2E 테스트
```

### Backend 테스트

```bash
cd backend
./gradlew spotlessCheck # 코드 스타일 검사 (Spotless)
./gradlew test # 테스트 코드 실행 및 빌드 검증
```

### AI 테스트

```bash
cd ai
# 기본 실행
python main.py --input sample.mp4

# 옵션 사용 (속도 최적화)
python main.py --input sample.mp4 --no-align --batch-size 8 --warmup

# 전체 옵션 확인
python main.py --help
```

---

## 📝 개발 가이드

### Git Workflow

이 프로젝트는 **GitHub Flow**를 따릅니다.

1. **브랜치 생성**

   ```bash
   # 기능 개발 & 버그 수정
   git checkout -b fe/mypage

   # 문서 작업
   git checkout -b doc/api-spec
   ```

2. **커밋 메시지 규칙**

   ```bash
   git commit -m "design: 마이페이지 UI 구현"
   git commit -m "fix: 로그인 에러 수정"
   ```

3. **Pull Request**
   - `main` 브랜치로 PR 생성
   - 1명 이상의 리뷰어 승인 필요
   - Squash Merge 방식 사용

### 브랜치 네이밍

| 타입                 | 형식          | 예시                   |
| -------------------- | ------------- | ---------------------- |
| 기능 개발, 버그 수정 | `역할/기능명` | `fe/player`, `be/auth` |
| 문서 작업            | `doc/내용`    | `doc/api-spec`         |

### 커밋 타입

| 타입       | 설명                                                      |
| ---------- | --------------------------------------------------------- |
| `feat`     | 새로운 기능 추가 또는 기존 기능 개선                      |
| `fix`      | 버그 수정                                                 |
| `refactor` | 코드 리팩토링 (기능 변화 없이 구조 개선)                  |
| `doc`      | 문서 작업 (README 등)                                     |
| `test`     | 테스트 코드 추가 또는 수정                                |
| `chore`    | 환경 설정, 패키지 설치, 그 외 기타 (.gitignore 등)        |
| `perform`  | 성능 개선                                                 |
| `clean`    | 불필요한 코드 및 파일 제거, 정리                          |
| `design`   | UI/UX 스타일 작업 또는 개선                               |
| `style`    | 코드 스타일 변경 (세미콜론, 들여쓰기 등) – 기능 변화 없음 |
| `comment`  | 주석 수정, 추가                                           |

### 코드 스타일

**Frontend**

- Formatter: Prettier (Google JavaScript Style Guide)
- Linter: ESLint
- 자동 포맷팅: 파일 저장 시 자동 적용

```bash
npm run lint        # 린트 검사
npm run format      # 코드 포맷팅
```

**Backend**

- Formatter: Spotless (Google Java Format)
- PR 전 반드시 실행:

```bash
./gradlew spotlessApply
```

**AI**

- Formatter: Black
- Linter: Ruff

```bash
black .
ruff check .
```

---

## 🔌 API 명세

서버 실행 후 브라우저에서 아래 주소로 접속하면 실시간으로 API를 테스트하고 명세를 확인할 수 있습니다.

- **Swagger UI**: http://localhost:8080/swagger-ui/index.html

### 응답 형식

모든 API는 다음 형식을 따릅니다:

**성공 응답**

```json
{
  "status": "SUCCESS",
  "data": {
    "id": "uuid-string",
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

### 주요 엔드포인트

| 메서드 | 엔드포인트              | 설명                                  |
| ------ | ----------------------- | ------------------------------------- |
| POST   | `/api/v1/auth/firebase` | Firebase 토큰 검증 및 로그인/회원가입 |
| GET    | `/api/v1/auth/me`       | 현재 로그인한 사용자 정보 조회        |
| GET    | `/api/v1/projects`      | 프로젝트 목록 조회 (더미)             |
| POST   | `/auth/register`        | 회원가입                              |
| POST   | `/videos/upload`        | 영상 업로드                           |
| GET    | `/videos/:id`           | 영상 정보 조회                        |
| GET    | `/subtitles/:videoId`   | 자막 조회                             |
| POST   | `/subtitles`            | 자막 생성                             |
| PUT    | `/subtitles/:id`        | 자막 수정                             |
| POST   | `/subtitles/translate`  | 자막 번역 요청                        |
| GET    | `/api/v1/health`        | 서버 및 DB 상태 체크       |

### 에러 코드
| 코드 | 설명 | 예시 |
| :--- | :--- | :--- |
| `WORKER_001` | GPU Out of Memory | VRAM 부족 (모델/배치 크기 조절 필요) |
| `WORKER_002` | File Not Supported | 파일이 없거나 지원하지 않는 형식 |
| `WORKER_999` | Unknown Error | 서버 내부 에러 |

자세한 API 문서는 노션 페이지를 참고하세요.

---

## 🐳 Docker 구성

### 서비스 목록

| 서비스     | 포트 | 설명            |
| ---------- | ---- | --------------- |
| Frontend   | 5173 | React 개발 서버 |
| Backend    | 8080 | Spring Boot API |
| PostgreSQL | 5432 | 데이터베이스    |
| Redis      | 6379 | 캐시 서버       |
| AI         | -    | AI 자막 생성    |

### GPU 사용 설정

AI 컨테이너는 NVIDIA GPU를 사용합니다:

```yaml
ai:
  runtime: nvidia
  environment:
    - CUDA_VISIBLE_DEVICES=0
```

**사전 요구사항**: NVIDIA Docker Runtime 설치

---

## 👥 팀 구성

| 역할     | 담당자 | 주요 기술                    |
| -------- | ------ | ---------------------------- |
| Frontend | 이지원 | React, TypeScript, Tailwind  |
| Backend  | 한국희 | Spring Boot, JPA, PostgreSQL |
| AI       | 서유정 | Python, PyTorch, WhisperX    |

---

## 📄 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

---

## 📞 문의

- **노션**: [프로젝트 문서](https://notion.so/your-workspace)

---

## 🔗 관련 링크 (References)

프로젝트 개발 및 유지보수에 필요한 공식 기술 문서들입니다.

- **Frontend**: [React 공식 문서](https://react.dev)
- **Tailwind CSS**: [Tailwind CSS 문서](https://tailwindcss.com/docs)
- **Backend**: [Spring Boot 공식 문서](https://spring.io/projects/spring-boot)
- **AI**: [WhisperX GitHub](https://github.com/m-bain/whisperX)
````


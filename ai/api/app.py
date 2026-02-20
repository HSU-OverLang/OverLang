from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ai.api.routes import router as api_router

app = FastAPI(
    title="OverLang AI API",
    description="WhisperX를 활용한 AI 자막 생성 서비스",
    version="0.1.0",
)

# CORS 설정: 프론트엔드 및 백엔드에서의 접근 허용
origins = [
    "*",  # 개발 편의를 위해 전체 허용
    "http://localhost:5173",  # Frontend Server
    "http://localhost:8080",  # Backend Server
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root_check():
    """기본 접속 확인"""
    return {
        "status": "ok",
        "service": "OverLang AI Module",
        "version": "0.1.0",
        "message": "Welcome to OverLang AI Server",
    }


@app.get("/api/v1/health")
def api_health_check():
    """
    로드밸런서 또는 헬스 체크를 위한 명시적 엔드포인트.
    서버가 정상 작동 중인지 확인.
    """
    return {"status": "ok", "service": "OverLang AI API"}


# 라우터 등록
app.include_router(api_router, prefix="/api/v1")

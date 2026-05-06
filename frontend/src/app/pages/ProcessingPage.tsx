import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getJobDetail } from '@/api/video';

// ── 단계 라벨 (설계서 Stage Enum 기준) ──────────────────
const STAGE_LABELS: Record<string, string> = {
  QUEUED: '대기열에서 기다리는 중',
  AUDIO_EXTRACTION: '오디오 추출 중',
  STT_TRANSCRIPTION: '음성 인식 중 (WhisperX)',
  WHISPER_ALIGNMENT: '타임스탬프 정렬 중',
  OCR_FRAME_EXTRACTION: '프레임 샘플링 중',
  OCR_TEXT_DETECTION: '화면 텍스트 추출 중 (OCR)',
  LLM_ANALYSIS: 'AI 문장 분석 중',
  MERGING_RESULTS: '결과 병합 중',
  FINALIZING: '최종 저장 중',
};

// ── 에러 코드 메시지 (설계서 6. 에러 코드 기준) ──────────
const ERROR_MESSAGES: Record<string, string> = {
  WORKER_001: 'GPU 메모리가 부족합니다. 잠시 후 다시 시도해 주세요.',
  WORKER_002: '영상 처리(FFmpeg) 중 오류가 발생했습니다.',
  WORKER_003: 'AI 분석 토큰 한도를 초과했습니다.',
  WORKER_004: 'OCR 엔진 오류가 발생했습니다.',
  WORKER_005: 'AI 모델 로드에 실패했습니다.',
  WORKER_006: '영상 길이가 처리 한도를 초과했습니다.',
  WORKER_007: '잘못된 옵션 조합입니다.',
  WORKER_008: '인증에 실패했습니다.',
  WORKER_009: '처리 시간이 초과되었습니다 (STT: 10분 / OCR: 5분).',
  WORKER_010: '파일 다운로드에 실패했습니다.',
};

const STAGES_ORDER = [
  'QUEUED',
  'AUDIO_EXTRACTION',
  'STT_TRANSCRIPTION',
  'WHISPER_ALIGNMENT',
  'OCR_FRAME_EXTRACTION',
  'OCR_TEXT_DETECTION',
  'LLM_ANALYSIS',
  'MERGING_RESULTS',
  'FINALIZING',
];

// ── 컴포넌트 ─────────────────────────────────────────────
export function ProcessingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { jobId, videoSrc, targetLanguage } =
    (location.state as {
      jobId?: number;
      videoSrc?: string;
      targetLanguage?: string;
    }) ?? {};

  const [status, setStatus] = useState<'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('PENDING');
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('QUEUED');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const poll = async () => {
    if (!jobId) return;
    try {
      const detail = await getJobDetail(jobId);
      setStatus(detail.status);
      setProgress(detail.progress);
      if (detail.currentStage) setCurrentStage(detail.currentStage);

      if (detail.status === 'COMPLETED') {
        stopPolling();
        setTimeout(() => {
          navigate('/translate', { state: { videoSrc, targetLanguage } });
        }, 1200);
      } else if (detail.status === 'FAILED') {
        stopPolling();
        setErrorCode(detail.errorCode ?? null);
        setErrorMessage(detail.errorMessage ?? null);
      }
    } catch {
      // 폴링 중 네트워크 오류는 무시하고 다음 주기에 재시도
    }
  };

  useEffect(() => {
    if (!jobId) {
      navigate('/upload', { replace: true });
      return;
    }
    // TODO: 개발용 임시 우회 — AI 워커 연동 후 아래 블록 제거하고 poll() / setInterval 복구
    const devTimer = setTimeout(() => {
      navigate('/translate', { state: { videoSrc, targetLanguage } });
    }, 3000);
    return () => clearTimeout(devTimer);

    // poll();
    // intervalRef.current = setInterval(poll, 3000);
    // return stopPolling;
  }, [jobId]);

  const stageIndex = STAGES_ORDER.indexOf(currentStage);
  const isFailed = status === 'FAILED';
  const isCompleted = status === 'COMPLETED';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">

        {/* 로고 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-800">OverLang</span>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">

          {/* ── 실패 상태 ── */}
          {isFailed ? (
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">분석 실패</h2>
                <p className="text-gray-500 mt-1 text-sm">AI 분석 중 오류가 발생했습니다</p>
              </div>

              <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 mb-6">
                {errorCode && (
                  <p className="text-xs font-mono text-red-400 mb-1">{errorCode}</p>
                )}
                <p className="text-sm text-red-700 leading-relaxed">
                  {errorCode && ERROR_MESSAGES[errorCode]
                    ? ERROR_MESSAGES[errorCode]
                    : errorMessage ?? '알 수 없는 오류가 발생했습니다.'}
                </p>
              </div>

              <button
                onClick={() => navigate('/upload')}
                className="w-full px-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
              >
                다시 업로드하기
              </button>
            </>
          ) : (
            /* ── 처리 중 / 완료 상태 ── */
            <>
              <div className="text-center mb-8">
                {isCompleted ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">분석 완료!</h2>
                    <p className="text-gray-500 mt-1 text-sm">자막 편집 화면으로 이동합니다...</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900">AI가 분석 중입니다</h2>
                    <p className="text-gray-500 mt-1 text-sm">음성 인식과 화면 텍스트를 처리하고 있어요</p>
                  </>
                )}
              </div>

              {/* 진행률 바 */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium text-gray-700">
                    {STAGE_LABELS[currentStage] ?? '처리 중'}
                  </span>
                  <span className="text-emerald-600 font-bold">{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-emerald-500 h-2.5 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* 단계 리스트 */}
              <div className="space-y-2.5">
                {STAGES_ORDER.map((stage, idx) => {
                  const isDone = idx < stageIndex || isCompleted;
                  const isCurrent = idx === stageIndex && !isCompleted;
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      {/* 상태 아이콘 */}
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isDone
                          ? 'bg-emerald-500'
                          : isCurrent
                          ? 'border-2 border-emerald-500 bg-emerald-50'
                          : 'bg-gray-100'
                      }`}>
                        {isDone && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {isCurrent && (
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                      </div>
                      {/* 단계 이름 */}
                      <span className={`text-sm transition-colors ${
                        isDone
                          ? 'text-emerald-600 font-medium'
                          : isCurrent
                          ? 'text-gray-900 font-semibold'
                          : 'text-gray-400'
                      }`}>
                        {STAGE_LABELS[stage]}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed">
                영상 길이에 따라 최대 15분 정도 소요될 수 있습니다.<br />
                이 페이지를 닫지 마세요.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

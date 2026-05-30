import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getJobDetail, retryJob, ApiError } from '@/api/video';
import { useAuth } from '@/app/providers/AuthProvider';
import { Header } from '@/components/layout/Header';

// ── 단계 정의 ─────────────────────────────────────────────
const STAGES = [
  { key: 'QUEUED',               label: '대기열 진입',      desc: '분석 순서를 기다리고 있어요' },
  { key: 'AUDIO_EXTRACTION',     label: '오디오 추출',      desc: '영상에서 음성 트랙을 분리해요' },
  { key: 'STT_TRANSCRIPTION',    label: '음성 인식',        desc: 'WhisperX가 말소리를 텍스트로 변환해요' },
  { key: 'WHISPER_ALIGNMENT',    label: '타임스탬프 정렬',  desc: '각 단어의 정확한 시간 위치를 맞춰요' },
  { key: 'OCR_FRAME_EXTRACTION', label: '프레임 샘플링',    desc: '자막이 포함된 장면을 골라내요' },
  { key: 'OCR_TEXT_DETECTION',   label: '화면 텍스트 추출', desc: 'OCR 엔진으로 화면 글자를 읽어요' },
  { key: 'TRANSLATION',          label: '번역',             desc: '인식된 텍스트를 목표 언어로 번역해요' },
  { key: 'LLM_ANALYSIS',         label: 'AI 문장 분석',     desc: '문장 구조와 의미를 심층 분석해요' },
  { key: 'MERGING_RESULTS',      label: '결과 병합',        desc: '음성·화면 데이터를 하나로 합쳐요' },
  { key: 'FINALIZING',           label: '최종 저장',        desc: '분석 결과를 저장하고 마무리해요' },
];

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

// ── 컴포넌트 ─────────────────────────────────────────────
export function ProcessingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading: authLoading, user } = useAuth();
  const { jobId, videoSrc, projectId, targetLanguage } =
    (location.state as {
      jobId?: number;
      videoSrc?: string;
      projectId?: number;
      targetLanguage?: string;
    }) ?? {};

  const [status, setStatus] = useState<'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('PENDING');
  const [currentStage, setCurrentStage] = useState('QUEUED');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastValidStageIndex = useRef(0);

  const handleRetry = async () => {
    if (!projectId) return;
    setRetrying(true);
    // 번역 단계에서 실패한 경우 TRANSLATION_ONLY, 그 외는 FULL_ANALYSIS
    const jobType = currentStage === 'TRANSLATION' ? 'TRANSLATION_ONLY' : 'FULL_ANALYSIS';
    try {
      const result = await retryJob(projectId, jobType);
      // 새 jobId로 같은 페이지 리셋
      navigate('/processing', {
        replace: true,
        state: { jobId: result.jobId, videoSrc, projectId, targetLanguage },
      });
    } catch (e: any) {
      setErrorMessage(e?.message ?? '재처리 요청에 실패했습니다.');
    } finally {
      setRetrying(false);
    }
  };

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
      if (detail.currentStage) setCurrentStage(detail.currentStage);

      if (detail.status === 'COMPLETED') {
        stopPolling();
        setTimeout(() => {
          navigate(`/translate/${projectId}`, { state: { videoSrc, targetLanguage } });
        }, 1200);
      } else if (detail.status === 'FAILED') {
        stopPolling();
        setErrorCode(detail.errorCode ?? null);
        setErrorMessage(detail.errorMessage ?? null);
      }
    } catch (e: unknown) {
      // 404: 프로젝트/Job이 삭제된 경우 → polling 중단 후 대시보드로 이동
      if (e instanceof ApiError && e.status === 404) {
        stopPolling();
        navigate('/dashboard', { replace: true });
        return;
      }
      // 그 외 네트워크 오류는 무시하고 다음 주기에 재시도
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!jobId) {
      navigate('/upload', { replace: true });
      return;
    }
    poll();
    intervalRef.current = setInterval(poll, 3000);
    return stopPolling;
  }, [authLoading, user, jobId]);

  const stageIndex = (() => {
    const idx = STAGES.findIndex(s => s.key === currentStage);
    if (idx !== -1) {
      lastValidStageIndex.current = idx;
      return idx;
    }
    // 백엔드가 모르는 중간 단계를 잠깐 보낼 때 마지막 유효 단계 유지
    return lastValidStageIndex.current;
  })();
  const isFailed = status === 'FAILED';
  const isCompleted = status === 'COMPLETED';

  const getStageState = (idx: number): 'done' | 'active' | 'pending' => {
    if (isCompleted) return 'done';
    if (idx < stageIndex) return 'done';
    if (idx === stageIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50/30">
      <Header />
      <div className="flex items-center justify-center p-6 pt-8">
      <div className="w-full max-w-md">

        {/* 로고 - 클릭 시 대시보드 이동 */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center justify-center gap-2 mb-8 mx-auto hover:opacity-80 transition-opacity"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-800">OverLang</span>
        </button>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

          {/* ── 실패 상태 ── */}
          {isFailed ? (
            <div className="p-8">
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
                <p className="text-sm text-red-700 leading-relaxed">
                  {(errorCode && ERROR_MESSAGES[errorCode])
                    ? ERROR_MESSAGES[errorCode]
                    : '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {/* 재처리 버튼 (projectId 있을 때만) */}
                {projectId && (
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="w-full px-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {retrying ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        재처리 요청 중...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        다시 분석하기
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => navigate('/upload')}
                  className="w-full px-4 py-3 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                >
                  새 영상 업로드하기
                </button>
              </div>
            </div>

          ) : (
            /* ── 처리 중 / 완료 ── */
            <>
              {/* 헤더 */}
              <div className="px-8 pt-8 pb-6 text-center border-b border-slate-100">
                {isCompleted ? (
                  <>
                    <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">분석 완료!</h2>
                    <p className="text-gray-400 mt-1 text-sm">자막 편집 화면으로 이동합니다...</p>
                  </>
                ) : (
                  <>
                    <div className="relative w-14 h-14 mx-auto mb-3">
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">AI가 분석 중입니다</h2>
                    <p className="text-gray-400 mt-1 text-sm">음성 인식과 화면 텍스트를 처리하고 있어요</p>
                  </>
                )}
              </div>

              {/* 스텝 목록 */}
              <div className="px-8 py-6">
                <div className="relative">
                  {/* 세로 연결선 */}
                  <div className="absolute left-[17px] top-5 bottom-5 w-[2px] bg-slate-100" />

                  <div className="space-y-0">
                    {STAGES.map((stage, idx) => {
                      const state = getStageState(idx);
                      return (
                        <div key={stage.key} className="relative flex items-start gap-4 py-2.5">
                          {/* 원형 아이콘 */}
                          <div className="relative z-10 shrink-0">
                            {state === 'done' ? (
                              <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : state === 'active' ? (
                              <div className="w-9 h-9 rounded-full bg-white border-2 border-emerald-400 flex items-center justify-center shadow-md">
                                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                              </div>
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-slate-300" />
                              </div>
                            )}
                          </div>

                          {/* 텍스트 */}
                          <div className="flex-1 min-w-0 pt-1.5">
                            <p className={`text-sm font-semibold leading-tight transition-colors ${
                              state === 'done'
                                ? 'text-emerald-600'
                                : state === 'active'
                                ? 'text-slate-900'
                                : 'text-slate-300'
                            }`}>
                              {stage.label}
                            </p>
                            {state === 'active' && (
                              <p className="text-xs text-slate-400 mt-0.5 leading-snug">{stage.desc}</p>
                            )}
                          </div>

                          {/* 진행 중 배지 */}
                          {state === 'active' && (
                            <div className="shrink-0 pt-1.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                진행 중
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 하단 안내 */}
              <div className="px-8 pb-7 text-center">
                <p className="text-xs text-slate-300 leading-relaxed">
                  영상 길이에 따라 최대 15분 정도 소요될 수 있습니다.<br />
                  이 페이지를 닫지 마세요.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

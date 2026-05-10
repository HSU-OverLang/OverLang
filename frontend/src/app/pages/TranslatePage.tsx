import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getVideoPresignedUrl, getProjectJobs, getSegments, getOcrItems } from '@/api/video';
import type { SegmentResult, OcrItemResult } from '@/api/video';

// ── 유튜브 URL 파싱 ────────────────────────────────────
function extractYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return id;
      const shorts = parsed.pathname.match(/\/shorts\/([^/?&]+)/);
      if (shorts) return shorts[1];
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('?')[0] || null;
    }
  } catch { /* URL 파싱 실패 */ }
  return null;
}

// ── 유틸 ───────────────────────────────────────────────
function secToTimecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// [en->ko] 같은 접두사 제거 + 원문과 동일하거나 의미없는 번역 필터링
function cleanTranslation(translated: string | null, original: string): string {
  if (!translated) return '';
  // [xx->xx] 패턴 제거
  const cleaned = translated.replace(/^\[[\w-]+->[\w-]+\]\s*/i, '').trim();
  // 정리 후 원문과 동일하면 번역 없음으로 처리
  if (cleaned === original.trim()) return '';
  return cleaned;
}

function timecodeToSec(tc: string): number {
  const parts = tc.split(':').map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

// ── 타입 ───────────────────────────────────────────────
interface SubtitleItem {
  id: number;
  start: string;
  end: string;
  startSec: number;
  endSec: number;
  original: string;
  translation: string;
}

interface OcrOverlay {
  id: number;
  original: string;
  translation: string;
  x: number;
  y: number;
  w: number;
  h: number;
  startSec: number;
  endSec: number;
}

// ── 목 데이터 ──────────────────────────────────────────
const DEMO_VIDEO = 'https://www.w3schools.com/html/mov_bbb.mp4';

const MOCK_SUBTITLES: SubtitleItem[] = [
  { id: 1, start: '00:00:00', end: '00:00:03', startSec: 0,  endSec: 3,  original: 'Hello, everyone! Welcome to our English learning session.', translation: '안녕하세요, 여러분! 영어 학습 세션에 오신 것을 환영합니다.' },
  { id: 2, start: '00:00:03', end: '00:00:07', startSec: 3,  endSec: 7,  original: "Today, we're going to dive into some essential business idioms.", translation: '오늘은 필수적인 비즈니스 관용구들을 본격적으로 배워보겠습니다.' },
  { id: 3, start: '00:00:07', end: '00:00:12', startSec: 7,  endSec: 12, original: 'These phrases will help you sound more natural in professional settings.', translation: '이 표현들은 전문적인 환경에서 더 자연스럽게 들리는 데 도움이 될 것입니다.' },
  { id: 4, start: '00:00:12', end: '00:00:16', startSec: 12, endSec: 16, original: 'Remember, practice makes perfect!', translation: '기억하세요, 연습이 완벽함을 만듭니다!' },
  { id: 5, start: '00:00:16', end: '00:00:20', startSec: 16, endSec: 20, original: "Let's get the ball rolling with our first idiom.", translation: '첫 번째 관용구로 시작해 봅시다.' },
];

const MOCK_OCR: OcrOverlay[] = [
  { id: 1, original: 'Business Idioms', translation: '비즈니스 관용구', x: 15, y: 18, w: 20, h: 5, startSec: 0, endSec: 999 },
  { id: 2, original: 'Chapter 1',       translation: '챕터 1',           x: 15, y: 30, w: 12, h: 5, startSec: 0, endSec: 999 },
];

type RightPanel = 'word' | 'sentence' | null;

const SAVED_WORDS_KEY = 'overlang_saved_words';

interface SavedWord {
  id: string;
  word: string;
  originalSentence: string;
  translatedSentence: string;
  timestamp: string;
  date: string;
}

// ── 컴포넌트 ───────────────────────────────────────────
export function TranslatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { videoSrc, projectId, targetLanguage } =
    (location.state as { videoSrc?: string; projectId?: number; targetLanguage?: string }) ?? {};

  // 진입 시 상태 확인
  console.log('[OverLang] TranslatePage state:', { videoSrc, projectId, targetLanguage });

  const [activeVideo, setActiveVideo] = useState<string>(videoSrc ?? DEMO_VIDEO);
  const [videoLoading, setVideoLoading] = useState<boolean>(!!projectId && !videoSrc);
  const youtubeId = extractYoutubeId(activeVideo);

  // 영상 재생 시간 추적
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // 자막 목록 자동 스크롤
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const activeSubtitleRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // YouTube IFrame API 로드 및 시간 추적
  useEffect(() => {
    if (!youtubeId) return;

    // YouTube IFrame API 스크립트 로드
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    let player: any = null;

    const initPlayer = () => {
      player = new (window as any).YT.Player('yt-player', {
        videoId: youtubeId,
        playerVars: { autoplay: 0, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            ytPlayerRef.current = player;
            // 500ms마다 현재 시간 업데이트
            ytTimerRef.current = setInterval(() => {
              if (player && typeof player.getCurrentTime === 'function') {
                setCurrentTime(player.getCurrentTime());
              }
            }, 500);
          },
        },
      });
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (ytTimerRef.current) clearInterval(ytTimerRef.current);
      if (player && typeof player.destroy === 'function') player.destroy();
      ytPlayerRef.current = null;
    };
  }, [youtubeId]);

  // 파일 업로드 영상: 진입 시 presigned URL 발급
  useEffect(() => {
    if (!projectId || videoSrc) return;
    setVideoLoading(true);
    getVideoPresignedUrl(projectId)
      .then(url => setActiveVideo(url))
      .catch(() => setActiveVideo(DEMO_VIDEO))
      .finally(() => setVideoLoading(false));
  }, [projectId]);

  const [showOcr, setShowOcr] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [selectedWord, setSelectedWord] = useState<SavedWord | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_WORDS_KEY) ?? '[]'); } catch { return []; }
  });
  const [sentenceData, setSentenceData] = useState<{ sentence: string; parts: { text: string; meaning: string; color: string }[]; grammar: string } | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>(MOCK_SUBTITLES);
  const [ocrData, setOcrData] = useState<OcrOverlay[]>(MOCK_OCR);
  const [dataLoading, setDataLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // 실제 자막/OCR 데이터 로드
  useEffect(() => {
    if (!projectId) return;
    setDataLoading(true);
    getProjectJobs(projectId)
      .then(jobs => {
        console.log('[OverLang] 전체 Job 목록:', jobs);

        // COMPLETED 또는 FAILED 중 가장 최신 Job (STT는 FAILED여도 저장됨)
        const targetJob = jobs
          .filter(j => j.status === 'COMPLETED' || j.status === 'FAILED')
          .sort((a, b) => b.jobId - a.jobId)[0];

        console.log('[OverLang] 사용할 Job:', targetJob ?? '없음');
        if (!targetJob) return;

        const { jobId } = targetJob;

        // segments와 ocrItems 각각 독립적으로 시도
        return Promise.allSettled([getSegments(jobId), getOcrItems(jobId)]);
      })
      .then(results => {
        if (!results) return;

        const [segResult, ocrResult] = results as [
          PromiseSettledResult<SegmentResult[]>,
          PromiseSettledResult<OcrItemResult[]>
        ];

        // STT 세그먼트 처리
        if (segResult.status === 'fulfilled') {
          const segments = segResult.value;
          console.log('[OverLang] STT 세그먼트:', segments);
          if (segments.length > 0) {
            setSubtitles(segments.map((seg: SegmentResult) => ({
              id: seg.segmentId,
              start: secToTimecode(seg.startTime),
              end: secToTimecode(seg.endTime),
              startSec: seg.startTime,
              endSec: seg.endTime,
              original: seg.text,
              translation: cleanTranslation(seg.translatedText, seg.text),
            })));
          } else {
            console.warn('[OverLang] STT 세그먼트가 비어있음');
          }
        } else {
          console.error('[OverLang] STT 세그먼트 로드 실패:', segResult.reason);
        }

        // OCR 처리
        if (ocrResult.status === 'fulfilled') {
          const ocrItems = ocrResult.value;
          console.log('[OverLang] OCR 아이템:', ocrItems);
          if (ocrItems.length > 0) {
            setOcrData(ocrItems.map((item: OcrItemResult) => ({
              id: item.ocrItemId,
              original: item.originText,
              translation: cleanTranslation(item.translatedText, item.originText),
              x: item.boundingBox.x * 100,
              y: item.boundingBox.y * 100,
              w: item.boundingBox.w * 100,
              h: item.boundingBox.h * 100,
              startSec: item.startTime,
              endSec: item.endTime,
            })));
          }
        } else {
          console.warn('[OverLang] OCR 로드 실패 (무시):', ocrResult.reason);
        }
      })
      .catch(err => {
        console.error('[OverLang] 데이터 로드 오류:', err);
      })
      .finally(() => setDataLoading(false));
  }, [projectId]);

  // 현재 재생 시간에 해당하는 자막 계산
  const activeSubtitle = subtitles.find(
    s => currentTime >= s.startSec && currentTime < s.endSec
  ) ?? null;

  // 현재 재생 시간에 해당하는 OCR 필터
  const activeOcr = ocrData.filter(
    o => currentTime >= o.startSec && currentTime < o.endSec
  );

  // 활성 자막으로 자동 스크롤
  useEffect(() => {
    if (!activeSubtitle) return;
    const el = activeSubtitleRefs.current.get(activeSubtitle.id);
    if (el && subtitleListRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSubtitle?.id]);

  // 비디오 시간 업데이트 핸들러
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // 자막 클릭 시 해당 시간으로 이동
  const handleSubtitleClick = (sub: SubtitleItem) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sub.startSec;
      videoRef.current.play();
    }
  };

  // 단어 드래그 선택
  const handleTextSelect = (subtitle: SubtitleItem) => {
    const selection = window.getSelection();
    const word = selection?.toString().trim();
    if (!word || word.length < 2) return;

    const wordData: SavedWord = {
      id: `${Date.now()}_${word}`,
      word,
      originalSentence: subtitle.original,
      translatedSentence: subtitle.translation,
      timestamp: subtitle.start,
      date: new Date().toLocaleDateString('ko-KR'),
    };
    setSelectedWord(wordData);
    setRightPanel('word');
  };

  // 단어 localStorage 저장
  const handleSaveWord = () => {
    if (!selectedWord) return;
    const existing: SavedWord[] = JSON.parse(localStorage.getItem(SAVED_WORDS_KEY) ?? '[]');
    const isDup = existing.some(w => w.word === selectedWord.word && w.timestamp === selectedWord.timestamp);
    if (isDup) {
      alert('이미 저장된 단어입니다.');
      return;
    }
    const updated = [selectedWord, ...existing];
    localStorage.setItem(SAVED_WORDS_KEY, JSON.stringify(updated));
    setSavedWords(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  // 문장 구조 분석
  const handleSentenceAnalysis = (subtitle: SubtitleItem) => {
    setSentenceData({
      sentence: subtitle.original,
      parts: getMockSentenceParts(subtitle.original),
      grammar: getMockGrammar(subtitle.original),
    });
    setRightPanel('sentence');
  };

  const getMockSentenceParts = (sentence: string) => {
    if (sentence.includes("get the ball rolling")) {
      return [
        { text: "Let's", meaning: '~하자 (제안)', color: 'bg-pink-100 text-pink-700' },
        { text: 'get the ball rolling', meaning: '시작하다 (관용구)', color: 'bg-green-100 text-green-700' },
        { text: 'with', meaning: '~와 함께', color: 'bg-slate-100 text-slate-700' },
        { text: 'our first idiom', meaning: '우리의 첫 번째 관용구', color: 'bg-purple-100 text-purple-700' },
      ];
    }
    return sentence.split(' ').slice(0, 4).map((w, i) => ({
      text: w,
      meaning: `단어 ${i + 1}`,
      color: ['bg-pink-100 text-pink-700', 'bg-green-100 text-green-700', 'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700'][i % 4],
    }));
  };

  const getMockGrammar = (sentence: string) => {
    if (sentence.includes("get the ball rolling")) {
      return "이 문장은 'Let's + 동사원형' 구조로 청자에게 함께 행동하자고 제안하는 표현입니다. 'get the ball rolling'은 관용구로, 직역하면 '공을 굴리다'이지만 실제로는 '일을 시작하다'는 의미입니다.";
    }
    return "이 문장은 현재 시제로 일반적인 사실이나 습관을 나타냅니다.";
  };

  // 자막 수정
  const handleSubtitleChange = (id: number, field: 'original' | 'translation', value: string) => {
    setSubtitles(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleDeleteSubtitle = (id: number) => {
    setSubtitles(prev => prev.filter(s => s.id !== id));
  };

  const handleAddSubtitle = () => {
    const last = subtitles[subtitles.length - 1];
    const startSec = last?.endSec ?? 0;
    setSubtitles(prev => [...prev, {
      id: Date.now(),
      start: secToTimecode(startSec),
      end: secToTimecode(startSec + 3),
      startSec,
      endSec: startSec + 3,
      original: '',
      translation: '',
    }]);
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">

      {/* ── 상단 헤더 ── */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">자막 편집 & 학습</p>
              <p className="text-xs text-slate-400">
                {dataLoading ? '자막 불러오는 중...' : `AI 기반 번역 및 의미 분석 · ${subtitles.length}개 자막`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/study')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-orange-500 hover:bg-orange-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            학습 노트 ({savedWords.length})
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            저장
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            다운로드
          </button>
        </div>
      </header>

      {/* ── 본문 (3단 레이아웃) ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 왼쪽: 영상 영역 ── */}
        <div className="flex flex-col w-[55%] border-r border-slate-200 overflow-y-auto">
          {/* 영상 플레이어 */}
          <div className="relative bg-black">
            {videoLoading ? (
              <div className="w-full aspect-video flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
              </div>
            ) : youtubeId ? (
              <div id="yt-player" className="w-full aspect-video" />
            ) : (
              <video
                ref={videoRef}
                className="w-full aspect-video"
                controls
                src={activeVideo}
                onTimeUpdate={handleTimeUpdate}
              />
            )}

            {/* OCR 오버레이 - 번역문만, 원본 크기에 맞게, 반투명 */}
            {showOcr && activeOcr.map(ocr => (
              ocr.translation ? (
                <div
                  key={ocr.id}
                  className="absolute overflow-hidden flex items-center justify-center"
                  style={{
                    left: `${ocr.x}%`,
                    top: `${ocr.y}%`,
                    width: `${ocr.w}%`,
                    height: `${ocr.h}%`,
                  }}
                >
                  <div className="w-full h-full bg-black/45 backdrop-blur-[2px] flex items-center justify-center rounded-sm">
                    <p className="text-white text-center leading-tight px-1"
                      style={{ fontSize: `clamp(8px, ${ocr.h * 0.45}vw, 14px)` }}
                    >
                      {ocr.translation}
                    </p>
                  </div>
                </div>
              ) : null
            ))}

            {/* 자막 오버레이 - 번역문만 */}
            {showSubtitle && activeSubtitle?.translation && (
              <div className="absolute bottom-10 left-0 right-0 flex justify-center px-4 pointer-events-none">
                <span className="bg-black/70 text-white px-4 py-1.5 rounded text-sm text-center max-w-[90%] leading-snug">
                  {activeSubtitle.translation}
                </span>
              </div>
            )}

            {/* 토글 버튼 그룹 */}
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              {/* OCR 토글 */}
              <button
                onClick={() => setShowOcr(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showOcr
                    ? 'bg-black/60 text-white hover:bg-black/80'
                    : 'bg-black/60 text-slate-400 hover:bg-black/80'
                }`}
              >
                {showOcr ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    OCR 표시중
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    OCR 숨김
                  </>
                )}
              </button>

              {/* 자막 토글 */}
              <button
                onClick={() => setShowSubtitle(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showSubtitle
                    ? 'bg-black/60 text-white hover:bg-black/80'
                    : 'bg-black/60 text-slate-400 hover:bg-black/80'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                {showSubtitle ? '자막 표시중' : '자막 숨김'}
              </button>
            </div>

            {/* 현재 재생 시간 표시 */}
            {!youtubeId && (
              <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded font-mono">
                {secToTimecode(currentTime)}
              </div>
            )}
          </div>

          {/* 안내 카드 */}
          <div className="flex gap-3 px-4 py-2.5 border-t border-slate-100 shrink-0">
            <div className="flex items-center gap-2 flex-1 rounded-lg bg-blue-50 px-3 py-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500 shrink-0">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-xs text-slate-600">화면 텍스트 위치 기반 OCR 번역</p>
            </div>
            <div className="flex items-center gap-2 flex-1 rounded-lg bg-orange-50 px-3 py-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500 shrink-0">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <p className="text-xs text-slate-600">단어 드래그로 즉시 의미 확인</p>
            </div>
          </div>
        </div>

        {/* ── 가운데: 자막 목록 ── */}
        <div className="flex flex-col w-[25%] border-r border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <div>
              <p className="text-sm font-bold text-slate-800">자막 목록</p>
              <p className="text-xs text-slate-400">
                {dataLoading ? '불러오는 중...' : `${subtitles.length}개의 자막`}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleAddSubtitle}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          {/* 자막 목록 스크롤 영역 */}
          <div ref={subtitleListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {dataLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="w-8 h-8 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
                <p className="text-xs text-slate-400">AI 자막 불러오는 중...</p>
              </div>
            )}

            {!dataLoading && subtitles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <p className="text-sm text-slate-500">자막이 없습니다</p>
                <p className="text-xs text-slate-400">AI 분석이 완료되면 자막이 표시됩니다</p>
              </div>
            )}

            {subtitles.map(sub => {
              const isActive = sub.id === activeSubtitle?.id;
              return (
                <div
                  key={sub.id}
                  ref={el => {
                    if (el) activeSubtitleRefs.current.set(sub.id, el);
                    else activeSubtitleRefs.current.delete(sub.id);
                  }}
                  className={`rounded-xl border p-3 transition-all cursor-pointer ${
                    isActive
                      ? 'border-violet-400 bg-violet-50 shadow-sm'
                      : 'border-slate-200 hover:border-violet-200 hover:bg-slate-50'
                  }`}
                  onClick={() => handleSubtitleClick(sub)}
                >
                  {/* 타임코드 */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${isActive ? 'bg-violet-200 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                      {sub.start}
                    </span>
                    <span className="text-xs text-slate-400">→</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${isActive ? 'bg-violet-200 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                      {sub.end}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteSubtitle(sub.id); }}
                      className="ml-auto text-red-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* 원문 */}
                  <p className="text-[10px] font-semibold text-slate-400 mb-1">원문</p>
                  <textarea
                    value={sub.original}
                    onChange={e => handleSubtitleChange(sub.id, 'original', e.target.value)}
                    onMouseUp={() => handleTextSelect(sub)}
                    onClick={e => e.stopPropagation()}
                    rows={2}
                    className={`w-full text-xs border rounded-lg px-2 py-1.5 resize-none focus:outline-none mb-2 transition-colors ${
                      isActive
                        ? 'text-slate-800 border-violet-200 bg-white focus:border-violet-400'
                        : 'text-slate-700 border-slate-200 bg-white focus:border-violet-400'
                    }`}
                  />

                  {/* 번역 */}
                  <p className="text-[10px] font-semibold text-slate-400 mb-1">번역</p>
                  <textarea
                    value={sub.translation}
                    onChange={e => handleSubtitleChange(sub.id, 'translation', e.target.value)}
                    onClick={e => e.stopPropagation()}
                    rows={2}
                    className={`w-full text-xs border rounded-lg px-2 py-1.5 resize-none focus:outline-none mb-2 transition-colors ${
                      isActive
                        ? 'text-slate-800 border-violet-200 bg-white focus:border-violet-400'
                        : 'text-slate-700 border-slate-200 bg-white focus:border-violet-400'
                    }`}
                  />

                  {/* 문장 구조 분석 버튼 */}
                  <button
                    onClick={e => { e.stopPropagation(); handleSentenceAnalysis(sub); }}
                    className="flex items-center gap-1.5 text-xs font-medium text-violet-500 hover:text-violet-700 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    문장 구조 분석
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 오른쪽: 단어 해설 / 문장 분석 패널 ── */}
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              {rightPanel === 'sentence' ? (
                <>
                  <svg className="h-4 w-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  <p className="text-sm font-bold text-slate-800">문장 구조 분석</p>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <p className="text-sm font-bold text-slate-800">단어 해설</p>
                </>
              )}
            </div>
            {rightPanel && (
              <button onClick={() => setRightPanel(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">

            {/* 아무것도 선택 안 한 상태 */}
            {!rightPanel && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
                  <svg className="h-7 w-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <p className="font-medium text-slate-700">단어를 선택해보세요</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  자막 텍스트에서 궁금한 단어나 표현을 드래그 하면<br />
                  뜻, 발음, 예문과 함께<br />
                  <span className="text-violet-500">영상에서의 맥락적 의미</span>까지<br />
                  확인할 수 있습니다.
                </p>
                {activeSubtitle && (
                  <div className="mt-4 w-full rounded-xl bg-violet-50 border border-violet-200 p-4 text-left">
                    <p className="text-xs font-semibold text-violet-500 mb-1">현재 재생 중인 자막</p>
                    <p className="text-sm text-slate-700">{activeSubtitle.original}</p>
                    {activeSubtitle.translation && (
                      <p className="text-xs text-slate-500 mt-1">{activeSubtitle.translation}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 단어 찜 패널 */}
            {rightPanel === 'word' && selectedWord && (
              <div className="space-y-4">
                <button
                  onClick={() => setRightPanel(null)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  돌아가기
                </button>

                {/* 단어 */}
                <div className="rounded-xl bg-violet-50 border border-violet-100 p-5 text-center">
                  <p className="text-2xl font-extrabold text-violet-700">{selectedWord.word}</p>
                  <p className="text-xs text-violet-400 mt-1 font-mono">{selectedWord.timestamp}</p>
                </div>

                {/* 원문 문장 */}
                <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">원문 문장</p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {selectedWord.originalSentence.split(new RegExp(`(${selectedWord.word})`, 'i')).map((part, i) =>
                      part.toLowerCase() === selectedWord.word.toLowerCase()
                        ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
                        : part
                    )}
                  </p>
                  {selectedWord.translatedSentence && (
                    <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-2 mt-2">
                      {selectedWord.translatedSentence}
                    </p>
                  )}
                </div>

                {/* 찜 버튼 */}
                <button
                  onClick={handleSaveWord}
                  className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    savedSuccess
                      ? 'bg-emerald-500 text-white'
                      : 'bg-orange-500 hover:bg-orange-400 text-white'
                  }`}
                >
                  {savedSuccess ? (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      저장 완료!
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                      찜하기
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-slate-400">
                  단어 뜻·예문은 추후 AI 분석으로 자동 추가될 예정이에요
                </p>
              </div>
            )}

            {/* 문장 구조 분석 패널 */}
            {rightPanel === 'sentence' && sentenceData && (
              <div className="space-y-4">
                <button
                  onClick={() => setRightPanel(null)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  돌아가기
                </button>

                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">원문</p>
                  <p className="text-sm font-medium text-slate-800 leading-relaxed">{sentenceData.sentence}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">의미 단위 분해</p>
                  <div className="space-y-2">
                    {sentenceData.parts.map((part, i) => (
                      <div key={i} className={`rounded-lg px-3 py-2 ${part.color}`}>
                        <p className="text-sm font-semibold">{part.text}</p>
                        <p className="text-xs mt-0.5 opacity-80">{part.meaning}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-amber-50 p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <p className="text-xs font-semibold text-amber-600">문법 해설</p>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{sentenceData.grammar}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

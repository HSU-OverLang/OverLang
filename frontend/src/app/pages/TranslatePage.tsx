import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { useLocation, useParams } from 'react-router-dom';
import { getVideoPresignedUrl, getProjectJobs, getSegments, getOcrItems, updateTranslation, getLearningContents } from '@/api/video';
import type { SegmentResult, OcrItemResult, SegmentWord, LearningContentsResult } from '@/api/video';
import { explainWord, saveWord, getMySavedWords } from '@/api/words';
import { useAuth } from '@/app/providers/AuthProvider';

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

// ── 언어 코드 → BCP47 매핑 ────────────────────────────
const LANG_TO_BCP47: Record<string, string> = {
  EN: 'en-US',
  KO: 'ko-KR',
  ZH: 'zh-CN',
  JA: 'ja-JP',
  ES: 'es-ES',
  FR: 'fr-FR',
};

// ── 유틸 ───────────────────────────────────────────────
function secToTimecode(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ── 자동 높이 조절 Textarea ────────────────────────────
interface AutoTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onMouseUp?: () => void;
  onClick?: (e: React.MouseEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
}

function AutoTextarea({ value, onChange, onMouseUp, onClick, placeholder, className }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  useLayoutEffect(() => { resize(); }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onMouseUp={onMouseUp}
      onClick={onClick}
      placeholder={placeholder}
      rows={1}
      style={{ overflow: 'hidden', resize: 'none' }}
      className={className}
    />
  );
}

// ── OCR 타이핑 애니메이션 컴포넌트 ─────────────────────
function TypingOcrText({
  text,
  durationSec,
  style,
}: {
  text: string;
  durationSec: number;
  style?: React.CSSProperties;
}) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');
    const chars = text.length;
    if (chars === 0) return;
    // 표시 시간의 70% 안에 타이핑 완료
    const intervalMs = Math.max(20, Math.min(80, (durationSec * 700) / chars));
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= chars) clearInterval(timer);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [text, durationSec]);

  return (
    <p className="w-full leading-tight px-0.5" style={{ whiteSpace: 'pre-line', ...style }}>
      {displayed}
      {displayed.length < text.length && (
        <span
          className="inline-block w-[2px] h-[1em] ml-[1px] animate-pulse align-middle opacity-80"
          style={{ backgroundColor: (style?.color as string) ?? '#ffffff' }}
        />
      )}
    </p>
  );
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

// ── 타입 ───────────────────────────────────────────────
interface SubtitleItem {
  id: number;
  start: string;
  end: string;
  startSec: number;
  endSec: number;
  original: string;
  translation: string;
  words: SegmentWord[];         // 원문 단어 (ORIGINAL)
  translatedWords?: SegmentWord[]; // 번역 단어 (TRANSLATION)
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
  confidence?: number;
  lines?: Array<{
    originText: string;
    boundingBox: { x: number; y: number; w: number; h: number };
  }>;
  style?: {
    animation?: { type: 'TYPEWRITER' | 'FADE' | 'NONE'; startTime: number; endTime: number };
    fontSizeRatio?: number;
    fontWeight?: 'BOLD' | 'NORMAL';
    textAlign?: 'LEFT' | 'CENTER' | 'RIGHT';
    textColor?: string;
    backgroundColor?: string;
    dominantBackgroundColor?: string;
    blurRegion?: { x: number; y: number; w: number; h: number };
  };
}

// ── 목 데이터 ──────────────────────────────────────────
const DEMO_VIDEO = 'https://www.w3schools.com/html/mov_bbb.mp4';

const MOCK_SUBTITLES: SubtitleItem[] = [
  { id: 1, start: '00:00:00', end: '00:00:03', startSec: 0,  endSec: 3,  original: 'Hello, everyone! Welcome to our English learning session.', translation: '안녕하세요, 여러분! 영어 학습 세션에 오신 것을 환영합니다.', words: [] },
  { id: 2, start: '00:00:03', end: '00:00:07', startSec: 3,  endSec: 7,  original: "Today, we're going to dive into some essential business idioms.", translation: '오늘은 필수적인 비즈니스 관용구들을 본격적으로 배워보겠습니다.', words: [] },
  { id: 3, start: '00:00:07', end: '00:00:12', startSec: 7,  endSec: 12, original: 'These phrases will help you sound more natural in professional settings.', translation: '이 표현들은 전문적인 환경에서 더 자연스럽게 들리는 데 도움이 될 것입니다.', words: [] },
  { id: 4, start: '00:00:12', end: '00:00:16', startSec: 12, endSec: 16, original: 'Remember, practice makes perfect!', translation: '기억하세요, 연습이 완벽함을 만듭니다!', words: [] },
  { id: 5, start: '00:00:16', end: '00:00:20', startSec: 16, endSec: 20, original: "Let's get the ball rolling with our first idiom.", translation: '첫 번째 관용구로 시작해 봅시다.', words: [] },
];

const MOCK_OCR: OcrOverlay[] = [
  { id: 1, original: 'Business Idioms', translation: '비즈니스 관용구', x: 15, y: 18, w: 20, h: 5, startSec: 0, endSec: 999 },
  { id: 2, original: 'Chapter 1',       translation: '챕터 1',           x: 15, y: 30, w: 12, h: 5, startSec: 0, endSec: 999 },
];

type RightPanel = 'word' | 'sentence' | null;
type ActiveTab = '요약' | '자막' | '관용표현';

const SAVED_WORDS_KEY = 'overlang_saved_words';
const STUDY_TIME_KEY = 'overlang_study_minutes';

interface SavedWord {
  id: string;
  word: string;
  originalSentence: string;
  translatedSentence: string;
  timestamp: string;
  date: string;
  lang: string;
  // API 연동 필드
  segmentId?: number;
  textType?: 'ORIGINAL' | 'TRANSLATION';
  meaning?: string;
  relatedWords?: string[];
  matchedExpression?: boolean;
  savedWordId?: number; // API 저장 후 받는 ID
}

// ── 컴포넌트 ───────────────────────────────────────────
export function TranslatePage() {
  const location = useLocation();
  const params = useParams<{ projectId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { videoSrc, targetLanguage } =
    (location.state as { videoSrc?: string; targetLanguage?: string }) ?? {};
  // URL params 우선, state 폴백
  const projectId = params.projectId ? Number(params.projectId) : undefined;

  // 진입 시 상태 확인
  console.log('[OverLang] TranslatePage state:', { videoSrc, projectId, targetLanguage });

  const [activeVideo, setActiveVideo] = useState<string>(videoSrc ?? DEMO_VIDEO);
  const [videoLoading, setVideoLoading] = useState<boolean>(!!projectId && !videoSrc);
  const youtubeId = extractYoutubeId(activeVideo);

  // 영상 재생 시간 추적
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperHeight, setWrapperHeight] = useState(400);
  const ytPlayerRef = useRef<any>(null);
  const ytTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 자막 목록 자동 스크롤 (오른쪽 탭 패널)
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const activeSubtitleRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // 영상 아래 자막 스크롤 (하단 리스트 뷰)
  const bottomSubRef = useRef<HTMLDivElement>(null);
  const bottomItemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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
            // 250ms마다 현재 시간 업데이트 + 구간 반복 처리
            ytTimerRef.current = setInterval(() => {
              if (player && typeof player.getCurrentTime === 'function') {
                const t = player.getCurrentTime();
                setCurrentTime(t);
                const range = repeatRangeRef.current;
                if (range && t >= range.endSec) {
                  player.seekTo(range.startSec, true);
                }
              }
            }, 250);
          },
          onStateChange: (event: any) => {
            // YT.PlayerState.PLAYING = 1, 나머지는 정지로 간주
            setIsPlaying(event.data === 1);
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
    if (!projectId || videoSrc || authLoading || !user) return;
    setVideoLoading(true);
    getVideoPresignedUrl(projectId)
      .then(url => {
        setActiveVideo(url);
        // URL 세팅 후 video 엘리먼트 로드 트리거
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.load();
          }
        }, 100);
      })
      .catch(() => setActiveVideo(DEMO_VIDEO))
      .finally(() => setVideoLoading(false));
  }, [projectId, authLoading, user]);

  // 학습 시간 추적 (진입~이탈 경과 시간 누적)
  useEffect(() => {
    const startTime = Date.now();
    return () => {
      const elapsed = Math.floor((Date.now() - startTime) / 60000);
      if (elapsed > 0) {
        try {
          const prev = parseInt(localStorage.getItem(STUDY_TIME_KEY) ?? '0', 10);
          localStorage.setItem(STUDY_TIME_KEY, String(prev + elapsed));
        } catch { /* ignore */ }
      }
    };
  }, []);

  // API에서 저장된 단어 수 로드 (auth 준비 후)
  useEffect(() => {
    if (authLoading || !user) return;
    getMySavedWords()
      .then(words => {
        setSavedWordsCount(words.length);
        savedWordSetRef.current = new Set(words.map(w => w.word));
      })
      .catch(() => {
        // API 실패 시 localStorage 폴백
        try {
          const local = JSON.parse(localStorage.getItem(SAVED_WORDS_KEY) ?? '[]');
          setSavedWordsCount(local.length);
          savedWordSetRef.current = new Set(local.map((w: SavedWord) => w.word));
        } catch { /* ignore */ }
      });
  }, [authLoading, user]);

  // 구간 반복
  const [repeatRange, setRepeatRange] = useState<{ startSec: number; endSec: number } | null>(null);
  const repeatRangeRef = useRef<{ startSec: number; endSec: number } | null>(null);
  useEffect(() => { repeatRangeRef.current = repeatRange; }, [repeatRange]);

  // 저장 토스트
  const [saveToast, setSaveToast] = useState(false);


  const [isPlaying, setIsPlaying] = useState(false);
  const [showOcr, setShowOcr] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [subtitlePosition, setSubtitlePosition] = useState<'overlay' | 'bottom'>('overlay');
  const [subtitleFontSize, setSubtitleFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [ocrFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('자막');
  const [expandedKeyword, setExpandedKeyword] = useState<number | null>(null);
  const [selectedWord, setSelectedWord] = useState<SavedWord | null>(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const [_savedWordsCount, setSavedWordsCount] = useState<number>(0);
  // 저장 중복 방지용: 저장된 단어 ID 셋
  const savedWordSetRef = useRef<Set<string>>(new Set());
  // 레이스 컨디션 방지: 가장 최신 요청 ID만 결과를 반영
  const explainRequestIdRef = useRef(0);
  const [sentenceData] = useState<{ sentence: string; parts: { text: string; meaning: string; color: string }[]; grammar: string } | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [ocrData, setOcrData] = useState<OcrOverlay[]>([]);
  const [dataLoading, setDataLoading] = useState(!!projectId);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [sourceLang, setSourceLang] = useState<string>('en-US');
  const [targetLang, setTargetLang] = useState<string>('ko-KR');
  const [_currentJobId, setCurrentJobId] = useState<number | null>(null);
  const [learningContents, setLearningContents] = useState<LearningContentsResult | null>(null);

  // 실제 자막/OCR 데이터 로드
  useEffect(() => {
    if (!projectId || authLoading || !user) return;
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

        // sourceLanguage / targetLanguage → BCP47 매핑 저장
        const bcp47 = LANG_TO_BCP47[targetJob.sourceLanguage?.toUpperCase()] ?? 'en-US';
        setSourceLang(bcp47);
        const tBcp47 = LANG_TO_BCP47[targetJob.targetLanguage?.toUpperCase()] ?? 'ko-KR';
        setTargetLang(tBcp47);

        const { jobId } = targetJob;
        setCurrentJobId(jobId);

        // 학습 콘텐츠 로드 (실패해도 무시)
        getLearningContents(jobId)
          .then(data => setLearningContents(data))
          .catch(() => {});

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
            const apiSubtitles: SubtitleItem[] = segments.map((seg: SegmentResult) => ({
              id: seg.segmentId,
              start: secToTimecode(seg.startTime),
              end: secToTimecode(seg.endTime),
              startSec: seg.startTime,
              endSec: seg.endTime,
              original: seg.text,
              translation: cleanTranslation(seg.translatedText, seg.text),
              words: seg.originalWords ?? [],
              translatedWords: seg.translatedWords ?? [],
            }));
            // localStorage에 저장된 수정 내역이 있으면 우선 사용
            const storageKey = `overlang_subtitles_${projectId}`;
            try {
              const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
              if (Array.isArray(saved) && saved.length > 0) {
                setSubtitles(saved);
              } else {
                setSubtitles(apiSubtitles);
              }
            } catch {
              setSubtitles(apiSubtitles);
            }
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
            setOcrData(
              ocrItems
                .filter((item: OcrItemResult) => (item.confidence ?? 1) > 0.3) // 노이즈 필터링
                .map((item: OcrItemResult) => ({
                  id: item.ocrItemId,
                  original: item.originText,
                  translation: cleanTranslation(item.translatedText, item.originText),
                  x: item.boundingBox.x * 100,
                  y: item.boundingBox.y * 100,
                  w: item.boundingBox.w * 100,
                  h: item.boundingBox.h * 100,
                  confidence: item.confidence,
                  lines: item.lines,
                  style: item.style,
                  startSec: item.startTime,
                  endSec: item.endTime,
                }))
            );
          }
        } else {
          console.warn('[OverLang] OCR 로드 실패 (무시):', ocrResult.reason);
        }
      })
      .catch(err => {
        console.error('[OverLang] 데이터 로드 오류:', err);
      })
      .finally(() => setDataLoading(false));
  }, [projectId, authLoading, user]);

  // 현재 재생 시간에 해당하는 자막 계산
  const activeSubtitle = subtitles.find(
    s => currentTime >= s.startSec && currentTime < s.endSec
  ) ?? null;

  // 현재 재생 시간에 해당하는 OCR 필터
  const activeOcr = ocrData.filter(
    o => currentTime >= o.startSec && currentTime < o.endSec
  );

  // 활성 자막으로 자동 스크롤 (오른쪽 패널 - 중앙 정렬)
  useEffect(() => {
    if (!activeSubtitle) return;
    if (activeTab !== '자막') setActiveTab('자막');
    const el = activeSubtitleRefs.current.get(activeSubtitle.id);
    const container = subtitleListRef.current;
    if (el && container) {
      const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
      container.scrollTo({ top, behavior: 'smooth' });
    }
  }, [activeSubtitle?.id]);

  // 활성 자막으로 자동 스크롤 (하단 리스트 - 뷰포트 기준으로 정확히 계산)
  useEffect(() => {
    if (!activeSubtitle) return;
    const el = bottomItemRefs.current.get(activeSubtitle.id);
    const container = bottomSubRef.current;
    if (el && container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // 컨테이너 내 el의 상대 위치 + 현재 스크롤 위치
      const elRelTop = elRect.top - containerRect.top + container.scrollTop;
      const target = elRelTop - container.clientHeight / 2 + el.clientHeight / 2;
      container.scrollTo({ top: target, behavior: 'smooth' });
    }
  }, [activeSubtitle?.id]);

  // 전체화면 인터셉트: video.requestFullscreen을 오버라이드해서
  // 컨테이너 fullscreen으로 리디렉트 (사용자 제스처 컨텍스트 내에서 처리)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const original = video.requestFullscreen.bind(video);
    video.requestFullscreen = (options?: FullscreenOptions) => {
      return videoContainerRef.current?.requestFullscreen(options) ?? original(options);
    };
    return () => {
      video.requestFullscreen = original;
    };
  }, []);

  // fullscreen 상태 추적
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(document.fullscreenElement === videoContainerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // 비디오 래퍼 높이 추적 (fontSizeRatio → px 변환용)
  useEffect(() => {
    const el = videoWrapperRef.current;
    if (!el) return;
    setWrapperHeight(el.offsetHeight);
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height;
      if (h) setWrapperHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 비디오 시간 업데이트 핸들러 (구간 반복 포함)
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const t = videoRef.current.currentTime;
      setCurrentTime(t);
      const range = repeatRangeRef.current;
      if (range && t >= range.endSec) {
        videoRef.current.currentTime = range.startSec;
        videoRef.current.play();
      }
    }
  };


  const handleSaveSubtitles = async () => {
    // projectId 없으면 localStorage 저장 (demo 모드)
    if (!projectId) {
      try {
        localStorage.setItem('overlang_subtitles_demo', JSON.stringify(subtitles));
      } catch { /* ignore */ }
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2000);
      return;
    }
    try {
      const segments = subtitles.map(s => ({
        segmentId: s.id,
        translatedText: s.translation,
      }));
      const result = await updateTranslation(projectId, segments);
      // 응답의 새 segmentWordId로 words 배열 업데이트
      setSubtitles(prev => prev.map(sub => {
        const updated = result.segments.find(s => s.segmentId === sub.id);
        if (!updated) return sub;
        return { ...sub, translation: updated.translatedText, translatedWords: updated.translatedWords ?? sub.translatedWords };
      }));
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2000);
    } catch (err) {
      console.error('[OverLang] 번역 저장 실패:', err);
      alert('번역 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  // 자막 클릭 시 해당 시간으로 이동
  const handleSubtitleClick = (sub: SubtitleItem) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sub.startSec;
      videoRef.current.play();
    } else if (ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(sub.startSec, true);
      ytPlayerRef.current.playVideo();
    }
  };

  // 드래그한 단어와 세그먼트 words 배열을 매칭해 segmentWordId 반환
  const findSegmentWordId = (subtitle: SubtitleItem, selectedText: string, textType: 'ORIGINAL' | 'TRANSLATION' = 'ORIGINAL'): number | null => {
    const pool = textType === 'TRANSLATION' ? (subtitle.translatedWords ?? []) : (subtitle.words ?? []);
    if (pool.length === 0) return null;
    // 구두점 제거 후 소문자 정규화
    const stripPunct = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase().trim();
    const normalized = stripPunct(selectedText);
    // 완전 일치 우선 (구두점 제거 후)
    const exact = pool.find(w => stripPunct(w.word) === normalized);
    if (exact) return exact.segmentWordId;
    // 포함 관계로 폴백
    const contains = pool.find(
      w => stripPunct(w.word).includes(normalized) || normalized.includes(stripPunct(w.word))
    );
    return contains ? contains.segmentWordId : null;
  };

  // 단어 클릭 선택 (자막 목록에서 단어 토큰 클릭)
  const handleWordClick = async (
    subtitle: SubtitleItem,
    word: string,
    textType: 'ORIGINAL' | 'TRANSLATION' = 'ORIGINAL',
  ) => {
    const cleaned = word.replace(/[^\p{L}\p{N}''-]/gu, '').trim();
    if (!cleaned || cleaned.length < 2) return;

    const translatedSentence = subtitle.translation ?? '';
    const segmentWordId = findSegmentWordId(subtitle, cleaned, textType) ?? undefined;

    const wordData: SavedWord = {
      id: `${Date.now()}_${cleaned}`,
      word: cleaned,
      originalSentence: subtitle.original,
      translatedSentence,
      timestamp: subtitle.start,
      date: new Date().toLocaleDateString('ko-KR'),
      lang: textType === 'ORIGINAL' ? sourceLang : targetLang,
      segmentId: segmentWordId,
      textType,
    };
    setSelectedWord(wordData);
    setWordError(null);
    setRightPanel('word');
    setActiveTab('자막');

    const requestId = ++explainRequestIdRef.current;
    setWordLoading(true);
    try {
      const result = await explainWord({
        segmentId: subtitle.id,
        word: cleaned,
        selectedTextType: textType,
        originalSentence: subtitle.original,
        translatedSentence,
        sourceLanguage: sourceLang.split('-')[0].toUpperCase(),
        targetLanguage: targetLang.split('-')[0].toUpperCase(),
      });
      if (requestId !== explainRequestIdRef.current) return;
      setSelectedWord(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          // matchedExpression=true이면 API가 준 word(전체 표현)로 교체
          word: result.matchedExpression && result.word ? result.word : prev.word,
          meaning: result.meaning,
          relatedWords: result.relatedWords,
          matchedExpression: result.matchedExpression,
        };
      });
    } catch (err) {
      if (requestId !== explainRequestIdRef.current) return;
      setWordError('단어 분석에 실패했습니다. 찜하기는 여전히 가능합니다.');
    } finally {
      if (requestId === explainRequestIdRef.current) setWordLoading(false);
    }
  };

  // 단어 드래그 선택 (lang: 드래그한 텍스트의 언어, textType: 원문/번역 구분, fieldText: 실제 드래그한 필드의 전체 텍스트)
  const handleTextSelect = async (
    subtitle: SubtitleItem,
    lang: string,
    textType: 'ORIGINAL' | 'TRANSLATION' = 'ORIGINAL',
    fieldText?: string,
  ) => {
    const selection = window.getSelection();
    const word = selection?.toString().trim();
    if (!word || word.length < 2) return;

    // translatedSentence: 실제 드래그한 필드 텍스트 우선, 없으면 translation 폴백
    const translatedSentence = fieldText ?? subtitle.translation ?? '';

    // words 배열에서 실제 segmentWordId 찾기 (원문/번역 구분)
    console.log('[OverLang] 드래그된 단어:', word, '| textType:', textType);
    console.log('[OverLang] subtitle.words:', subtitle.words);
    console.log('[OverLang] subtitle.translatedWords:', subtitle.translatedWords);
    const segmentWordId = findSegmentWordId(subtitle, word, textType) ?? undefined;
    console.log('[OverLang] segmentWordId:', segmentWordId);

    const wordData: SavedWord = {
      id: `${Date.now()}_${word}`,
      word,
      originalSentence: subtitle.original,
      translatedSentence,
      timestamp: subtitle.start,
      date: new Date().toLocaleDateString('ko-KR'),
      lang,
      segmentId: segmentWordId,
      textType,
    };
    setSelectedWord(wordData);
    setWordError(null);
    setRightPanel('word');
    setActiveTab('자막');

    // TRANSLATION 타입인데 translatedSentence가 비어있으면 API 호출 불가
    if (textType === 'TRANSLATION' && !translatedSentence.trim()) {
      setWordError('번역문이 없어 분석할 수 없습니다. 찜하기는 여전히 가능합니다.');
      setWordLoading(false);
      return;
    }

    // API: 단어 뜻 + 관련 단어 분석
    const requestId = ++explainRequestIdRef.current;
    setWordLoading(true);
    try {
      const result = await explainWord({
        segmentId: subtitle.id,
        word,
        selectedTextType: textType,
        originalSentence: subtitle.original,
        translatedSentence,
        sourceLanguage: sourceLang.split('-')[0].toUpperCase(),
        targetLanguage: targetLang.split('-')[0].toUpperCase(),
      });
      // 이 요청이 가장 최신인 경우에만 결과 반영 (레이스 컨디션 방지)
      if (requestId !== explainRequestIdRef.current) return;
      setSelectedWord(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          // matchedExpression=true이면 API가 준 word(전체 표현)로 교체
          word: result.matchedExpression && result.word ? result.word : prev.word,
          meaning: result.meaning,
          relatedWords: result.relatedWords,
          matchedExpression: result.matchedExpression,
        };
      });
    } catch (err) {
      if (requestId !== explainRequestIdRef.current) return;
      console.error('[OverLang] 단어 분석 실패:', err);
      setWordError('단어 분석에 실패했습니다. 찜하기는 여전히 가능합니다.');
    } finally {
      if (requestId === explainRequestIdRef.current) setWordLoading(false);
    }
  };

  // 단어 API 저장
  const handleSaveWord = async () => {
    if (!selectedWord) return;
    if (savedWordSetRef.current.has(selectedWord.word)) {
      alert('이미 저장된 단어입니다.');
      return;
    }
    if (!selectedWord.segmentId) {
      alert('단어를 하나씩 정확히 선택해 주세요.');
      return;
    }
    setSavedSuccess(false);
    try {
      const result = await saveWord({
        segmentWordId: selectedWord.segmentId,
        word: selectedWord.word,
        matchedExpression: selectedWord.matchedExpression,
        meaning: selectedWord.meaning ?? '',
        contextMeaning: selectedWord.originalSentence,
        memo: '',
      });
      savedWordSetRef.current.add(selectedWord.word);
      setSelectedWord(prev => prev ? { ...prev, savedWordId: result.savedWordId } : prev);
      setSavedWordsCount(prev => prev + 1);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error('[OverLang] 단어 저장 실패:', err);
      alert('단어 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  // 자막 수정
  const handleSubtitleChange = (id: number, field: 'original' | 'translation' | 'paraphrase', value: string) => {
    setSubtitles(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleDeleteSubtitle = (id: number) => {
    setSubtitles(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">

      {/* ── 상단 헤더 ── */}
      <Header fluid />

      {/* ── 본문 (3단 레이아웃) ── */}
      <div className="flex flex-1 overflow-hidden px-16 pt-3">

        {/* ── 왼쪽: 영상 영역 ── */}
        <div className="flex flex-col w-[55%] border-r border-slate-200 overflow-hidden shrink-0">
          {/* 영상 플레이어 */}
          {/* 외부 컨테이너: fullscreen 시 화면 전체 + 중앙 정렬 */}
          <div
            ref={videoContainerRef}
            className={`bg-black w-full${isFullscreen ? ' flex items-center justify-center' : ''}`}
          >
            {/* 내부 래퍼: 비디오와 OCR이 항상 같은 크기를 공유 */}
            {/* fullscreen 시 aspect-ratio + max 제약으로 contain 동작 */}
            <div
              ref={videoWrapperRef}
              className={`relative w-full overflow-hidden${isFullscreen ? ' aspect-video max-h-screen max-w-[100vw]' : ''}`}
              style={isFullscreen ? undefined : { height: 'calc((100vh - 53px) * 2 / 3)' }}
            >
            {videoLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
              </div>
            ) : youtubeId ? (
              <div id="yt-player" className="w-full h-full" />
            ) : (
              <video
                ref={videoRef}
                className={isFullscreen ? 'w-full h-full object-contain' : 'w-full h-full object-contain'}
                controls
                src={activeVideo}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            )}

            {/* OCR 오버레이 - 재생 중일 때만 표시 */}
            {showOcr && isPlaying && activeOcr.map(ocr => {
              if (!ocr.translation) return null;
              const fontSizeRatio = ocr.style?.fontSizeRatio;
              // API는 대문자 'BOLD'/'NORMAL', CSS는 소문자 필요
              const fontWeight = (ocr.style?.fontWeight ?? 'BOLD').toLowerCase();
              // API는 대문자 'LEFT'/'CENTER'/'RIGHT', CSS는 소문자 필요
              const textAlignRaw = ocr.style?.textAlign ?? 'LEFT';
              const textAlign = textAlignRaw.toLowerCase() as 'left' | 'center' | 'right';
              const animationType = ocr.style?.animation?.type ?? 'NONE';
              // fontSizeRatio: 영상 높이 대비 글자 크기 비율 → 실제 px 변환
              // sizeMultiplier: 사용자 폰트 크기 설정 반영
              const sizeMultiplier = ocrFontSize === 'small' ? 0.75 : ocrFontSize === 'large' ? 1.3 : 1.0;
              const fontSize = fontSizeRatio != null
                ? `${Math.round(wrapperHeight * fontSizeRatio * sizeMultiplier)}px`
                : ocrFontSize === 'small' ? '11px' : ocrFontSize === 'large' ? '20px' : '14px';
              const textColor = ocr.style?.textColor ?? '#ffffff';
              const bgColor = ocr.style?.backgroundColor ?? ocr.style?.dominantBackgroundColor ?? 'rgba(0,0,0,0.55)';
              const blurRegion = ocr.style?.blurRegion;

              const textStyle: React.CSSProperties = {
                fontSize,
                fontWeight,
                textAlign,
                whiteSpace: 'pre-line',
                lineHeight: 1.2,
                letterSpacing: '-0.01em',
                color: textColor,
              };

              return (
                <div key={ocr.id} className="contents">
                  {/* blurRegion: 원본 영상 배경을 블러 처리하는 레이어 */}
                  {blurRegion && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: `${blurRegion.x * 100}%`,
                        top: `${blurRegion.y * 100}%`,
                        width: `${blurRegion.w * 100}%`,
                        height: `${blurRegion.h * 100}%`,
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        // dominantBackgroundColor가 있으면 우선 사용 (영상과 가장 비슷한 배경색)
                        backgroundColor: ocr.style?.dominantBackgroundColor
                          ? `${ocr.style.dominantBackgroundColor}cc`
                          : `${bgColor}aa`,
                      }}
                    />
                  )}
                  {/* 번역 텍스트 오버레이 */}
                  <div
                    className="absolute"
                    style={{
                      left: `${ocr.x}%`,
                      top: `${ocr.y}%`,
                      width: `${ocr.w}%`,
                      minHeight: `${ocr.h}%`,
                      overflow: 'visible',
                      pointerEvents: 'none',
                      backgroundColor: blurRegion ? 'transparent' : bgColor,
                      ...(!blurRegion ? { backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' } : {}),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
                      padding: '2px 5px',
                    }}
                  >
                    {animationType === 'TYPEWRITER' ? (
                      <TypingOcrText
                        text={ocr.translation}
                        durationSec={ocr.style?.animation ? ocr.style.animation.endTime - ocr.style.animation.startTime : ocr.endSec - ocr.startSec}
                        style={textStyle}
                      />
                    ) : (
                      <p className="w-full leading-tight" style={textStyle}>
                        {ocr.translation}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 구간 반복 표시 */}
            {repeatRange && (
              <div className="absolute bottom-14 left-0 right-0 flex justify-center pointer-events-none">
                <div className="flex items-center gap-1.5 bg-blue-600/80 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm pointer-events-auto">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                  </svg>
                  <span>반복 구간: {secToTimecode(repeatRange.startSec)} ~ {secToTimecode(repeatRange.endSec)}</span>
                  <button
                    onClick={() => setRepeatRange(null)}
                    className="ml-1 hover:text-blue-200 transition-colors"
                  >×</button>
                </div>
              </div>
            )}


            {/* 영상 안 자막 오버레이 (subtitlePosition === 'overlay') */}
            {showSubtitle && subtitlePosition === 'overlay' && activeSubtitle && (() => {
              // OCR 아이템이 하단 영역(y+h > 70%)에 걸칠 때만 자막을 상단으로 이동
              const ocrBlocksBottom = showOcr && activeOcr.some(o => (o.y + o.h) > 70);
              return (
              <div
                className={`absolute left-0 right-0 flex justify-center px-4 pointer-events-none transition-all ${
                  ocrBlocksBottom ? 'top-5' : 'bottom-8'
                }`}
              >
                <div className="bg-black/65 backdrop-blur-[2px] rounded-lg px-4 py-2 max-w-[90%] text-center">
                  <p className={`text-white font-semibold leading-snug ${
                    subtitleFontSize === 'small' ? 'text-xs' : subtitleFontSize === 'large' ? 'text-base' : 'text-sm'
                  }`}>
                    {activeSubtitle.translation || activeSubtitle.original}
                  </p>
                </div>
              </div>
              );
            })()}

            {/* 현재 재생 시간 표시 */}
            {!youtubeId && (
              <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded font-mono">
                {secToTimecode(currentTime)}
              </div>
            )}
            </div>{/* 내부 래퍼 끝 */}
          </div>{/* 외부 컨테이너 끝 */}

          {/* ── 영상 컨트롤 바 ── */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-t border-slate-100 bg-slate-50 shrink-0 flex-wrap">

            {/* 자막 ON/OFF */}
            <button
              onClick={() => setShowSubtitle(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showSubtitle ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              자막
            </button>

            {/* OCR ON/OFF */}
            <button
              onClick={() => setShowOcr(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showOcr ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-400'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              OCR
            </button>

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* 자막 위치 */}
            <div className="flex items-center rounded-lg bg-slate-200 p-0.5 gap-0.5">
              <button
                onClick={() => setSubtitlePosition('overlay')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  subtitlePosition === 'overlay' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                영상 안
              </button>
              <button
                onClick={() => setSubtitlePosition('bottom')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  subtitlePosition === 'bottom' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                영상 아래
              </button>
            </div>

            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* 자막 폰트 크기 */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-medium mr-0.5 bg-emerald-50 text-emerald-600 rounded px-1.5 py-0.5">자막</span>
              {(['small', 'medium', 'large'] as const).map(size => (
                <button
                  key={size}
                  onClick={() => setSubtitleFontSize(size)}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                    subtitleFontSize === size ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {size === 'small' ? '작게' : size === 'medium' ? '중간' : '크게'}
                </button>
              ))}
            </div>

          </div>

          {/* 자막 전체 스크롤 리스트 */}
          {showSubtitle && subtitlePosition === 'bottom' && (
            <div
              ref={bottomSubRef}
              className="flex-1 overflow-y-auto border-t border-slate-100"
            >
              {/* 상단 여백: 첫 자막이 중앙에 올 수 있게 */}
              <div style={{ height: '50%' }} />
              {subtitles.map((sub, idx) => {
                const isActive = sub.id === activeSubtitle?.id;
                const activeIdx = activeSubtitle ? subtitles.findIndex(s => s.id === activeSubtitle.id) : -1;
                const distance = Math.abs(idx - activeIdx);
                const opacity = isActive ? 1 : distance === 1 ? 0.45 : distance === 2 ? 0.25 : 0.15;
                return (
                  <div
                    key={sub.id}
                    ref={el => {
                      if (el) bottomItemRefs.current.set(sub.id, el);
                      else bottomItemRefs.current.delete(sub.id);
                    }}
                    onClick={() => handleSubtitleClick(sub)}
                    className={`px-6 cursor-pointer transition-all duration-300 ${
                      isActive ? 'py-4' : 'py-2.5'
                    }`}
                    style={{ opacity }}
                  >
                    <p className={`leading-snug transition-all duration-300 ${
                      isActive ? 'text-base font-semibold text-emerald-600' : 'text-sm text-slate-500'
                    }`}>
                      {sub.translation || sub.original}
                    </p>
                  </div>
                );
              })}
              {/* 하단 여백 */}
              <div style={{ height: '50%' }} />
            </div>
          )}
        </div>

        {/* ── 오른쪽: 탭 패널 ── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* 탭 헤더 */}
          <div className="flex items-center border-b border-slate-200 shrink-0 px-2 bg-white">
            {(['요약', '자막', '관용표현'] as ActiveTab[]).map((tab) => {
              const labels: Record<ActiveTab, string> = { '요약': '영상 요약', '자막': '자막 목록', '관용표현': '관용 표현' };
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-xs font-semibold transition-colors border-b-2 ${
                    isActive
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* ── ① 영상 요약 ── */}
          {activeTab === '요약' && (
            <div className="flex-1 overflow-y-auto">
              {!learningContents ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                    <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500 font-medium">학습 콘텐츠가 없습니다</p>
                  <p className="text-xs text-slate-400">AI 분석이 완료된 영상에서 확인할 수 있어요</p>
                </div>
              ) : !learningContents.summary ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                  <p className="text-sm text-slate-400">요약 데이터가 없습니다</p>
                </div>
              ) : (
                <div className="px-4 pt-4 pb-2">
                  {/* 섹션 헤더 */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 shrink-0">
                      <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-slate-800">AI 영상 요약</p>
                  </div>

                  {/* 요약 본문 박스 */}
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3.5 mb-3">
                    <p className="text-xs font-bold text-emerald-700 mb-2">📋 영상 요약</p>
                    <div className="space-y-2">
                      {learningContents.summary.content.split(/\n+/).filter(Boolean).map((para, i) => (
                        <p key={i} className="text-xs text-slate-600 leading-relaxed">{para}</p>
                      ))}
                    </div>
                  </div>

                  {/* 하단 메타 */}
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 px-1">
                    <svg className="h-3 w-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    AI가 영상 자막을 분석하여 자동 생성 · {learningContents.summary.content.length}자
                  </p>
                </div>
              )}

              {/* ── 빈출 단어 ── */}
              {learningContents && learningContents.keywords.length > 0 && (
                <div className="border-t border-slate-100 mt-3">
                  <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700">빈출 단어</p>
                    <span className="text-[10px] text-slate-400">{learningContents.keywords.length}개 · 클릭 시 해당 구간 이동</span>
                  </div>
                  <div className="px-4 pb-4 flex flex-col gap-2">
                    {learningContents.keywords.map((kw) => {
                      const isExpanded = expandedKeyword === kw.learningContentId;
                      return (
                        <div key={kw.learningContentId} className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors"
                            onClick={() => setExpandedKeyword(isExpanded ? null : kw.learningContentId)}
                          >
                            <span className="flex-1 text-left text-sm font-bold text-amber-600">{kw.title}</span>
                            {kw.startTime != null && (
                              <button
                                className="flex items-center gap-1 text-[10px] font-mono bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-2 py-0.5 rounded-full shrink-0 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (videoRef.current) { videoRef.current.currentTime = kw.startTime!; videoRef.current.play(); }
                                  else if (ytPlayerRef.current) { ytPlayerRef.current.seekTo(kw.startTime!, true); }
                                }}
                              >
                                <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                {secToTimecode(kw.startTime)}
                              </button>
                            )}
                            <svg className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3">
                              <div className="rounded-lg bg-slate-50 px-3 py-2 border border-slate-100">
                                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{kw.content?.replace(/(?<!\n)\[/g, '\n[').trimStart()}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ② 자막 목록 (단어/문장 선택 시 분할) ── */}
          {activeTab === '자막' && (
            <div className="flex flex-1 overflow-hidden">

              {/* 자막 목록 */}
              <div className={`flex flex-col ${rightPanel ? 'w-1/2 border-r border-slate-200' : 'w-full'} overflow-hidden`}>
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 shrink-0 h-[41px]">
                  <p className="text-xs font-bold text-slate-600">
                    {dataLoading ? '불러오는 중...' : `${subtitles.length}개의 자막`}
                  </p>
                  <button
                    onClick={handleSaveSubtitles}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      saveToast ? 'bg-emerald-500 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                    }`}
                  >
                    {saveToast ? (
                      <>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        저장 완료
                      </>
                    ) : (
                      <>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        저장
                      </>
                    )}
                  </button>
                </div>

                <div ref={subtitleListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                  {dataLoading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                      <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
                      <p className="text-xs text-slate-400">AI 자막 불러오는 중...</p>
                    </div>
                  )}
                  {!dataLoading && subtitles.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                      <p className="text-sm text-slate-500">자막이 없습니다</p>
                    </div>
                  )}
                  {subtitles.map((sub, idx) => {
                    const isActive = sub.id === activeSubtitle?.id;
                    const activeIdx = activeSubtitle ? subtitles.findIndex(s => s.id === activeSubtitle.id) : -1;
                    const distance = Math.abs(idx - activeIdx);
                    const opacity = activeIdx === -1 ? 1 : isActive ? 1 : distance === 1 ? 0.55 : distance === 2 ? 0.35 : 0.2;
                    return (
                      <div
                        key={sub.id}
                        ref={el => {
                          if (el) activeSubtitleRefs.current.set(sub.id, el);
                          else activeSubtitleRefs.current.delete(sub.id);
                        }}
                        className={`rounded-xl border p-3 transition-all cursor-pointer ${
                          isActive ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                        }`}
                        style={{ opacity, transition: 'opacity 0.3s ease' }}
                        onClick={() => handleSubtitleClick(sub)}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${isActive ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{sub.start}</span>
                          <span className="text-xs text-slate-400">→</span>
                          <span className={`text-xs font-mono px-2 py-0.5 rounded ${isActive ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{sub.end}</span>
                          <button onClick={e => { e.stopPropagation(); handleDeleteSubtitle(sub.id); }} className="ml-auto text-red-300 hover:text-red-500 transition-colors shrink-0">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        <p className="text-[10px] font-semibold text-slate-400 mb-1">원문 <span className="font-normal text-slate-300">(단어 클릭 or 드래그)</span></p>
                        <div
                          onMouseUp={() => handleTextSelect(sub, sourceLang, 'ORIGINAL', sub.original)}
                          className="w-full text-xs border border-slate-100 rounded-lg px-2 py-1.5 mb-2 leading-relaxed text-slate-500 bg-slate-50 flex flex-wrap"
                        >
                          {sub.original ? (
                            // 백엔드 토크나이저 결과 우선 사용 (일본어/중국어 형태소 분석 지원)
                            // words가 없으면 공백 분리 폴백
                            (() => {
                              // 현재 자막이 선택된 단어/표현의 출처인지 확인
                              const isSelectedSub = selectedWord?.originalSentence === sub.original;

                              // 관용표현: 표현 전체를 하나의 하이라이트로 렌더링
                              if (isSelectedSub && selectedWord?.matchedExpression && selectedWord.word) {
                                const escaped = selectedWord.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const parts = sub.original.split(new RegExp(`(${escaped})`, 'i'));
                                return parts.map((part, i) =>
                                  part.toLowerCase() === selectedWord.word.toLowerCase()
                                    ? <mark key={i} className="bg-amber-100 text-amber-800 rounded px-0.5 not-italic">{part}</mark>
                                    : <span key={i}>{part}</span>
                                );
                              }

                              // 단일 단어 하이라이트
                              const getTokenHighlight = (token: string): string => {
                                if (!isSelectedSub || !selectedWord) return '';
                                return selectedWord.word === token
                                  ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                                  : '';
                              };

                              return sub.words && sub.words.length > 0
                                ? sub.words.map((w, i) => (
                                    <span
                                      key={w.segmentWordId ?? i}
                                      onClick={e => { e.stopPropagation(); handleWordClick(sub, w.word, 'ORIGINAL'); }}
                                      className={`cursor-pointer rounded px-0.5 hover:bg-emerald-100 hover:text-emerald-700 transition-colors ${getTokenHighlight(w.word)}`}
                                    >
                                      {w.word}
                                    </span>
                                  ))
                                : sub.original.split(/(\s+)/).map((token, i) => {
                                    const isSpace = /^\s+$/.test(token);
                                    if (isSpace) return <span key={i}>&nbsp;</span>;
                                    return (
                                      <span
                                        key={i}
                                        onClick={e => { e.stopPropagation(); handleWordClick(sub, token, 'ORIGINAL'); }}
                                        className={`cursor-pointer rounded px-0.5 hover:bg-emerald-100 hover:text-emerald-700 transition-colors ${getTokenHighlight(token)}`}
                                      >
                                        {token}
                                      </span>
                                    );
                                  });
                            })()
                          ) : (
                            <span className="text-slate-300">원문 없음</span>
                          )}
                        </div>
                        <p className="text-[10px] font-semibold text-emerald-600 mb-1">번역</p>
                        <AutoTextarea
                          value={sub.translation}
                          onChange={e => handleSubtitleChange(sub.id, 'translation', e.target.value)}
                          onMouseUp={() => handleTextSelect(sub, targetLang, 'TRANSLATION', sub.translation)}
                          onClick={e => e.stopPropagation()}
                          placeholder="번역문을 입력하세요"
                          className={`w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none mb-2 transition-colors placeholder-slate-300 ${
                            isActive ? 'text-slate-800 border-emerald-200 bg-white focus:border-emerald-400' : 'text-slate-700 border-slate-200 bg-white focus:border-emerald-400'
                          }`}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const on = repeatRange?.startSec === sub.startSec;
                              setRepeatRange(on ? null : { startSec: sub.startSec, endSec: sub.endSec });
                              if (!on) {
                                if (videoRef.current) { videoRef.current.currentTime = sub.startSec; videoRef.current.play(); }
                                else if (ytPlayerRef.current) { ytPlayerRef.current.seekTo(sub.startSec, true); }
                              }
                            }}
                            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${repeatRange?.startSec === sub.startSec ? 'text-blue-600' : 'text-blue-400 hover:text-blue-600'}`}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {repeatRange?.startSec === sub.startSec ? '반복 중' : '구간 반복'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 단어 해설 / 문장 분석 패널 (분할 뷰) */}
              {rightPanel && (
                <div className="w-1/2 flex flex-col overflow-hidden border-l border-slate-200">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 shrink-0 h-[41px]">
                    <p className="text-xs font-bold text-slate-600">
                      {rightPanel === 'word' ? '단어 해설' : '문장 분석'}
                    </p>
                    <button onClick={() => setRightPanel(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 py-3">

                    {/* 단어 해설 */}
                    {rightPanel === 'word' && selectedWord && (
                      <div className="space-y-3">
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
                          {selectedWord.matchedExpression && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 mb-2">
                              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              관용 표현
                            </span>
                          )}
                          <p className="text-xl font-extrabold text-emerald-700">{selectedWord.word}</p>
                          <p className="text-xs text-emerald-400 mt-1 font-mono">{selectedWord.timestamp}</p>
                          <button
                            onClick={() => {
                              window.speechSynthesis.cancel();
                              setTimeout(() => {
                                const utter = new SpeechSynthesisUtterance(selectedWord.word);
                                utter.lang = selectedWord.lang; utter.rate = 0.9;
                                if (window.speechSynthesis.paused) window.speechSynthesis.resume();
                                window.speechSynthesis.speak(utter);
                              }, 100);
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-600 text-xs font-medium"
                          >
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                            </svg>
                            발음 듣기
                          </button>
                        </div>
                        {wordLoading ? (
                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full border-2 border-emerald-200 border-t-emerald-500 animate-spin shrink-0" />
                            <p className="text-xs text-slate-400">AI 분석 중...</p>
                          </div>
                        ) : wordError ? (
                          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
                            <p className="text-xs text-red-500">{wordError}</p>
                          </div>
                        ) : selectedWord.meaning ? (
                          <div className="space-y-2">
                            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1">AI 분석 뜻</p>
                              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                                {selectedWord.meaning.replace(/(?<!^)\[/gm, '\n[')}
                              </p>
                            </div>
                            {selectedWord.relatedWords && selectedWord.relatedWords.length > 0 && (
                              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">관련 단어</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedWord.relatedWords.map((rw, i) => (
                                    <span key={i} onClick={() => { window.speechSynthesis.cancel(); setTimeout(() => { const u = new SpeechSynthesisUtterance(rw); u.lang = selectedWord.lang; u.rate = 0.9; if (window.speechSynthesis.paused) window.speechSynthesis.resume(); window.speechSynthesis.speak(u); }, 100); }} className="cursor-pointer text-xs px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 hover:bg-emerald-100 transition-colors">{rw}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                        <div className="rounded-xl bg-slate-50 p-3 space-y-1.5">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">원문 문장</p>
                          <p className="text-xs text-slate-700 leading-relaxed">
                            {selectedWord.originalSentence.split(new RegExp(`(${selectedWord.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i')).map((part, i) =>
                              part.toLowerCase() === selectedWord.word.toLowerCase()
                                ? <mark key={i} className={`rounded px-0.5 not-italic ${selectedWord.matchedExpression ? 'bg-amber-200 text-amber-900' : 'bg-yellow-200 text-yellow-900'}`}>{part}</mark>
                                : part
                            )}
                          </p>
                          {selectedWord.translatedSentence && (
                            <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-1.5 mt-1.5">{selectedWord.translatedSentence}</p>
                          )}
                        </div>
                        <button
                          onClick={handleSaveWord}
                          disabled={savedSuccess}
                          className={`w-full rounded-xl px-3 py-2.5 text-xs font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-70 ${savedSuccess ? 'bg-emerald-500 text-white' : 'bg-orange-500 hover:bg-orange-400 text-white'}`}
                        >
                          {savedSuccess ? (
                            <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>저장 완료!</>
                          ) : (
                            <><svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>학습 노트에 저장</>
                          )}
                        </button>
                      </div>
                    )}

                    {/* 문장 분석 */}
                    {rightPanel === 'sentence' && sentenceData && (
                      <div className="space-y-3">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[10px] font-semibold text-slate-400 mb-1.5">분석 문장</p>
                          <p className="text-xs font-medium text-slate-800 leading-relaxed">{sentenceData.sentence}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 mb-1.5">의미 단위 분해</p>
                          <div className="space-y-1.5">
                            {sentenceData.parts.map((part, i) => (
                              <div key={i} className={`rounded-lg px-3 py-2 ${part.color}`}>
                                <p className="text-xs font-semibold">{part.text}</p>
                                <p className="text-[10px] mt-0.5 opacity-80">{part.meaning}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-xl bg-amber-50 p-3">
                          <p className="text-[10px] font-semibold text-amber-600 mb-1.5">문법 해설</p>
                          <p className="text-xs text-slate-600 leading-relaxed">{sentenceData.grammar}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ③ 관용 표현 ── */}
          {activeTab === '관용표현' && (
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {!learningContents || learningContents.expressions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                    <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500 font-medium">관용 표현이 없습니다</p>
                  <p className="text-xs text-slate-400">AI 분석이 완료된 영상에서 확인할 수 있어요</p>
                </div>
              ) : (() => {
                  const origExpressions = learningContents.expressions.filter(
                    ex => !ex.textType || ex.textType === 'ORIGINAL'
                  );
                  return (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <p className="text-xs font-bold text-slate-700">관용 표현</p>
                    <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{origExpressions.length}개</span>
                  </div>
                  {origExpressions.map((ex) => (
                    <div
                      key={ex.learningContentId}
                      className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden cursor-pointer hover:border-emerald-300 hover:shadow-emerald-100/50 transition-all group"
                      onClick={() => {
                        if (ex.startTime != null) {
                          if (videoRef.current) { videoRef.current.currentTime = ex.startTime; videoRef.current.play(); }
                          else if (ytPlayerRef.current) { ytPlayerRef.current.seekTo(ex.startTime, true); }
                        }
                      }}
                    >
                      {/* 표현 제목 + 타임코드 */}
                      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
                        <p className="flex-1 text-sm font-bold text-slate-800 italic leading-snug">
                          "{ex.title}"
                        </p>
                        {ex.startTime != null && (
                          <span className="flex items-center gap-1 text-[10px] font-mono bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 px-2 py-0.5 rounded-full shrink-0 transition-colors">
                            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                            {secToTimecode(ex.startTime)}
                          </span>
                        )}
                      </div>
                      {/* 직역 / 실제 의미 */}
                      {ex.content && (() => {
                        const sections = ex.content.split(/(?=\[)/).filter(Boolean);
                        return (
                          <div className="px-3.5 pb-3 pt-0 space-y-1.5">
                            {sections.map((part, i) => {
                              const m = part.match(/^\[(.+?)\]\s*([\s\S]*)/);
                              if (!m) return <p key={i} className="text-xs text-slate-500 leading-relaxed">{part.trim()}</p>;
                              return (
                                <div key={i} className="rounded-lg bg-slate-50 px-3 py-2 border border-slate-100">
                                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">{m[1]}</p>
                                  <p className="text-xs text-slate-700 leading-relaxed">{m[2].trim()}</p>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
                  );
                })()}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

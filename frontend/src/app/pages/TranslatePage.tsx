import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { getVideoPresignedUrl, getProjectJobs, getSegments, getOcrItems, updateTranslation, getLearningContents, retryJob } from '@/api/video';
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

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);

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
type ActiveTab = '요약' | '자막' | '빈출단어' | '관용표현';

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
  const navigate = useNavigate();
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
      .then(url => setActiveVideo(url))
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
  const [retrying, setRetrying] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showOcr, setShowOcr] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('자막');
  const [selectedWord, setSelectedWord] = useState<SavedWord | null>(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);
  const [savedWordsCount, setSavedWordsCount] = useState<number>(0);
  // 저장 중복 방지용: 저장된 단어 ID 셋
  const savedWordSetRef = useRef<Set<string>>(new Set());
  // 레이스 컨디션 방지: 가장 최신 요청 ID만 결과를 반영
  const explainRequestIdRef = useRef(0);
  const [sentenceData, setSentenceData] = useState<{ sentence: string; parts: { text: string; meaning: string; color: string }[]; grammar: string } | null>(null);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>(() => {
    // demo 모드: projectId 없을 때 localStorage 확인
    try {
      const saved = JSON.parse(localStorage.getItem('overlang_subtitles_demo') ?? 'null');
      if (Array.isArray(saved) && saved.length > 0) return saved;
    } catch { /* ignore */ }
    return MOCK_SUBTITLES;
  });
  const [ocrData, setOcrData] = useState<OcrOverlay[]>(MOCK_OCR);
  const [dataLoading, setDataLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [sourceLang, setSourceLang] = useState<string>('en-US');
  const [targetLang, setTargetLang] = useState<string>('ko-KR');
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
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

  // 저장 핸들러
  const handleRetry = async () => {
    if (!projectId || retrying) return;
    if (!window.confirm('영상을 다시 분석합니다. 계속할까요?')) return;
    setRetrying(true);
    try {
      const result = await retryJob(projectId);
      navigate('/processing', {
        state: { jobId: result.jobId, projectId, videoSrc, targetLanguage },
      });
    } catch {
      alert('재처리 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setRetrying(false);
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
      setSelectedWord(prev =>
        prev ? { ...prev, meaning: result.meaning, relatedWords: result.relatedWords, matchedExpression: result.matchedExpression } : prev,
      );
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
      setSelectedWord(prev =>
        prev ? { ...prev, meaning: result.meaning, relatedWords: result.relatedWords, matchedExpression: result.matchedExpression } : prev,
      );
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

  // 문장 구조 분석
  const handleSentenceAnalysis = (subtitle: SubtitleItem) => {
    setSentenceData({
      sentence: subtitle.original,
      parts: getMockSentenceParts(subtitle.original),
      grammar: getMockGrammar(subtitle.original),
    });
    setRightPanel('sentence');
    setActiveTab('자막');
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
  const handleSubtitleChange = (id: number, field: 'original' | 'translation' | 'paraphrase', value: string) => {
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
      words: [],
    }]);
  };

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">

      {/* ── 상단 헤더 ── */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
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
            학습 노트 ({savedWordsCount})
          </button>
          <button
            onClick={handleSaveSubtitles}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              saveToast ? 'bg-emerald-500 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {saveToast ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                저장 완료
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                저장
              </>
            )}
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            공유하기
          </button>
        </div>
      </header>

      {/* ── 본문 (3단 레이아웃) ── */}
      <div className="flex flex-1 overflow-hidden">

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
              className={`relative w-full${isFullscreen ? ' aspect-video max-h-screen max-w-[100vw]' : ''}`}
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
            {showOcr && isPlaying && activeOcr.map(ocr => (
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
            </div>{/* 내부 래퍼 끝 */}
          </div>{/* 외부 컨테이너 끝 */}

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

          {/* 자막 전체 스크롤 리스트 */}
          {showSubtitle && (
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
            {(['요약', '자막', '빈출단어', '관용표현'] as ActiveTab[]).map((tab, i) => {
              const labels: Record<ActiveTab, string> = { '요약': '① 영상 요약', '자막': '② 자막 목록', '빈출단어': '③ 빈출 단어', '관용표현': '④ 관용 표현' };
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
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
                    <svg className="h-7 w-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
                <div>
                  {/* 헤더 배너 */}
                  <div className="bg-gradient-to-br from-violet-500 to-purple-600 px-5 pt-5 pb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold tracking-widest text-violet-200 uppercase">AI Summary</span>
                      <span className="flex items-center gap-1 text-[10px] text-violet-300 bg-white/10 rounded-full px-2 py-0.5">
                        <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        영상 기반 요약
                      </span>
                    </div>
                    <p className="text-white font-bold text-base leading-snug">영상 핵심 내용 요약</p>
                    <p className="text-violet-200 text-xs mt-1">
                      {learningContents.summary.content.length}자 · 약 {Math.ceil(learningContents.summary.content.length / 200)}분 읽기
                    </p>
                  </div>

                  {/* 요약 본문 */}
                  <div className="px-5 py-5">
                    <div className="space-y-3">
                      {learningContents.summary.content.split(/\n+/).filter(Boolean).map((para, i) => (
                        <p key={i} className="text-sm text-slate-700 leading-relaxed">{para}</p>
                      ))}
                    </div>

                    {/* 하단 뱃지 */}
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 text-violet-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <p className="text-[11px] text-slate-400">AI가 영상 자막을 분석하여 자동 생성한 요약입니다</p>
                    </div>
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
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 shrink-0">
                  <p className="text-xs font-bold text-slate-600">
                    {dataLoading ? '불러오는 중...' : `${subtitles.length}개의 자막`}
                  </p>
                  <button
                    onClick={handleAddSubtitle}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
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
                            (sub.words && sub.words.length > 0
                              ? sub.words.map((w, i) => (
                                  <span
                                    key={w.segmentWordId ?? i}
                                    onClick={e => { e.stopPropagation(); handleWordClick(sub, w.word, 'ORIGINAL'); }}
                                    className="cursor-pointer rounded px-0.5 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
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
                                      className="cursor-pointer rounded px-0.5 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                                    >
                                      {token}
                                    </span>
                                  );
                                })
                            )
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
                <div className="w-1/2 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 shrink-0">
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
                              <p className="text-xs text-slate-700 leading-relaxed">{selectedWord.meaning}</p>
                            </div>
                            {selectedWord.relatedWords && selectedWord.relatedWords.length > 0 && (
                              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">관련 단어</p>
                                <div className="flex flex-wrap gap-1">
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
                            {selectedWord.originalSentence.split(new RegExp(`(${selectedWord.word})`, 'i')).map((part, i) =>
                              part.toLowerCase() === selectedWord.word.toLowerCase()
                                ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
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

          {/* ── ③ 빈출 단어 ── */}
          {activeTab === '빈출단어' && (
            <div className="flex-1 overflow-y-auto">
              {!learningContents || learningContents.keywords.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500 font-medium">빈출 단어가 없습니다</p>
                  <p className="text-xs text-slate-400">AI 분석이 완료된 영상에서 확인할 수 있어요</p>
                </div>
              ) : (
                <div>
                  {/* 헤더 */}
                  <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-700">핵심 단어 · 표현</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{learningContents.keywords.length}개 · 클릭하면 해당 구간으로 이동</p>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      AI 분석
                    </span>
                  </div>

                  <div className="px-3 pb-4 space-y-2">
                    {learningContents.keywords.map((kw, idx) => {
                      const rankColors = [
                        'from-amber-400 to-yellow-400 text-white',   // 1위
                        'from-slate-400 to-slate-300 text-white',    // 2위
                        'from-orange-400 to-amber-500 text-white',   // 3위
                      ];
                      const rankBg = idx < 3 ? rankColors[idx] : null;
                      return (
                        <div
                          key={kw.learningContentId}
                          className="rounded-2xl border border-slate-200 bg-white overflow-hidden cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group"
                          onClick={() => {
                            if (kw.startTime != null) {
                              if (videoRef.current) { videoRef.current.currentTime = kw.startTime; videoRef.current.play(); }
                              else if (ytPlayerRef.current) { ytPlayerRef.current.seekTo(kw.startTime, true); }
                            }
                          }}
                        >
                          <div className="flex items-stretch">
                            {/* 왼쪽 순위 바 */}
                            <div className={`flex flex-col items-center justify-center w-10 shrink-0 ${rankBg ? `bg-gradient-to-b ${rankBg}` : 'bg-slate-50'}`}>
                              <span className={`text-xs font-extrabold ${rankBg ? '' : 'text-slate-400'}`}>
                                {idx + 1}
                              </span>
                            </div>
                            {/* 본문 */}
                            <div className="flex-1 min-w-0 px-3 py-3">
                              <p className="text-sm font-bold text-slate-800 leading-snug mb-1">{kw.title}</p>
                              <p className="text-xs text-slate-500 leading-relaxed">{kw.content}</p>
                            </div>
                            {/* 타임스탬프 */}
                            {kw.startTime != null && (
                              <div className="flex flex-col items-center justify-center px-3 shrink-0 border-l border-slate-100 group-hover:border-emerald-100 group-hover:bg-emerald-50/50 transition-colors">
                                <svg className="h-3.5 w-3.5 text-emerald-400 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">{secToTimecode(kw.startTime)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── ④ 관용 표현 ── */}
          {activeTab === '관용표현' && (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {!learningContents || learningContents.expressions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                    <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-500 font-medium">관용 표현이 없습니다</p>
                  <p className="text-xs text-slate-400">AI 분석이 완료된 영상에서 확인할 수 있어요</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {learningContents.expressions.map(ex => (
                    <div
                      key={ex.learningContentId}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 cursor-pointer hover:border-amber-400 hover:bg-amber-100/60 transition-colors"
                      onClick={() => {
                        if (ex.startTime != null) {
                          if (videoRef.current) { videoRef.current.currentTime = ex.startTime; videoRef.current.play(); }
                          else if (ytPlayerRef.current) { ytPlayerRef.current.seekTo(ex.startTime, true); }
                        }
                      }}
                    >
                      <p className="text-sm font-semibold text-amber-700 mb-1">{ex.title}</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{ex.content}</p>
                      {ex.startTime != null && (
                        <p className="text-[10px] text-slate-400 mt-1.5 font-mono flex items-center gap-1">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {secToTimecode(ex.startTime)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

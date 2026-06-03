import { useState, useEffect } from 'react';
import { getMySavedWords, deleteSavedWord, explainWord, generateWordExamples } from '@/api/words';
import type { SavedWordResult, ExampleItem } from '@/api/words';
import { useAuth } from '@/app/providers/AuthProvider';
import { Header } from '@/components/layout/Header';

// API ExampleItem을 그대로 사용 (sentence, translatedSentence)
type ExampleSentence = ExampleItem;

// API 응답을 화면용으로 래핑하는 타입
type SavedWord = SavedWordResult & { lang?: string };

// ── Mock 데이터 (API 실패 시 폴백) ───────────────────

const SYN_POOLS = [
  ['begin', 'commence'], ['finish', 'complete'], ['happy', 'glad'],
  ['fast', 'quick'],     ['big', 'large'],        ['understand', 'grasp'],
  ['essential', 'crucial'], ['practice', 'train'],
  ['natural', 'genuine'], ['perfect', 'ideal'],
];
const ANT_POOLS = [
  ['end', 'stop'],       ['start', 'open'],       ['sad', 'gloomy'],
  ['slow', 'sluggish'],  ['small', 'tiny'],        ['confuse', 'misunderstand'],
  ['optional', 'minor'], ['neglect', 'skip'],
  ['artificial', 'fake'], ['flawed', 'imperfect'],
];
const EXAMPLE_FMTS = [
  (w: string) => ({
    sentence: `We need to practice "${w}" in real conversations.`,
    translatedSentence: `실제 대화에서 "${w}"을(를) 연습해 보아야 한다.`,
  }),
  (w: string) => ({
    sentence: `Understanding "${w}" is essential for language learners.`,
    translatedSentence: `"${w}"의 의미를 이해하는 것은 언어 학습자에게 필수적이다.`,
  }),
  (w: string) => ({
    sentence: `The speaker used "${w}" to make the sentence more natural.`,
    translatedSentence: `화자는 문장을 더 자연스럽게 만들기 위해 "${w}"을(를) 사용했다.`,
  }),
];

// 텍스트에서 언어 자동 감지 (유니코드 범위 기반)
function detectLang(text: string): string {
  if (/[가-힣ᄀ-ᇿ㄰-㆏]/.test(text)) return 'ko-KR';
  if (/[぀-ゟ゠-ヿㇰ-ㇿ]/.test(text)) return 'ja-JP';
  if (/[一-鿿]/.test(text)) return 'zh-CN';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru-RU';
  if (/[À-ɏ]/.test(text)) return 'es-ES'; // 라틴 확장 (스페인어/프랑스어 등 — 기본 fallback)
  return 'en-US';
}

function strHash(s: string) {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}
function getMockRelatedWords(word: string): string[] {
  const h = strHash(word);
  const syns = SYN_POOLS[h % SYN_POOLS.length];
  const ants = ANT_POOLS[h % ANT_POOLS.length];
  return [...syns, ...ants].slice(0, 4);
}
function getMockExamples(word: string): ExampleSentence[] {
  const h = strHash(word);
  return [
    EXAMPLE_FMTS[h % EXAMPLE_FMTS.length](word),
    EXAMPLE_FMTS[(h + 1) % EXAMPLE_FMTS.length](word),
  ];
}

// ── 단어망 SVG (관련 단어 최대 4개) ────────────────────

function WordNetworkSVG({ word, relatedWords }: {
  word: string;
  relatedWords: string[];
}) {
  const visible = relatedWords.slice(0, 6);
  if (visible.length === 0) return null;

  const W = 440, H = 240;
  const cx = W / 2, cy = H / 2;
  const NH = 32;           // node pill height
  const charW = 7;         // approx px per character at fontSize=14
  const hPad = 24;         // horizontal padding inside pill
  const yStep = 62;        // vertical gap between sibling nodes

  // 중심 pill 반폭
  const cnHW = Math.max(48, Math.ceil(word.length * charW / 2) + hPad);

  // 단어 분배: 앞 절반 왼쪽, 뒷 절반 오른쪽
  const leftCount = Math.floor(visible.length / 2);
  const leftWords  = visible.slice(0, leftCount);
  const rightWords = visible.slice(leftCount);

  // 모든 노드 단일 에메랄드 색상
  const COLORS = ['#10b981', '#10b981', '#10b981', '#10b981', '#10b981', '#10b981'];

  // 노드 계산 — 바깥 엣지를 SVG 가장자리에 고정
  const buildNodes = (words: string[], side: 'left' | 'right', colorOffset: number) => {
    const n = words.length;
    return words.map((w, i) => {
      const hw = Math.max(36, Math.ceil(w.length * charW / 2) + hPad);
      // 바깥 엣지 x = 6 (left) or W-6 (right), 중심 = 바깥엣지 ± hw
      const nx = side === 'left' ? 6 + hw : W - 6 - hw;
      const yOff = n <= 1 ? 0 : -((n - 1) * yStep) / 2 + i * yStep;
      return {
        word: w, x: nx, y: cy + yOff, hw,
        color: COLORS[(colorOffset + i) % COLORS.length],
      };
    });
  };

  const leftNodes  = buildNodes(leftWords,  'left',  0);
  const rightNodes = buildNodes(rightWords, 'right', leftCount);

  // 브랜치 시작 y: 중심에서 노드 방향으로 30% 이동 (coggle 팬아웃)
  const makePath = (n: { x: number; y: number; hw: number }, side: 'left' | 'right') => {
    const sy = cy + (n.y - cy) * 0.28;   // 중심 pill 위 출발 y
    const sx = side === 'left' ? cx - cnHW : cx + cnHW;
    const ex = side === 'left' ? n.x + n.hw : n.x - n.hw;
    const ey = n.y;
    // 수평 제어점 거리
    const hd = Math.max(30, Math.abs(ex - sx) * 0.42);
    const cp1x = side === 'left' ? sx - hd : sx + hd;
    const cp2x = side === 'left' ? ex + hd : ex - hd;
    return `M ${sx} ${sy} C ${cp1x} ${sy} ${cp2x} ${ey} ${ex} ${ey}`;
  };

  const gradId = `cg-${word.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const renderNode = (
    n: { word: string; x: number; y: number; hw: number; color: string },
    side: 'left' | 'right',
    key: string,
  ) => (
    <g key={key}>
      {/* 곡선 브랜치 */}
      <path
        d={makePath(n, side)}
        stroke={n.color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* 노드 pill */}
      <rect
        x={n.x - n.hw} y={n.y - NH / 2}
        width={n.hw * 2} height={NH}
        rx="16"
        fill="white"
        stroke={n.color}
        strokeWidth="1.5"
      />
      <text
        x={n.x} y={n.y + 5}
        textAnchor="middle"
        fontSize="14"
        fill="#1e293b"
        fontWeight="600"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {n.word}
      </text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '210px' }}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <filter id="cshadow" x="-20%" y="-30%" width="140%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#10b981" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* 왼쪽 노드 */}
      {leftNodes.map((n, i) => renderNode(n, 'left', `l${i}`))}
      {/* 오른쪽 노드 */}
      {rightNodes.map((n, i) => renderNode(n, 'right', `r${i}`))}

      {/* 중심 노드 (맨 위에 렌더) */}
      <rect
        x={cx - cnHW} y={cy - NH / 2 - 2}
        width={cnHW * 2} height={NH + 4}
        rx="18"
        fill={`url(#${gradId})`}
        filter="url(#cshadow)"
      />
      <text
        x={cx} y={cy + 5}
        textAnchor="middle"
        fontSize="14"
        fill="white"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {word}
      </text>
    </svg>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────

export function StudyPage() {
  const { user, loading: authLoading } = useAuth();
  const [words, setWords] = useState<SavedWord[]>([]);
  const [wordsLoading, setWordsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'card'>('list');
  const [flipped, setFlipped] = useState<number | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 관련 단어 분석 상태 (key: savedWordId)
  type RelationsState = string[] | 'loading' | null;
  const [relationsMap, setRelationsMap] = useState<Record<number, RelationsState>>({});

  // AI 예문 상태
  type ExamplesState = ExampleSentence[] | 'loading' | null;
  const [examplesMap, setExamplesMap] = useState<Record<number, ExamplesState>>({});

  // API에서 저장된 단어 목록 로드 (auth 준비 후)
  useEffect(() => {
    if (authLoading) return;      // Firebase 초기화 대기
    if (!user) {                  // 비로그인 시 빈 목록
      setWordsLoading(false);
      return;
    }
    setWordsLoading(true);
    getMySavedWords()
      .then(data => {
        setWords(data);
        // 페이지 진입 시 모든 단어 분석 미리 로드
        data.forEach(word => {
          handleAnalyzeRelations(word);
          handleGenerateExamples(word);
        });
      })
      .catch(err => {
        console.error('[OverLang] 단어 목록 로드 실패:', err);
        setWords([]);
      })
      .finally(() => setWordsLoading(false));
  }, [authLoading, user]);

  const handleDelete = async (savedWordId: number) => {
    try {
      await deleteSavedWord(savedWordId);
      setWords(prev => prev.filter(w => w.savedWordId !== savedWordId));
    } catch (err) {
      console.error('[OverLang] 단어 삭제 실패:', err);
      alert('삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleAnalyzeRelations = async (word: SavedWord) => {
    setRelationsMap(prev => ({ ...prev, [word.savedWordId]: 'loading' }));
    try {
      const result = await explainWord({
        segmentId: word.segmentId ?? undefined,
        word: word.word,
        selectedTextType: word.selectedTextType ?? 'ORIGINAL',
        originalSentence: word.originalSentence ?? '',
        translatedSentence: word.translatedSentence ?? '',
        sourceLanguage: (word.lang ?? detectLang(word.word)).split('-')[0].toUpperCase(),
        targetLanguage: 'KO',
      });
      setRelationsMap(prev => ({ ...prev, [word.savedWordId]: result.relatedWords }));
    } catch {
      // 실패 시 목 데이터로 폴백
      setRelationsMap(prev => ({ ...prev, [word.savedWordId]: getMockRelatedWords(word.word) }));
    }
  };

  const handleGenerateExamples = async (word: SavedWord) => {
    setExamplesMap(prev => ({ ...prev, [word.savedWordId]: 'loading' }));
    try {
      const result = await generateWordExamples(word.savedWordId);
      setExamplesMap(prev => ({ ...prev, [word.savedWordId]: result.examples }));
    } catch (err) {
      console.error('[OverLang] 예문 생성 실패:', err);
      // 실패 시 목 데이터로 폴백
      setExamplesMap(prev => ({ ...prev, [word.savedWordId]: getMockExamples(word.word) }));
    }
  };

  const handleTTS = (text: string, lang?: string) => {
    const resolvedLang = lang ?? detectLang(text);
    const langPrefix = resolvedLang.split('-')[0]; // 'ja', 'ko', 'en' ...

    window.speechSynthesis.cancel();
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = resolvedLang;
      utter.rate = 0.9;

      // 최적 음성 선택 (Google 클라우드 음성 > Enhanced/Premium > 기타 순)
      const voices = window.speechSynthesis.getVoices();
      const langVoices = voices.filter(v => v.lang.startsWith(langPrefix));
      const googleVoice   = langVoices.find(v => v.name.toLowerCase().includes('google'));
      const enhancedVoice = langVoices.find(v =>
        v.name.toLowerCase().includes('enhanced') ||
        v.name.toLowerCase().includes('premium')
      );
      const bestVoice = googleVoice ?? enhancedVoice ?? langVoices[0] ?? null;
      if (bestVoice) utter.voice = bestVoice;

      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      window.speechSynthesis.speak(utter);
    }, 100);
  };

  const filtered = words.filter(w =>
    w.word.toLowerCase().includes(search.toLowerCase()) ||
    w.originalSentence?.toLowerCase().includes(search.toLowerCase()) ||
    w.translatedSentence?.includes(search) ||
    w.meaning?.includes(search)
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-4">

        {/* ── 페이지 타이틀 + 뷰 전환 ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">학습 노트</h1>
            <p className="text-xs text-slate-400 mt-0.5">{wordsLoading ? '불러오는 중...' : `${words.length}개 저장됨`}</p>
          </div>
          {/* 뷰 전환 */}
          <div className="flex items-center gap-0.5 rounded-xl bg-slate-100 p-1">
            {(['list', 'card'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {v === 'list' ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    목록
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    플래시카드
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 */}
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="단어나 의미로 검색하세요."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl bg-white border border-slate-200 pl-11 pr-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 로딩 상태 */}
        {wordsLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin" />
            <p className="text-sm text-slate-400">단어 목록을 불러오는 중...</p>
          </div>
        )}

        {/* 빈 상태 */}
        {!wordsLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-sm border border-slate-200">
              <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-600">
                {search ? '검색 결과가 없습니다' : '저장된 단어가 없습니다'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {search ? '다른 키워드로 검색해보세요' : '자막 편집 화면에서 단어를 드래그하여 저장해보세요'}
              </p>
            </div>
          </div>
        )}

        {/* ── 목록 뷰 ── */}
        {!wordsLoading && view === 'list' && filtered.length > 0 && (
          <div className="space-y-2.5">
            {filtered.map(word => {
              const isExpanded = expandedId === String(word.savedWordId);
              const relations = relationsMap[word.savedWordId];
              const examples = examplesMap[word.savedWordId];

              return (
                <div
                  key={word.savedWordId}
                  className={`rounded-2xl border transition-all duration-200 ${
                    isExpanded
                      ? 'border-emerald-200 bg-white shadow-sm'
                      : 'border-slate-100 bg-slate-50 hover:border-emerald-200 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  {/* 카드 메인 행 - 전체 클릭으로 펼치기 */}
                  <div
                    className="px-4 pt-3 pb-2.5 cursor-pointer select-none"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : String(word.savedWordId));
                    }}
                  >
                    {/* 단어 + 뱃지 */}
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800">{word.word}</h3>
                      {word.lang && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-400 uppercase tracking-wide">
                          {word.lang.split('-')[0]}
                        </span>
                      )}
                      {/* 펼침 인디케이터 */}
                      <svg className={`h-3 w-3 text-slate-300 ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* 뜻 */}
                    {word.meaning && (
                      <p className="text-xs text-slate-500 leading-relaxed mb-1.5 whitespace-pre-line">
                        {word.meaning.replace(/(?<!\n)\[/g, '\n[').trimStart()}
                      </p>
                    )}

                    {/* 하단 행: 출처 + 날짜 + TTS + 삭제 */}
                    <div className="flex items-center gap-1.5">
                      {word.projectTitle
                        ? <p className="text-[10px] text-emerald-500 flex-1 truncate"> {word.projectTitle}</p>
                        : <div className="flex-1" />
                      }
                      <span className="text-[10px] text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
                        {new Date(word.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                      {/* TTS */}
                      <button
                        onClick={e => { e.stopPropagation(); handleTTS(word.word, word.lang); }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 hover:bg-[emerald-100] text-[#0aa633] transition-colors shrink-0"
                      >
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                        </svg>
                      </button>
                      {/* 삭제 */}
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(word.savedWordId); }}
                        className="flex h-7 w-7 items-center justify-center rounded-xl text-slate-300 hover:text-red-400 hover:bg-red-50 hover:border-red-100 border border-transparent transition-all shrink-0"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* 확장 영역 - 원문 + 액션 버튼 */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 py-3 bg-white rounded-b-2xl">
                      {/* 원문 */}
                      {word.originalSentence && (
                        <div className="mb-3">
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {word.originalSentence?.split(new RegExp(`(${word.word})`, 'i')).map((part, i) =>
                              part.toLowerCase() === word.word.toLowerCase()
                                ? <mark key={i} className="bg-yellow-100 text-yellow-800 rounded px-0.5 not-italic font-semibold">{part}</mark>
                                : part
                            )}
                          </p>
                          {word.translatedSentence && (
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{word.translatedSentence}</p>
                          )}
                        </div>
                      )}

                    {/* 유의어 영역 */}
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">유의어</p>
                      {relations === 'loading' ? (
                        <div className="flex items-center gap-2 py-2">
                          <div className="w-4 h-4 rounded-full border-2 border-emerald-200 border-t-emerald-500 animate-spin" />
                          <p className="text-xs text-slate-400">AI 분석 중...</p>
                        </div>
                      ) : relations ? (
                        <div>
                          <WordNetworkSVG word={word.word} relatedWords={relations} />
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {relations.map((rw, i) => (
                              <span key={i} className="text-xs px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 font-medium">
                                {rw}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* AI 예문 영역 */}
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">AI 예문</p>
                      {examples === 'loading' ? (
                        <div className="flex items-center gap-2 py-2">
                          <div className="w-4 h-4 rounded-full border-2 border-emerald-200 border-t-emerald-500 animate-spin" />
                          <p className="text-xs text-slate-400">예문 생성 중...</p>
                        </div>
                      ) : examples ? (
                        <div className="space-y-2">
                          {examples.map((ex, i) => (
                            <div key={i} className="rounded-xl bg-white border border-slate-100 p-3 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">예문 {i + 1}</span>
                                <button
                                  onClick={e => { e.stopPropagation(); handleTTS(ex.sentence); }}
                                  className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-500 transition-colors"
                                >
                                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                                  </svg>
                                </button>
                              </div>
                              <p className="text-xs text-slate-700 font-medium leading-relaxed">{ex.sentence}</p>
                              <p className="text-[11px] text-slate-400 leading-relaxed">{ex.translatedSentence}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── 플래시카드 뷰 ── */}
        {!wordsLoading && view === 'card' && filtered.length > 0 && (() => {
          const safeIndex = Math.min(cardIndex, filtered.length - 1);
          const word = filtered[safeIndex];
          const isFlipped = flipped === safeIndex;

          return (
            <div className="flex flex-col items-center gap-5">

              {/* 진행 표시 */}
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => { setCardIndex(i => Math.max(0, i - 1)); setFlipped(null); }}
                  disabled={safeIndex === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-25 transition-all shadow-sm shrink-0"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex-1 text-center">
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">{safeIndex + 1} / {filtered.length}</p>
                  <div className="w-full bg-slate-100 rounded-full h-1">
                    <div
                      className="bg-[#0aa633] h-1 rounded-full transition-all duration-300"
                      style={{ width: `${((safeIndex + 1) / filtered.length) * 100}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => { setCardIndex(i => Math.min(filtered.length - 1, i + 1)); setFlipped(null); }}
                  disabled={safeIndex === filtered.length - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-25 transition-all shadow-sm shrink-0"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* 카드 (3D 플립) */}
              <div
                className="w-full cursor-pointer select-none"
                style={{ perspective: '1200px' }}
                onClick={() => setFlipped(isFlipped ? null : safeIndex)}
              >
                <div
                  style={{
                    position: 'relative',
                    height: '340px',
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {/* 앞면 */}
                  <div
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-white border border-slate-200 shadow-lg p-8 text-center"
                  >
                    {word.lang && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-400 uppercase tracking-wide mb-3">
                        {word.lang.split('-')[0]}
                      </span>
                    )}
                    <p className="text-4xl font-extrabold text-slate-800 tracking-tight mb-4">{word.word}</p>
                    {word.contextMeaning && (
                      <p className="text-sm text-slate-400 italic mb-4 max-w-xs leading-relaxed line-clamp-2">"{word.contextMeaning.length > 60 ? word.contextMeaning.slice(0, 60) + '...' : word.contextMeaning}"</p>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleTTS(word.word, word.lang); }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 hover:bg-[emerald-100] text-[#0aa633] transition-colors shrink-0"                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                      </svg>
                    </button>
                    {word.projectTitle && (
                      <p className="text-[10px] text-slate-300 mt-6 text-center leading-relaxed px-4">{word.projectTitle}</p>
                    )}
                    <p className="text-xs text-slate-300 mt-1">탭하여 뜻 확인 →</p>
                  </div>

                  {/* 뒷면 */}
                  <div
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                    }}
                    className="absolute inset-0 flex flex-col rounded-3xl bg-white border-3 border-[#dedede] shadow-xl p-7"
                  >
                    {/* 단어 + TTS (우측 상단) */}
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xl font-extrabold text-slate-800">{word.word}</p>
                      <button
                        onClick={e => { e.stopPropagation(); handleTTS(word.word, word.lang); }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 hover:bg-[emerald-100] text-[#0aa633] transition-colors shrink-0"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                        </svg>
                      </button>
                    </div>

                    {/* 직역 / 실제 의미 섹션만 표시 */}
                    <div className="flex flex-col gap-3 flex-1">
                      {word.meaning && (() => {
                        const TARGET = ['직역', '실제 의미'];
                        const hasSections = word.meaning.includes('[직역]') || word.meaning.includes('[실제 의미]');
                        if (hasSections) {
                          const sections = word.meaning.split(/(?=\[)/).filter(Boolean);
                          const filtered = sections
                            .map(part => { const m = part.match(/^\[(.+?)\]\s*([\s\S]*)/); return m ? { label: m[1], body: m[2].trim() } : null; })
                            .filter((s): s is { label: string; body: string } => !!s && TARGET.includes(s.label));
                          if (filtered.length > 0) {
                            return filtered.map((s, i) => (
                              <div key={i} className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 flex-1">
                                <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider mb-1.5">{s.label}</p>
                                <p className="text-sm font-semibold text-slate-700 leading-relaxed">{s.body}</p>
                              </div>
                            ));
                          }
                        }
                        // 섹션 없으면 전체 의미 표시
                        return (
                          <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 flex-1 flex items-center justify-center">
                            <p className="text-base font-bold text-slate-700 text-center leading-snug">{word.meaning}</p>
                          </div>
                        );
                      })()}
                    </div>


                    {/* (하단 버튼 제거 - TTS 단어 옆으로 이동) */}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400">카드를 탭해서 뒤집어보세요</p>
            </div>
          );
        })()}

      </div>
      <footer className="py-4 text-center">
        <p className="text-xs text-slate-300">© 2026 OverLang. All rights reserved.</p>
      </footer>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMySavedWords, deleteSavedWord, explainWord, generateWordExamples } from '@/api/words';
import type { SavedWordResult, ExampleItem } from '@/api/words';
import { useAuth } from '@/app/providers/AuthProvider';

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
  const cx = 170, cy = 97;
  // 최대 4개 노드: 왼쪽 상단, 왼쪽 하단, 오른쪽 상단, 오른쪽 하단
  const nodePos = [
    { x: 42,  y: 52  },
    { x: 42,  y: 142 },
    { x: 298, y: 52  },
    { x: 298, y: 142 },
  ];
  const nodeColors = [
    { stroke: '#818cf8', fill: '#eef2ff', text: '#3730a3' },
    { stroke: '#818cf8', fill: '#eef2ff', text: '#3730a3' },
    { stroke: '#818cf8', fill: '#eef2ff', text: '#3730a3' },
    { stroke: '#818cf8', fill: '#eef2ff', text: '#3730a3' },
  ];

  const truncate = (s: string, max = 7) => s.length > max ? s.slice(0, max - 1) + '…' : s;
  const visible = relatedWords.slice(0, 4);

  return (
    <svg viewBox="0 0 340 194" className="w-full h-44">
      {/* 연결선 */}
      {visible.map((_, i) => {
        const p = nodePos[i];
        const dx = p.x < cx ? 28 : -28;
        return (
          <line key={`line-${i}`}
            x1={p.x < cx ? cx - 43 : cx + 43} y1={cy}
            x2={p.x + dx} y2={p.y}
            stroke="#c7d2fe" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.9"
          />
        );
      })}

      {/* 중심 노드 */}
      <circle cx={cx} cy={cy} r="43" fill="#f0fdf4" stroke="#10b981" strokeWidth="2.5" />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fill="#065f46" fontWeight="700">
        {truncate(word, 9)}
      </text>

      {/* 관련 단어 노드 */}
      {visible.map((rw, i) => {
        const p = nodePos[i];
        const c = nodeColors[i];
        return (
          <g key={`node-${i}`}>
            <circle cx={p.x} cy={p.y} r="28" fill={c.fill} stroke={c.stroke} strokeWidth="1.5" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="9" fill={c.text} fontWeight="500">
              {truncate(rw)}
            </text>
          </g>
        );
      })}

      {/* 관련 단어 레이블 */}
      <text x="170" y="14" textAnchor="middle" fontSize="8" fill="#6366f1" fontWeight="700" letterSpacing="0.5">유의어</text>
    </svg>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────

export function StudyPage() {
  const navigate = useNavigate();
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
      .then(data => setWords(data))
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

      {/* ── 헤더 ── */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10 shadow-sm">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
            >
              <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 shadow-sm">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">학습 노트</p>
                <p className="text-xs text-slate-400">{wordsLoading ? '불러오는 중...' : `${words.length}개 저장됨`}</p>
              </div>
            </div>
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
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-4">

        {/* 검색 */}
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="단어나 의미로 검색..."
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
          <div className="space-y-3">
            {filtered.map(word => {
              const isExpanded = expandedId === String(word.savedWordId);
              const relations = relationsMap[word.savedWordId];
              const examples = examplesMap[word.savedWordId];

              return (
                <div
                  key={word.savedWordId}
                  className={`rounded-2xl bg-white shadow-sm border transition-all duration-200 ${
                    isExpanded
                      ? 'border-orange-200 shadow-md'
                      : 'border-slate-200 hover:border-orange-100 hover:shadow-md'
                  }`}
                >
                  {/* 카드 상단 */}
                  <div className="p-5">
                    <div className="flex items-start gap-3 justify-between">
                      <div className="flex-1 min-w-0">

                        {/* 단어 + 뱃지 + TTS */}
                        <div className="flex items-center flex-wrap gap-2 mb-2.5">
                          <h3 className="text-xl font-extrabold text-slate-800 leading-none">{word.word}</h3>
                          {word.lang && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wide">
                              {word.lang.split('-')[0]}
                            </span>
                          )}
                          <button
                            onClick={() => handleTTS(word.word, word.lang)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-50 hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                            </svg>
                          </button>
                        </div>

                        {/* AI 뜻 */}
                        {word.meaning && (
                          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2 leading-relaxed border border-amber-100">
                            {word.meaning}
                          </p>
                        )}

                        {/* 원문 (단어 하이라이트) */}
                        <p className="text-sm text-slate-600 leading-relaxed mt-2">
                          {word.originalSentence?.split(new RegExp(`(${word.word})`, 'i')).map((part, i) =>
                            part.toLowerCase() === word.word.toLowerCase()
                              ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic font-semibold">{part}</mark>
                              : part
                          )}
                        </p>
                        {word.translatedSentence && (
                          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{word.translatedSentence}</p>
                        )}

                        {/* 메타 */}
                        <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                          {word.projectTitle && (
                            <span className="flex items-center gap-1 truncate max-w-[120px]">
                              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                              </svg>
                              <span className="truncate">{word.projectTitle}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1 shrink-0">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(word.createdAt).toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                      </div>

                      {/* 삭제 */}
                      <button
                        onClick={() => handleDelete(word.savedWordId)}
                        className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex items-center gap-2 mt-4 pt-3.5 border-t border-slate-100">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : String(word.savedWordId))}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                          isExpanded
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-slate-100 text-slate-500 hover:bg-orange-50 hover:text-orange-600'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                        유의어
                        {relations && relations !== 'loading' && (
                          <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          if (!isExpanded) setExpandedId(String(word.savedWordId));
                          if (!examples) handleGenerateExamples(word);
                        }}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                          examples && examples !== 'loading'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-600'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        AI 예문
                        {examples && examples !== 'loading' && (
                          <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-violet-400 inline-block" />
                        )}
                      </button>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : String(word.savedWordId))}
                        className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {isExpanded ? '접기' : '펼치기'}
                        <svg className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* ── 확장 영역 ── */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-6">

                      {/* 단어망 */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">유의어</p>
                        </div>

                        {!relations ? (
                          <button
                            onClick={() => handleAnalyzeRelations(word)}
                            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-7 text-sm text-slate-400 hover:border-orange-300 hover:text-orange-500 transition-all group"
                          >
                            <svg className="h-5 w-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                            유의어 분석하기
                          </button>
                        ) : relations === 'loading' ? (
                          <div className="flex flex-col items-center justify-center py-10 gap-3">
                            <div className="w-7 h-7 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin" />
                            <p className="text-xs text-slate-400">AI 분석 중...</p>
                          </div>
                        ) : (
                          <div>
                            <WordNetworkSVG
                              word={word.word}
                              relatedWords={relations}
                            />
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                              {relations.map((rw, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600">
                                  {rw}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* AI 예문 */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">AI 예문</p>
                          </div>
                        </div>

                        {!examples ? (
                          <button
                            onClick={() => handleGenerateExamples(word)}
                            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-7 text-sm text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-all group"
                          >
                            <svg className="h-5 w-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            AI 예문 생성하기 (미리보기)
                          </button>
                        ) : examples === 'loading' ? (
                          <div className="flex flex-col items-center justify-center py-10 gap-3">
                            <div className="w-7 h-7 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
                            <p className="text-xs text-slate-400">예문 생성 중...</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {examples.map((ex, i) => (
                              <div key={i} className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">예문 {i + 1}</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleTTS(ex.sentence); }}
                                    className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 hover:bg-violet-200 text-violet-500 transition-colors"
                                  >
                                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                                    </svg>
                                  </button>
                                </div>
                                <p className="text-sm text-slate-700 font-medium leading-relaxed">{ex.sentence}</p>
                                <p className="text-xs text-slate-400 leading-relaxed">{ex.translatedSentence}</p>
                              </div>
                            ))}
                          </div>
                        )}
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
                      className="bg-orange-400 h-1 rounded-full transition-all duration-300"
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
                      <p className="text-sm text-slate-400 italic mb-4 max-w-xs leading-relaxed">"{word.contextMeaning}"</p>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleTTS(word.word, word.lang); }}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors mt-1"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                      </svg>
                    </button>
                    <p className="text-xs text-slate-300 mt-8">탭하여 뜻 확인 →</p>
                  </div>

                  {/* 뒷면 */}
                  <div
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                    }}
                    className="absolute inset-0 flex flex-col justify-center rounded-3xl bg-gradient-to-br from-orange-400 to-amber-400 shadow-xl p-8"
                  >
                    {word.meaning && (
                      <p className="text-lg font-bold text-white text-center leading-snug mb-5">{word.meaning}</p>
                    )}
                    {word.originalSentence && (
                      <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-3.5">
                        <p className="text-sm font-medium text-white leading-relaxed">{word.originalSentence}</p>
                        {word.translatedSentence && (
                          <p className="text-xs text-orange-100/80 mt-2 leading-relaxed">{word.translatedSentence}</p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-5">
                      <button
                        onClick={e => { e.stopPropagation(); handleTTS(word.originalSentence ?? word.word); }}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                        </svg>
                      </button>
                      {word.projectTitle && (
                        <p className="text-xs text-orange-100/70 truncate max-w-[160px]">{word.projectTitle}</p>
                      )}
                      <p className="text-xs text-orange-100/60 shrink-0">{new Date(word.createdAt).toLocaleDateString('ko-KR')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-400">카드를 탭해서 뒤집어보세요</p>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

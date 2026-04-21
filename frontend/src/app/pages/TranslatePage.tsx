import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ── 목 데이터 ──────────────────────────────────────────
const DEMO_VIDEO = 'https://www.w3schools.com/html/mov_bbb.mp4';

const MOCK_SUBTITLES = [
  { id: 1, start: '00:00:00', end: '00:00:03', original: 'Hello, everyone! Welcome to our English learning session.', translation: '안녕하세요, 여러분! 영어 학습 세션에 오신 것을 환영합니다.' },
  { id: 2, start: '00:00:03', end: '00:00:07', original: "Today, we're going to dive into some essential business idioms.", translation: '오늘은 필수적인 비즈니스 관용구들을 본격적으로 배워보겠습니다.' },
  { id: 3, start: '00:00:07', end: '00:00:12', original: 'These phrases will help you sound more natural in professional settings.', translation: '이 표현들은 전문적인 환경에서 더 자연스럽게 들리는 데 도움이 될 것입니다.' },
  { id: 4, start: '00:00:12', end: '00:00:16', original: 'Remember, practice makes perfect!', translation: '기억하세요, 연습이 완벽함을 만듭니다!' },
  { id: 5, start: '00:00:16', end: '00:00:20', original: "Let's get the ball rolling with our first idiom.", translation: '첫 번째 관용구로 시작해 봅시다.' },
];

const MOCK_OCR = [
  { id: 1, original: 'Business Idioms', translation: '비즈니스 관용구', x: 15, y: 18 },
  { id: 2, original: 'Chapter 1', translation: '챕터 1', x: 15, y: 30 },
];

type RightPanel = 'word' | 'sentence' | null;

interface SavedWord {
  word: string;
  pronunciation: string;
  meaning: string;
  contextMeaning: string;
  example: string;
  timestamp: string;
}

// ── 컴포넌트 ───────────────────────────────────────────
export function TranslatePage() {
  const navigate = useNavigate();
  const [showOcr, setShowOcr] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [selectedWord, setSelectedWord] = useState<SavedWord | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [sentenceData, setSentenceData] = useState<{ sentence: string; parts: { text: string; meaning: string; color: string }[]; grammar: string } | null>(null);
  const [subtitles, setSubtitles] = useState(MOCK_SUBTITLES);

  // 단어 드래그 선택
  const handleTextSelect = (subtitleId: number) => {
    const selection = window.getSelection();
    const word = selection?.toString().trim();
    if (!word || word.length < 2) return;

    // 목 단어 데이터
    const mockWordData: SavedWord = {
      word,
      pronunciation: `/${word.toLowerCase()}/`,
      meaning: getMockMeaning(word),
      contextMeaning: `이 영상에서는 "${word}"이(가) 학습 맥락에서 사용되었습니다.`,
      example: `"We use "${word}" in professional settings."`,
      timestamp: MOCK_SUBTITLES.find(s => s.id === subtitleId)?.start ?? '00:00:00',
    };
    setSelectedWord(mockWordData);
    setRightPanel('word');
  };

  const getMockMeaning = (word: string): string => {
    const meanings: Record<string, string> = {
      session: '세션, 회의, 수업 시간',
      essential: '필수적인, 본질적인',
      professional: '전문적인, 직업의',
      practice: '연습, 실천',
      idiom: '관용구, 숙어',
      natural: '자연스러운, 자연의',
    };
    return meanings[word.toLowerCase()] ?? `${word}의 의미`;
  };

  // 단어 저장
  const handleSaveWord = () => {
    if (!selectedWord) return;
    if (savedWords.find(w => w.word === selectedWord.word)) {
      alert('이미 저장된 단어입니다.');
      return;
    }
    setSavedWords(prev => [...prev, selectedWord]);
    alert(`"${selectedWord.word}" 학습 노트에 저장되었습니다.`);
  };

  // 문장 구조 분석
  const handleSentenceAnalysis = (subtitle: typeof MOCK_SUBTITLES[0]) => {
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
    setSubtitles(prev => [...prev, {
      id: Date.now(),
      start: last?.end ?? '00:00:00',
      end: '00:00:00',
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
              <p className="text-xs text-slate-400">AI 기반 번역 및 의미 분석</p>
            </div>
          </div>
          <button className="p-1 text-slate-300 hover:text-yellow-400 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
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
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            번역
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
            <video
              className="w-full aspect-video"
              controls
              src={DEMO_VIDEO}
            />

            {/* OCR 오버레이 */}
            {showOcr && MOCK_OCR.map(ocr => (
              <div
                key={ocr.id}
                className="absolute cursor-pointer"
                style={{ left: `${ocr.x}%`, top: `${ocr.y}%` }}
              >
                <div className="bg-black/60 border border-yellow-400 rounded px-2 py-0.5 text-xs text-white">
                  <p className="text-yellow-300 line-through text-[10px]">{ocr.original}</p>
                  <p>{ocr.translation}</p>
                </div>
              </div>
            ))}

            {/* OCR 토글 버튼 */}
            <button
              onClick={() => setShowOcr(v => !v)}
              className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
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
                  OCR 오버레이
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
          </div>

          {/* 하단 안내 카드 */}
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 shrink-0">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">OCR 오버레이</p>
                <p className="text-xs text-slate-500 mt-0.5">화면의 텍스트를 인식하여 위치 기반으로 번역 결과를 표시합니다</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-orange-50 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 shrink-0">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">단어 학습</p>
                <p className="text-xs text-slate-500 mt-0.5">단어를 드래그하여 의미, 발음, 맥락까지 즉시 확인하세요</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── 가운데: 자막 목록 ── */}
        <div className="flex flex-col w-[25%] border-r border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
            <div>
              <p className="text-sm font-bold text-slate-800">자막 목록</p>
              <p className="text-xs text-slate-400">{subtitles.length}개의 자막</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
                전체 번역
              </button>
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

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {subtitles.map(sub => (
              <div
                key={sub.id}
                className="rounded-xl border border-slate-200 p-3 hover:border-violet-300 transition-colors"
              >
                {/* 타임코드 */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={sub.start}
                    onChange={e => handleSubtitleChange(sub.id, 'original', e.target.value)}
                    className="flex-1 text-xs text-slate-500 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400"
                  />
                  <input
                    type="text"
                    value={sub.end}
                    onChange={e => handleSubtitleChange(sub.id, 'original', e.target.value)}
                    className="flex-1 text-xs text-slate-500 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={() => handleDeleteSubtitle(sub.id)}
                    className="text-red-400 hover:text-red-500 transition-colors shrink-0"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* 원문 */}
                <p className="text-[10px] font-semibold text-slate-400 mb-1">원문 (ENGLISH)</p>
                <textarea
                  value={sub.original}
                  onChange={e => handleSubtitleChange(sub.id, 'original', e.target.value)}
                  onMouseUp={() => handleTextSelect(sub.id)}
                  rows={2}
                  className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-violet-400 mb-2"
                />

                {/* 번역 */}
                <p className="text-[10px] font-semibold text-slate-400 mb-1">번역 (한국어)</p>
                <textarea
                  value={sub.translation}
                  onChange={e => handleSubtitleChange(sub.id, 'translation', e.target.value)}
                  rows={2}
                  className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-violet-400 mb-2"
                />

                {/* 문장 구조 분석 버튼 */}
                <button
                  onClick={() => handleSentenceAnalysis(sub)}
                  className="flex items-center gap-1.5 text-xs font-medium text-violet-500 hover:text-violet-700 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  문장 구조 분석
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── 오른쪽: 단어 해설 / 문장 분석 패널 ── */}
        <div className="flex flex-col flex-1">
          {/* 패널 헤더 */}
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
              </div>
            )}

            {/* 단어 해설 패널 */}
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
                <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                  <p className="text-xl font-bold text-slate-800">{selectedWord.word}</p>
                  <p className="text-sm text-slate-400">{selectedWord.pronunciation}</p>
                  <p className="text-sm font-medium text-slate-700">{selectedWord.meaning}</p>
                </div>

                {/* 영상에서의 의미 */}
                <div className="rounded-xl bg-amber-50 p-4 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <p className="text-xs font-semibold text-amber-600">영상에서의 의미</p>
                  </div>
                  <p className="text-sm text-slate-600">{selectedWord.contextMeaning}</p>
                </div>

                {/* 예문 */}
                <div className="rounded-xl bg-white border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">예문</p>
                  <p className="text-sm text-slate-600 italic">{selectedWord.example}</p>
                </div>

                {/* 저장 버튼 */}
                <button
                  onClick={handleSaveWord}
                  className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-400 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  학습 노트에 저장
                </button>
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

                {/* 원문 */}
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-400 mb-2">원문</p>
                  <p className="text-sm font-medium text-slate-800 leading-relaxed">{sentenceData.sentence}</p>
                </div>

                {/* 의미 단위 분해 */}
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

                {/* 문법 해설 */}
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
import { useNavigate } from 'react-router-dom';

// 실제로는 전역 상태나 localStorage에서 가져와야 함
// 지금은 목 데이터로 대체
const MOCK_SAVED_WORDS = [
  { word: 'get the ball rolling', pronunciation: '/get ðə bɔːl ˈrəʊ.lɪŋ/', meaning: '일을 시작하다, 착수하다 (관용구)', source: 'Business English Idioms', timestamp: '00:00:16', date: '2024-03-20' },
  { word: 'dive into', pronunciation: '/daɪv ˈɪn.tuː/', meaning: '~에 깊이 파고들다, 본격적으로 시작하다', source: 'Business English Idioms', timestamp: '00:00:03', date: '2024-03-20' },
  { word: 'essential', pronunciation: '/ɪˈsen.ʃəl/', meaning: '필수적인, 본질적인, 꼭 필요한', source: 'Business English Idioms', timestamp: '00:00:03', date: '2024-03-19' },
];

export function StudyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100">
      {/* 헤더 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">학습 노트</p>
              <p className="text-xs text-slate-400">저장된 단어 및 표현</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          {MOCK_SAVED_WORDS.length}개 저장됨
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-4">
        {/* 검색 */}
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="단어나 의미로 검색..."
            className="w-full rounded-xl bg-white border border-slate-200 pl-10 pr-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 shadow-sm"
          />
        </div>

        {/* 단어 카드 목록 */}
        {MOCK_SAVED_WORDS.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="font-medium text-slate-600">저장된 단어가 없습니다</p>
            <p className="text-sm text-slate-400">자막 편집 화면에서 단어를 드래그하여 저장해보세요</p>
          </div>
        ) : (
          MOCK_SAVED_WORDS.map((word, i) => (
            <div key={i} className="rounded-2xl bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-slate-800">{word.word}</p>
                    <button className="text-slate-300 hover:text-slate-500 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 18.364l-4.95-4.95a7 7 0 010-9.9l4.95 4.95m0 0l4.95-4.95a7 7 0 010 9.9L12 18.364z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-slate-400">{word.pronunciation}</p>
                  <p className="text-sm text-slate-700 font-medium">{word.meaning}</p>
                  <div className="flex items-center gap-3 pt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                      </svg>
                      {word.source}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {word.timestamp}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {word.date}
                    </span>
                  </div>
                </div>
                <button className="text-red-300 hover:text-red-500 transition-colors shrink-0 ml-4">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
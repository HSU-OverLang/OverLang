import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMySavedWords, deleteSavedWord, explainWord } from '@/api/words';
import type { SavedWordResult } from '@/api/words';
import { useAuth } from '@/app/providers/AuthProvider';

const SAVED_WORDS_KEY = 'overlang_saved_words';

interface SavedWord {
  id: string;
  word: string;
  originalSentence: string;
  translatedSentence: string;
  timestamp: string;
  date: string;
}

export function StudyPage() {
  const navigate = useNavigate();
  const [words, setWords] = useState<SavedWord[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'card'>('list');
  const [flipped, setFlipped] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SAVED_WORDS_KEY) ?? '[]');
      setWords(stored);
    } catch { setWords([]); }
  }, []);

  const handleDelete = (id: string) => {
    const updated = words.filter(w => w.id !== id);
    setWords(updated);
    localStorage.setItem(SAVED_WORDS_KEY, JSON.stringify(updated));
  };

  const filtered = words.filter(w =>
    w.word.toLowerCase().includes(search.toLowerCase()) ||
    w.originalSentence?.toLowerCase().includes(search.toLowerCase()) ||
    w.translatedSentence?.includes(search)
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── 헤더 ── */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-10">
        <div className="mx-auto max-w-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 shadow-sm">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">학습 노트</p>
                <p className="text-xs text-slate-400">{words.length}개 저장됨</p>
              </div>
            </div>
          </div>

          {/* 뷰 전환 */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              목록
            </button>
            <button
              onClick={() => setView('card')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                view === 'card' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              플래시카드
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-6 space-y-4">

        {/* 통계 바 */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '전체', value: words.length, color: 'bg-slate-100 text-slate-700' },
            { label: '이번 주', value: words.filter(w => {
                const d = new Date(w.date); const now = new Date();
                const diff = (now.getTime() - d.getTime()) / 86400000;
                return diff <= 7;
              }).length, color: 'bg-orange-50 text-orange-700' },
            { label: '숙지 완료', value: 0, color: 'bg-emerald-50 text-emerald-700' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl ${s.color} px-4 py-3 text-center`}>
              <p className="text-xl font-extrabold">{s.value}</p>
              <p className="text-xs mt-0.5 opacity-70">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 검색 */}
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="단어나 의미로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl bg-white border border-slate-200 pl-10 pr-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 빈 상태 */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100">
              <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
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

        {/* 목록 뷰 */}
        {view === 'list' && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((word) => (
              <div key={word.id} className="group rounded-2xl bg-white p-5 shadow-sm hover:shadow-md transition-all border border-transparent hover:border-orange-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-lg font-bold text-slate-800">{word.word}</p>
                    </div>
                    {/* 원문 문장 (단어 하이라이트) */}
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {word.originalSentence?.split(new RegExp(`(${word.word})`, 'i')).map((part, i) =>
                        part.toLowerCase() === word.word.toLowerCase()
                          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic">{part}</mark>
                          : part
                      )}
                    </p>
                    {word.translatedSentence && (
                      <p className="text-xs text-slate-400 leading-relaxed">{word.translatedSentence}</p>
                    )}
                    <div className="flex items-center gap-4 pt-1 text-xs text-slate-400">
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
                  <button
                    onClick={() => handleDelete(word.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 transition-all shrink-0 ml-4"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 플래시카드 뷰 */}
        {view === 'card' && filtered.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 text-center">카드를 클릭하면 뒤집어집니다</p>
            {filtered.map((word, i) => (
              <div
                key={word.id}
                onClick={() => setFlipped(flipped === i ? null : i)}
                className="cursor-pointer"
              >
                <div className={`rounded-2xl border-2 transition-all duration-300 ${
                  flipped === i
                    ? 'bg-gradient-to-br from-orange-400 to-amber-400 border-orange-300 shadow-lg shadow-orange-100'
                    : 'bg-white border-slate-200 hover:border-orange-200 shadow-sm hover:shadow-md'
                }`}>
                  {flipped === i ? (
                    <div className="p-8 text-center">
                      <p className="text-xs font-semibold text-orange-100 mb-3 uppercase tracking-wider">원문 문장</p>
                      <p className="text-sm font-medium text-white leading-relaxed">{word.originalSentence}</p>
                      {word.translatedSentence && (
                        <p className="text-xs text-orange-100 mt-3 leading-relaxed">{word.translatedSentence}</p>
                      )}
                      <div className="mt-4 pt-4 border-t border-white/20">
                        <p className="text-xs text-orange-100">{word.timestamp} · {word.date}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">단어 / 표현</p>
                      <p className="text-2xl font-extrabold text-slate-800">{word.word}</p>
                      <p className="text-xs text-slate-300 mt-4">탭하여 문장 맥락 확인</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';

export function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-white text-slate-800">

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-100">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* 로고 */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-800">OverLang</span>
          </div>

          {/* 네비 */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors">기능</a>
            <a href="#pricing" className="hover:text-slate-900 transition-colors">가격</a>
            <a href="#download" className="hover:text-slate-900 transition-colors">다운로드</a>
            <a href="#discuss" className="hover:text-slate-900 transition-colors">토론</a>
          </nav>

          {/* 우측 버튼 */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  대시보드
                </button>
                <button
                  onClick={async () => { await logout(); navigate('/'); }}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
                >
                  무료로 시작 →
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-5xl font-extrabold leading-tight text-slate-900 md:text-6xl">
          영상 속 모든 언어를<br />이해하고 학습하세요
        </h1>
        <p className="mt-6 max-w-xl text-lg text-slate-500">
          음성 자막은 물론 화면에 보이는 모든 텍스트까지,<br />
          AI가 통합 번역하여 완벽한 이해를 돕습니다.
        </p>
        <button
          onClick={() => navigate('/upload')}
          className="mt-10 rounded-xl bg-emerald-600 px-8 py-4 text-base font-semibold text-white hover:bg-emerald-500 transition-colors"
        >
          무료로 시작하기 →
        </button>
        <div className="mt-6 flex items-center gap-3 text-sm text-slate-400">
          <div className="flex -space-x-2">
            <div className="h-7 w-7 rounded-full bg-emerald-400 border-2 border-white" />
            <div className="h-7 w-7 rounded-full bg-emerald-500 border-2 border-white" />
            <div className="h-7 w-7 rounded-full bg-emerald-700 border-2 border-white" />
          </div>
          이미 많은 학습자들이 사용하고 있습니다
        </div>

        {/* 데모 영상 영역 */}
        <div className="mt-14 w-full max-w-4xl rounded-2xl bg-slate-800 aspect-video flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500">
            <svg className="h-8 w-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── STT + OCR 섹션 ── */}
      <section id="features" className="bg-slate-50 py-24 px-6">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center gap-16">
          {/* 카드 */}
          <div className="w-full md:w-1/2">
            <div className="rounded-2xl border-4 border-emerald-500 bg-white p-6 shadow-lg">
              <div className="flex items-center gap-2 text-emerald-600 font-semibold mb-4">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                STT + OCR 통합 번역
              </div>
              <hr className="border-slate-100 mb-4" />
              <ul className="space-y-3 text-sm text-slate-600">
                {['영상 속 음성을 실시간으로 자막화', '화면의 간판, PPT, 손글씨까지 인식', '위치 기반 오버레이로 시각적 표현', '놓치는 정보 없이 완벽한 이해'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* 텍스트 */}
          <div className="w-full md:w-1/2">
            <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
              음성과 화면 텍스트를<br />한번에 번역
            </h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              기존 자막 서비스의 한계를 넘어, 영상 속 모든 언어 정보를 통합적으로 번역합니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 단어 드래그 섹션 ── */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row-reverse items-center gap-16">
          {/* 카드 */}
          <div className="w-full md:w-1/2">
            <div className="rounded-2xl bg-slate-50 p-8 flex flex-col items-center gap-4 shadow-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600">
                <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <p className="text-sm text-slate-400">비디오 프레임 분석</p>
              <div className="w-full rounded-xl bg-white p-4 border border-slate-200">
                <span className="inline-block rounded-lg border-2 border-emerald-400 px-3 py-1 text-sm font-semibold text-slate-700 mb-3">
                  serendipity
                </span>
                <div className="text-sm text-slate-600 space-y-1">
                  <p className="font-medium text-slate-700">📖 단어 의미</p>
                  <p><span className="font-medium">뜻:</span> 우연한 발견, 뜻밖의 행운</p>
                  <p><span className="font-medium">발음:</span> [ˌserənˈdɪpəti]</p>
                  <p className="text-slate-400 italic">"Finding you was pure serendipity."</p>
                </div>
              </div>
            </div>
          </div>
          {/* 텍스트 */}
          <div className="w-full md:w-1/2">
            <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
              단어를 드래그하면<br />바로 의미 확인
            </h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              영상 시청 흐름을 방해하지 않고, 궁금한 단어의 뜻과 발음, 예문을 즉시 확인할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 관용 표현 섹션 ── */}
      <section className="bg-slate-50 py-24 px-6">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center gap-16">
          {/* 카드 */}
          <div className="w-full md:w-1/2">
            <div className="rounded-2xl bg-slate-800 p-6 shadow-lg">
              <div className="flex items-center gap-2 text-white font-semibold mb-4">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                문맥 기반 해설
              </div>
              {[
                { expr: '"Break a leg!"', meaning: '행운을 빌어! (공연 전 격려 표현)' },
                { expr: '"Piece of cake"', meaning: '식은 죽 먹기, 아주 쉬운 일' },
                { expr: '"Hit the books"', meaning: '열심히 공부하다' },
              ].map((item) => (
                <div key={item.expr} className="mb-3 rounded-xl bg-slate-700 px-4 py-3">
                  <p className="text-sm font-semibold text-white">{item.expr}</p>
                  <p className="text-xs text-emerald-400 mt-1">→ {item.meaning}</p>
                </div>
              ))}
            </div>
          </div>
          {/* 텍스트 */}
          <div className="w-full md:w-1/2">
            <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
              관용 표현과 맥락까지<br />함께 학습
            </h2>
            <p className="mt-4 text-slate-500 leading-relaxed">
              단순 번역을 넘어 표현의 의미와 사용 상황까지 이해하고, 문장 구조를 분석하여 깊이 있는 학습이 가능합니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 기능 6개 그리드 ── */}
      <section className="py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl font-extrabold text-center text-slate-900">영상 시청이 곧 학습이 됩니다</h2>
          <p className="mt-4 text-center text-slate-500">
            모든 기능이 하나의 플랫폼에서, 영상을 보면서 자연스럽게 언어를 학습하세요
          </p>
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10">
            {[
              {
                icon: '✦',
                bg: 'bg-emerald-100',
                color: 'text-emerald-600',
                title: 'AI 자막 생성',
                desc: '영상을 업로드하면 AI가 음성을 인식하여 자동으로 정확한 자막을 생성합니다.',
              },
              {
                icon: '🌐',
                bg: 'bg-teal-100',
                color: 'text-teal-600',
                title: '화면 텍스트 인식',
                desc: '영상 속 간판, PPT, 손글씨 등 화면의 모든 텍스트를 OCR로 인식하고 번역합니다.',
              },
              {
                icon: '▣',
                bg: 'bg-cyan-100',
                color: 'text-cyan-600',
                title: '위치 기반 오버레이',
                desc: '화면 텍스트를 원본 위치에 오버레이로 표시하여 시각적 맥락을 유지합니다.',
              },
              {
                icon: '⚡',
                bg: 'bg-emerald-100',
                color: 'text-emerald-600',
                title: '즉시 단어 검색',
                desc: '자막이나 텍스트를 드래그하면 뜻, 발음, 예문을 바로 확인할 수 있습니다.',
              },
              {
                icon: '📖',
                bg: 'bg-teal-100',
                color: 'text-teal-600',
                title: '학습 노트 저장',
                desc: '학습한 단어와 표현을 노트에 저장하고 언제든지 복습할 수 있습니다.',
              },
              {
                icon: '💬',
                bg: 'bg-cyan-100',
                color: 'text-cyan-600',
                title: '문맥 분석',
                desc: '관용 표현의 의미와 문장 구조를 분석하여 깊이 있는 학습을 제공합니다.',
              },
            ].map((feat) => (
              <div key={feat.title} className="flex flex-col items-center text-center">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${feat.bg} ${feat.color}`}>
                  {feat.icon}
                </div>
                <h3 className="mt-4 font-bold text-slate-800">{feat.title}</h3>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA 섹션 ── */}
      <section className="bg-emerald-700 py-24 px-6 text-center text-white">
        <h2 className="text-4xl font-extrabold leading-tight">
          영상 속 모든 언어,<br />지금 바로 이해하세요
        </h2>
        <p className="mt-4 text-emerald-100">
          무료로 시작하고 영상 시청과 동시에 자연스럽게 언어를 학습하세요
        </p>
        <button
          onClick={() => navigate('/login')}
          className="mt-10 rounded-xl bg-white px-8 py-4 text-base font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
        >
          무료로 시작하기 →
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100 py-8 px-6">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600">
              <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <span className="font-bold text-slate-700">OverLang</span>
          </div>
          <p className="text-sm text-slate-400">© 2026 OverLang. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
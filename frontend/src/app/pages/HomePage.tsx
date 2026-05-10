import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { Header } from '@/components/layout/Header';

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const heroRef = useScrollReveal();
  const statsRef = useScrollReveal();
  const sttRef = useScrollReveal();
  const dragRef = useScrollReveal();
  const idiomRef = useScrollReveal();
  const featRef = useScrollReveal();
  const ctaRef = useScrollReveal();

  return (
    <div className="min-h-screen bg-white text-slate-800 overflow-x-hidden">

      <Header />

      {/* ── Hero ── */}
      <section
        ref={heroRef}
        className="relative flex flex-col items-center justify-center px-6 pt-28 pb-32 text-center opacity-0 translate-y-8 transition-all duration-700 ease-out overflow-hidden"
      >
        {/* 배경 그라디언트 블롭 */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-br from-emerald-100 via-teal-50 to-transparent rounded-full blur-3xl opacity-60 pointer-events-none" />

        {/* 뱃지 */}
        <div className="relative inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 mb-6">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-medium text-emerald-700">AI 기반 영상 언어 학습 플랫폼</span>
        </div>

        <h1 className="relative text-5xl font-extrabold leading-tight text-slate-900 md:text-7xl max-w-4xl">
          영상 속 모든 언어를<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">
            이해하고 학습
          </span>하세요
        </h1>

        <p className="relative mt-6 max-w-xl text-lg text-slate-500 leading-relaxed">
          음성 자막은 물론 화면에 보이는 모든 텍스트까지,<br />
          AI가 통합 번역하여 완벽한 이해를 돕습니다.
        </p>

        <div className="relative mt-10 flex items-center gap-4">
          <button
            onClick={() => navigate(user ? '/upload' : '/login')}
            className="rounded-xl bg-emerald-600 px-8 py-4 text-base font-semibold text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-200 hover:shadow-emerald-300 hover:-translate-y-0.5"
          >
            {user ? '지금 시작하기 →' : '무료로 시작하기 →'}
          </button>
          <button
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="rounded-xl px-8 py-4 text-base font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
          >
            기능 살펴보기
          </button>
        </div>

        {/* 데모 영역 */}
        <div className="relative mt-16 w-full max-w-4xl">
          <div className="rounded-2xl bg-slate-900 aspect-video flex items-center justify-center shadow-2xl shadow-slate-300 ring-1 ring-slate-200 overflow-hidden">
            {/* 영상 플레이어 목업 */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
            {/* OCR 오버레이 목업 */}
            <div className="absolute top-6 left-6 bg-black/60 border border-yellow-400 rounded px-3 py-1.5 text-xs text-white backdrop-blur-sm">
              <p className="text-yellow-300 line-through text-[10px]">Learning Platform</p>
              <p>학습 플랫폼</p>
            </div>
            <div className="absolute top-6 right-6 bg-black/60 border border-yellow-400 rounded px-3 py-1.5 text-xs text-white backdrop-blur-sm">
              <p className="text-yellow-300 line-through text-[10px]">Chapter 1</p>
              <p>챕터 1</p>
            </div>
            {/* 자막 */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/70 rounded-xl px-6 py-3 text-center backdrop-blur-sm">
              <p className="text-white text-sm font-medium">Let's get the ball rolling.</p>
              <p className="text-emerald-400 text-sm mt-0.5">자, 시작해봅시다.</p>
            </div>
            {/* 플레이 버튼 */}
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/30 hover:bg-white/30 transition-colors cursor-pointer">
              <svg className="h-7 w-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          {/* 하단 그림자 효과 */}
          <div className="absolute -bottom-6 left-4 right-4 h-12 bg-slate-200 blur-xl rounded-full opacity-50" />
        </div>
      </section>

      {/* ── 통계 ── */}
      <section
        ref={statsRef}
        className="py-16 px-6 border-y border-slate-100 opacity-0 translate-y-8 transition-all duration-700 ease-out"
      >
        <div className="mx-auto max-w-4xl grid grid-cols-3 gap-8 text-center">
          {[
            { value: '6개+', label: '지원 언어' },
            { value: 'AI', label: 'STT + OCR 통합 분석' },
            { value: '100%', label: '무료로 시작' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl font-extrabold text-slate-900">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── STT + OCR 섹션 ── */}
      <section
        ref={sttRef}
        id="features"
        className="py-28 px-6 opacity-0 translate-y-8 transition-all duration-700 ease-out"
      >
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center gap-16">
          {/* 카드 */}
          <div className="w-full md:w-1/2">
            <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-8 shadow-xl shadow-emerald-50">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <span className="font-bold text-emerald-700">STT + OCR 통합 번역</span>
              </div>
              {/* 자막 미리보기 */}
              <div className="space-y-3">
                {[
                  { time: '00:00:03', text: 'Welcome to our learning session!', trans: '학습 세션에 오신 것을 환영합니다!' },
                  { time: '00:00:07', text: "Today we'll cover business idioms.", trans: '오늘은 비즈니스 관용구를 다룹니다.' },
                  { time: '00:00:12', text: "Let's get started right away.", trans: '바로 시작해봅시다.' },
                ].map((sub) => (
                  <div key={sub.time} className="rounded-xl bg-white border border-emerald-100 px-4 py-3 shadow-sm">
                    <p className="text-[10px] text-slate-400 mb-1">{sub.time}</p>
                    <p className="text-sm text-slate-700">{sub.text}</p>
                    <p className="text-sm text-emerald-600 font-medium">{sub.trans}</p>
                  </div>
                ))}
              </div>
              {/* OCR 오버레이 예시 */}
              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 rounded-xl bg-slate-800 px-4 py-3 flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                  <div>
                    <p className="text-yellow-300 text-[10px] line-through">Business Idioms</p>
                    <p className="text-white text-xs">비즈니스 관용구</p>
                  </div>
                </div>
                <div className="flex-1 rounded-xl bg-slate-800 px-4 py-3 flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                  <div>
                    <p className="text-yellow-300 text-[10px] line-through">Chapter 1</p>
                    <p className="text-white text-xs">챕터 1</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* 텍스트 */}
          <div className="w-full md:w-1/2">
            <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 mb-4">핵심 기능 01</span>
            <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
              음성과 화면 텍스트를<br />한번에 번역
            </h2>
            <p className="mt-4 text-slate-500 leading-relaxed text-lg">
              기존 자막 서비스의 한계를 넘어, 영상 속 모든 언어 정보를 통합적으로 번역합니다.
            </p>
            <ul className="mt-6 space-y-3">
              {['영상 속 음성을 자동으로 자막화', '화면의 간판·PPT·손글씨까지 인식', '위치 기반 오버레이로 시각적 표현'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-3 w-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 단어 드래그 섹션 ── */}
      <section
        ref={dragRef}
        className="py-28 px-6 bg-slate-50 opacity-0 translate-y-8 transition-all duration-700 ease-out"
      >
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row-reverse items-center gap-16">
          {/* 카드 */}
          <div className="w-full md:w-1/2">
            <div className="rounded-3xl bg-white border border-slate-200 p-8 shadow-xl">
              {/* 자막 텍스트 */}
              <div className="rounded-xl bg-slate-50 p-4 mb-4">
                <p className="text-xs text-slate-400 mb-2">자막 텍스트</p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  These phrases will help you sound more{' '}
                  <span className="inline-block rounded-lg border-2 border-violet-400 bg-violet-50 px-2 py-0.5 text-sm font-semibold text-violet-700 cursor-pointer">
                    natural
                  </span>{' '}
                  in professional settings.
                </p>
              </div>
              {/* 단어 해설 카드 */}
              <div className="rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xl font-bold text-slate-800">natural</span>
                  <span className="text-xs text-slate-400 bg-white rounded-full px-3 py-1 border border-slate-200">00:00:12</span>
                </div>
                <p className="text-sm text-slate-500 mb-1">[ˈnætʃərəl]</p>
                <p className="text-sm font-medium text-slate-700 mb-3">자연스러운, 타고난</p>
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-600 mb-1">영상에서의 의미</p>
                  <p className="text-xs text-slate-600">전문적인 상황에서 어색하지 않게 들린다는 뜻으로 사용됨</p>
                </div>
                <button className="mt-3 w-full rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-colors">
                  학습 노트에 저장
                </button>
              </div>
            </div>
          </div>
          {/* 텍스트 */}
          <div className="w-full md:w-1/2">
            <span className="inline-block rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 mb-4">핵심 기능 02</span>
            <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
              단어를 드래그하면<br />바로 의미 확인
            </h2>
            <p className="mt-4 text-slate-500 leading-relaxed text-lg">
              영상 시청 흐름을 방해하지 않고, 궁금한 단어의 뜻과 발음, 예문을 즉시 확인할 수 있습니다.
            </p>
            <ul className="mt-6 space-y-3">
              {['드래그만으로 즉시 단어 검색', '발음·뜻·예문 한 번에 확인', '영상 맥락에 맞는 의미 제공', '학습 노트에 바로 저장'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100">
                    <svg className="h-3 w-3 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 관용 표현 섹션 ── */}
      <section
        ref={idiomRef}
        className="py-28 px-6 opacity-0 translate-y-8 transition-all duration-700 ease-out"
      >
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center gap-16">
          {/* 카드 */}
          <div className="w-full md:w-1/2">
            <div className="rounded-3xl bg-slate-900 p-8 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <span className="font-bold text-white">문맥 기반 해설</span>
              </div>
              <div className="space-y-3">
                {[
                  { expr: '"Break a leg!"', meaning: '행운을 빌어! (공연 전 격려 표현)', color: 'border-orange-400 bg-orange-400/10' },
                  { expr: '"Piece of cake"', meaning: '식은 죽 먹기, 아주 쉬운 일', color: 'border-emerald-400 bg-emerald-400/10' },
                  { expr: '"Hit the books"', meaning: '열심히 공부하다', color: 'border-blue-400 bg-blue-400/10' },
                  { expr: '"Under the weather"', meaning: '몸이 좋지 않다, 컨디션이 안 좋다', color: 'border-purple-400 bg-purple-400/10' },
                ].map((item) => (
                  <div key={item.expr} className={`rounded-xl border ${item.color} px-4 py-3`}>
                    <p className="text-sm font-semibold text-white">{item.expr}</p>
                    <p className="text-xs text-emerald-400 mt-1">→ {item.meaning}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* 텍스트 */}
          <div className="w-full md:w-1/2">
            <span className="inline-block rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 mb-4">핵심 기능 03</span>
            <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
              관용 표현과 맥락까지<br />함께 학습
            </h2>
            <p className="mt-4 text-slate-500 leading-relaxed text-lg">
              단순 번역을 넘어 표현의 의미와 사용 상황까지 이해하고, 문장 구조를 분석하여 깊이 있는 학습이 가능합니다.
            </p>
            <ul className="mt-6 space-y-3">
              {['관용구·숙어의 실제 의미 해설', '문장 구조 분석 기능', '영상 맥락에서의 사용 예시', '저장 후 반복 학습 가능'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100">
                    <svg className="h-3 w-3 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 기능 그리드 ── */}
      <section
        ref={featRef}
        className="py-28 px-6 bg-slate-50 opacity-0 translate-y-8 transition-all duration-700 ease-out"
      >
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="inline-block rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 mb-4">모든 기능</span>
            <h2 className="text-4xl font-extrabold text-slate-900">영상 시청이 곧 학습이 됩니다</h2>
            <p className="mt-4 text-slate-500 text-lg">모든 기능이 하나의 플랫폼에서, 영상을 보면서 자연스럽게 언어를 학습하세요</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { icon: '✦', bg: 'bg-emerald-600', title: 'AI 자막 생성', desc: '영상을 업로드하면 AI가 음성을 인식하여 자동으로 정확한 자막을 생성합니다.' },
              { icon: '🌐', bg: 'bg-teal-600', title: '화면 텍스트 인식', desc: '영상 속 간판, PPT, 손글씨 등 화면의 모든 텍스트를 OCR로 인식하고 번역합니다.' },
              { icon: '▣', bg: 'bg-cyan-600', title: '위치 기반 오버레이', desc: '화면 텍스트를 원본 위치에 오버레이로 표시하여 시각적 맥락을 유지합니다.' },
              { icon: '⚡', bg: 'bg-violet-600', title: '즉시 단어 검색', desc: '자막이나 텍스트를 드래그하면 뜻, 발음, 예문을 바로 확인할 수 있습니다.' },
              { icon: '📖', bg: 'bg-orange-500', title: '학습 노트 저장', desc: '학습한 단어와 표현을 노트에 저장하고 언제든지 복습할 수 있습니다.' },
              { icon: '💬', bg: 'bg-pink-600', title: '문맥 분석', desc: '관용 표현의 의미와 문장 구조를 분석하여 깊이 있는 학습을 제공합니다.' },
            ].map((feat) => (
              <div
                key={feat.title}
                className="group rounded-2xl bg-white border border-slate-200 p-6 hover:border-slate-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl text-white ${feat.bg} mb-4`}>
                  {feat.icon}
                </div>
                <h3 className="font-bold text-slate-800 mb-2">{feat.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        ref={ctaRef}
        className="relative py-28 px-6 text-center overflow-hidden opacity-0 translate-y-8 transition-all duration-700 ease-out"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-teal-500" />
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '60px 60px' }}
        />
        <div className="relative">
          <h2 className="text-4xl md:text-5xl font-extrabold leading-tight text-white">
            영상 속 모든 언어,<br />지금 바로 이해하세요
          </h2>
          <p className="mt-4 text-emerald-100 text-lg">
            무료로 시작하고 영상 시청과 동시에 자연스럽게 언어를 학습하세요
          </p>
          <button
            onClick={() => navigate(user ? '/upload' : '/login')}
            className="mt-10 inline-block rounded-xl bg-white px-10 py-4 text-base font-bold text-emerald-700 hover:bg-emerald-50 transition-all shadow-xl hover:-translate-y-0.5"
          >
            {user ? '지금 시작하기 →' : '무료로 시작하기 →'}
          </button>
        </div>
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

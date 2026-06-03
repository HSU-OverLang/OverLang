import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Header } from '@/components/layout/Header';


// 타이핑 애니메이션 훅
function useTypingEffect(text: string, speed = 60, startDelay = 400) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [text, speed, startDelay]);
  return { displayed, done };
}

// 떠다니는 문자 캔버스 (알파벳·한글·히라가나·가타카나·한자)
function FloatingChars() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -9999, y: -9999 });
  type CharParticle = { x: number; y: number; vx: number; vy: number; char: string; fontSize: number; alpha: number; color: string; rotation: number; rotSpeed: number };
  const chars = useRef<CharParticle[]>([]);
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    const COLORS = ['#10b981', '#14b8a6', '#6366f1', '#a78bfa', '#f59e0b'];
    const POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ가나다라마바사아자차카타파하기니디리미비시이지치키티피히あいうえおかきくけこさしすせそたちつてとなにぬねのアイウエオカキクケコサシスセソタチツテトナニヌネノ茶山水火木金土日月星語言文字学習'.split('');

    chars.current = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      char: POOL[Math.floor(Math.random() * POOL.length)],
      fontSize: Math.random() * 38 + 12,
      alpha: Math.random() * 0.28 + 0.07,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.012,
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      chars.current.forEach(p => {
        const dx = p.x - mouse.current.x;
        const dy = p.y - mouse.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130 && dist > 0) {
          const force = (130 - dist) / 130;
          p.vx += (dx / dist) * force * 0.55;
          p.vy += (dy / dist) * force * 0.55;
        }
        p.vx *= 0.97; p.vy *= 0.97;
        p.x += p.vx; p.y += p.vy;
        p.rotation += p.rotSpeed;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        p.x = Math.max(0, Math.min(canvas.width, p.x));
        p.y = Math.max(0, Math.min(canvas.height, p.y));

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.font = `bold ${p.fontSize}px sans-serif`;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.char, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      });
      raf.current = requestAnimationFrame(animate);
    };
    animate();

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => { mouse.current = { x: -9999, y: -9999 }; };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />;
}

// 방향별 슬라이드 + 순차 등장 헬퍼 컴포넌트
function Anim({
  from = 'up', vis, delay = 0, children, className = '',
}: {
  from?: 'left' | 'right' | 'up';
  vis: boolean;
  delay?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const hidden =
    from === 'left'  ? '-translate-x-16 opacity-0' :
    from === 'right' ? 'translate-x-16 opacity-0'  :
                       'translate-y-10 opacity-0';
  return (
    <div
      className={`transition-all duration-700 ease-out ${vis ? 'opacity-100 translate-x-0 translate-y-0' : hidden} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<number>>(new Set([0]));

  const { displayed: typedLine1, done: line1Done } = useTypingEffect('영상 속 언어를', 70, 300);
  const { displayed: typedLine2 } = useTypingEffect('완전히 이해하세요.', 70, line1Done ? 100 : 99999);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight);
      setVisible(v => new Set([...v, idx]));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const goTo = (idx: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: idx * el.clientHeight, behavior: 'smooth' });
  };

  const fadeIn = (i: number) =>
    `transition-all duration-700 ease-out ${visible.has(i) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      <Header />

      {/* ── 스냅 스크롤 컨테이너 ── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-scroll hide-scrollbar"
        style={{ scrollSnapType: 'y mandatory' }}
      >

        {/* ── 1. Hero ── */}
        <div style={{ scrollSnapAlign: 'start', height: '100%' }}>
          <div className="h-full relative flex flex-col items-center justify-center px-6 text-center overflow-hidden bg-white">
            <FloatingChars />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent pointer-events-none" />

            {/* 헤드라인 (타이핑 효과) */}
            <h1 className="relative z-10 text-4xl sm:text-5xl md:text-7xl font-black leading-[1.2] text-slate-900 tracking-normal max-w-3xl">
              <span className="block">
                {typedLine1}
              </span>
              <span className="block text-emerald-500 min-h-[1.1em]">
                {typedLine2}
              </span>
            </h1>

            <p className="relative z-10 mt-6 text-base sm:text-lg text-slate-500 leading-relaxed font-normal px-2">
              음성 자막부터 화면 텍스트까지, AI가 영상 속 모든 언어를 통합 번역합니다.
            </p>

            <div className="relative z-10 mt-10">
              <button
                onClick={() => navigate(user ? '/upload' : '/login')}
                className="rounded-2xl bg-slate-900 px-10 py-4 text-base font-bold text-white hover:bg-slate-700 transition-all shadow-xl shadow-slate-200 hover:shadow-slate-300 hover:-translate-y-0.5"
              >
                {user ? '지금 시작하기 →' : '무료로 시작하기 →'}
              </button>
            </div>

            {/* 스크롤 힌트 */}
            <button onClick={() => goTo(1)} className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 text-slate-300 hover:text-slate-500 transition-colors">
              <svg className="h-5 w-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── 2. 데모 영상 ── */}
        <div id="features" style={{ scrollSnapAlign: 'start', height: '100%' }}>
          <div className={`h-full relative flex flex-col items-center justify-center px-6 md:px-16 overflow-hidden bg-slate-50 ${fadeIn(1)}`}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_theme(colors.emerald.50),_transparent_60%)] pointer-events-none" />

            <div className="relative w-full max-w-5xl">
              <div className="text-center mb-6">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1 mb-3">
                </span>
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
                  실제로 이렇게 <span className="text-emerald-600">동작합니다.</span>
                </h2>
                <p className="mt-2 text-slate-500 text-sm">음성 자막과 화면 텍스트를 동시에 번역하는 OverLang</p>
              </div>

              {/* 영상 플레이어 */}
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-2xl shadow-slate-200/60 bg-slate-900">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/80">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                  <span className="ml-3 text-xs text-slate-400 font-mono">overlang — 실시간 번역</span>
                </div>
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    src="https://www.youtube.com/embed/TfoY9JN3bec?autoplay=0&rel=0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. 단어 검색 ── */}
        <div id="how" style={{ scrollSnapAlign: 'start', height: '100%' }}>
          <div className="h-full relative flex flex-col md:flex-row-reverse items-center justify-center gap-14 px-8 md:px-20 overflow-hidden bg-white">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_theme(colors.violet.50),_transparent_60%)] pointer-events-none" />

            <div className="relative w-full md:w-1/2 max-w-md">
              <Anim from="right" vis={visible.has(2)} delay={0}>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-3 py-1 mb-5">
                  <span className="h-1 w-1 rounded-full bg-violet-500" />Feature 01
                </span>
              </Anim>
              <Anim from="up" vis={visible.has(2)} delay={120}>
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 leading-[1.2] tracking-tight">
                  단어 드래그,<br />
                  <span className="text-violet-600">즉시 의미 확인</span>
                </h2>
              </Anim>
              <Anim from="up" vis={visible.has(2)} delay={240}>
                <p className="mt-5 text-slate-500 leading-relaxed text-base">
                  영상 흐름을 끊지 않고, 자막 속 궁금한 단어를 드래그하면 <br/> <span className="whitespace-nowrap">뜻·발음·예문</span>을 즉시 확인하고 학습 노트에 저장할 수 있어요.
                </p>
              </Anim>
              <Anim from="up" vis={visible.has(2)} delay={360}>
                <ul className="mt-7 space-y-3">
                  {[
                    '자막 텍스트 드래그만으로 단어 검색',
                    '발음기호 · 뜻 · 예문 한 번에 확인',
                    '영상 맥락에 맞는 의미 자동 제공',
                    '학습 노트에 바로 저장',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 shrink-0">
                        <svg className="h-3 w-3 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Anim>
            </div>

            <Anim from="left" vis={visible.has(2)} delay={200} className="hidden md:block relative w-full md:w-1/2 max-w-sm">
              <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-xl shadow-slate-100">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 mb-4">
                  <p className="text-xs text-slate-400 mb-3">자막 텍스트</p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    These phrases will help you sound more{' '}
                    <span className="inline-block rounded-lg border-2 border-violet-400 bg-violet-50 px-2 py-0.5 text-sm font-bold text-violet-700 cursor-pointer">
                      natural
                    </span>{' '}
                    in professional settings.
                  </p>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xl font-black text-slate-900">natural</span>
                    <span className="text-xs text-slate-400 bg-white rounded-full px-3 py-1 border border-slate-200 font-mono">00:00:12</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">자연스러운, 타고난</p>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                    <p className="text-xs font-bold text-amber-600 mb-1">영상에서의 의미</p>
                    <p className="text-xs text-slate-600">전문적인 상황에서 어색하지 않게 들린다는 뜻</p>
                  </div>
                  <button className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-xs font-bold text-white transition-colors">
                    학습 노트에 저장
                  </button>
                </div>
              </div>
            </Anim>
          </div>
        </div>

        {/* ── 4. Feature 02 - AI 영상 요약 ── */}
        <div style={{ scrollSnapAlign: 'start', height: '100%' }}>
          <div className="h-full relative flex flex-col md:flex-row items-center justify-center gap-14 px-8 md:px-20 overflow-hidden bg-slate-50">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_theme(colors.amber.50),_transparent_60%)] pointer-events-none" />

            <div className="relative w-full md:w-1/2 max-w-md">
              <Anim from="left" vis={visible.has(3)} delay={0}>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-3 py-1 mb-5">
                  <span className="h-1 w-1 rounded-full bg-amber-500" />Feature 02
                </span>
              </Anim>
              <Anim from="up" vis={visible.has(3)} delay={120}>
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 leading-[1.2] tracking-tight">
                  영상 하나로<br />
                  <span className="text-amber-500">완성되는 요약</span>
                </h2>
              </Anim>
              <Anim from="up" vis={visible.has(3)} delay={240}>
                <p className="mt-5 text-slate-500 leading-relaxed text-base">
                  AI가 영상 전체 내용을 자동으로 요약하고, <br/> 자주 등장한 핵심 단어와 관용 표현까지 한 번에 정리해드려요.
                </p>
              </Anim>
              <Anim from="up" vis={visible.has(3)} delay={360}>
                <ul className="mt-7 space-y-3">
                  {[
                    '영상 내용 전체를 한 눈에 파악',
                    '빈출 단어·숙어 자동 추출',
                    '관용 표현의 실제 의미 해설',
                    '학습 콘텐츠로 바로 활용',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 shrink-0">
                        <svg className="h-3 w-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Anim>
            </div>

            {/* 데모 카드 */}
            <Anim from="right" vis={visible.has(3)} delay={200} className="hidden md:block relative w-full md:w-1/2 max-w-sm">
              <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-xl shadow-slate-100">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100">
                    <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-slate-800">AI 영상 요약</p>
                </div>
                <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3.5 mb-3">
                  <p className="text-xs font-bold text-amber-700 mb-1.5">📋 영상 요약</p>
                  <p className="text-xs text-slate-600 leading-relaxed">이 영상은 일상 영어에서 자주 쓰이는 비즈니스 관용구를 소개합니다. 자연스러운 표현을 통해 영어 회화 실력을 향상시키는 방법을 다룹니다.</p>
                </div>
                <div className="mb-3">
                  <p className="text-xs font-bold text-slate-600 mb-2">🔑 빈출 단어</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['idiom', 'professional', 'natural', 'fluent', 'context'].map(w => (
                      <span key={w} className="text-xs bg-slate-100 text-slate-600 rounded-lg px-2.5 py-1 font-medium">{w}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-2">💬 관용 표현</p>
                  <div className="space-y-1.5">
                    {[
                      { expr: 'get the ball rolling', meaning: '일을 시작하다' },
                      { expr: 'think outside the box', meaning: '창의적으로 생각하다' },
                    ].map(e => (
                      <div key={e.expr} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                        <span className="text-xs font-semibold text-slate-700 italic">"{e.expr}"</span>
                        <span className="text-xs text-amber-600 font-medium">{e.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Anim>
          </div>
        </div>

        {/* ── 5. Feature 03 - 학습 노트 ── */}
        <div style={{ scrollSnapAlign: 'start', height: '100%' }}>
          <div className="h-full relative flex flex-col md:flex-row-reverse items-center justify-center gap-14 px-8 md:px-20 overflow-hidden bg-white">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_theme(colors.pink.50),_transparent_60%)] pointer-events-none" />

            <div className="relative w-full md:w-1/2 max-w-md">
              <Anim from="right" vis={visible.has(4)} delay={0}>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase text-pink-600 bg-pink-50 border border-pink-100 rounded-full px-3 py-1 mb-5">
                  <span className="h-1 w-1 rounded-full bg-pink-500" />Feature 03
                </span>
              </Anim>
              <Anim from="up" vis={visible.has(4)} delay={120}>
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 leading-[1.2] tracking-tight">
                  저장하고<br />
                  <span className="text-pink-500">언제든 복습</span>
                </h2>
              </Anim>
              <Anim from="up" vis={visible.has(4)} delay={240}>
                <p className="mt-5 text-slate-500 leading-relaxed text-base">
                  영상에서 배운 단어와 표현을 학습 노트에 저장하세요. <br/> 나만의 단어장으로 언제 어디서든 꺼내볼 수 있어요.
                </p>
              </Anim>
              <Anim from="up" vis={visible.has(4)} delay={360}>
                <ul className="mt-7 space-y-3">
                  {[
                    '단어 저장 시 뜻·예문 자동 포함',
                    '어떤 영상에서 배웠는지 맥락 보존',
                    '플래시카드 모드로 집중 암기',
                    '학습한 단어 통계 확인',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pink-100 shrink-0">
                        <svg className="h-3 w-3 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Anim>
            </div>

            {/* 데모 카드 */}
            <Anim from="left" vis={visible.has(4)} delay={200} className="hidden md:block relative w-full md:w-1/2 max-w-sm">
              <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-xl shadow-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-100">
                      <svg className="h-4 w-4 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold text-slate-800">학습 노트</p>
                  </div>
                  <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2.5 py-1">24개 저장됨</span>
                </div>
                <div className="space-y-2.5">
                  {[
                    { word: 'eloquent', meaning: '유창한, 설득력 있는', source: '비즈니스 영어 강의', time: '방금' },
                    { word: 'leverage', meaning: '활용하다, 지렛대 효과', source: '고독한 미식가', time: '어제' },
                    { word: 'resilient', meaning: '회복력 있는, 탄력적인', source: 'BBC 뉴스', time: '2일 전' },
                  ].map(item => (
                    <div key={item.word} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold text-slate-800">{item.word}</span>
                          <span className="text-[10px] text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5">{item.time}</span>
                        </div>
                        <p className="text-xs text-slate-500">{item.meaning}</p>
                        <p className="text-[10px] text-pink-400 mt-0.5">📌 {item.source}</p>
                      </div>
                      <div className="h-8 w-8 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center shrink-0">
                        <svg className="h-3.5 w-3.5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Anim>
          </div>
        </div>

        {/* ── 6. 기능 그리드 ── */}
        <div style={{ scrollSnapAlign: 'start', height: '100%' }}>
          <div className="h-full relative flex flex-col items-center justify-center px-8 md:px-20 overflow-hidden bg-slate-50">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_theme(colors.teal.50),_transparent_70%)] pointer-events-none" />

            <div className="relative w-full max-w-5xl">
              <Anim from="up" vis={visible.has(5)} delay={0} className="text-center mb-10">

                <h2 className="text-4xl md:text-5xl font-black text-slate-900 leading-tight">
                  영상 시청이 곧 <span className="text-teal-600">언어 학습</span>
                </h2>
                <p className="mt-3 text-slate-500 text-base">모든 기능이 하나의 플랫폼에서</p>
              </Anim>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  {
                    svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />,
                    color: 'text-emerald-600',
                    bg: 'bg-white border-emerald-100 hover:border-emerald-200',
                    title: 'AI 음성 자막',
                    desc: 'STT로 영상 음성을 자동 인식해 정확한 자막과 번역을 생성',
                  },
                  {
                    svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z" />,
                    color: 'text-teal-600',
                    bg: 'bg-white border-teal-100 hover:border-teal-200',
                    title: '화면 텍스트 번역',
                    desc: '간판·손글씨 등 화면 속 모든 텍스트를 OCR로 인식·번역',
                  },
                  {
                    svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />,
                    color: 'text-violet-600',
                    bg: 'bg-white border-violet-100 hover:border-violet-200',
                    title: '위치 기반 오버레이',
                    desc: '번역 텍스트를 원문 위치 그대로 화면에 오버레이로 표시',
                  },
                  {
                    svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />,
                    color: 'text-orange-600',
                    bg: 'bg-white border-orange-100 hover:border-orange-200',
                    title: '즉시 단어 검색',
                    desc: '자막 드래그로 뜻·발음·예문을 영상 흐름 끊김 없이 확인',
                  },
                  {
                    svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
                    color: 'text-pink-600',
                    bg: 'bg-white border-pink-100 hover:border-pink-200',
                    title: '학습 노트',
                    desc: '단어·표현을 저장하고 나만의 학습 노트로 언제든 복습',
                  },
                  {
                    svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />,
                    color: 'text-cyan-600',
                    bg: 'bg-white border-cyan-100 hover:border-cyan-200',
                    title: 'AI 영상 요약',
                    desc: '영상 내용 요약과 빈출 단어·관용 표현을 자동으로 정리',
                  },
                ].map((feat, idx) => (
                  <div
                    key={feat.title}
                    className={`rounded-2xl border ${feat.bg} p-5 hover:-translate-y-1 hover:shadow-md cursor-default
                      transition-all duration-700 ease-out
                      ${visible.has(5) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                    style={{ transitionDelay: visible.has(5) ? `${100 + idx * 80}ms` : '0ms' }}
                  >
                    <svg className={`h-6 w-6 mb-3 ${feat.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{feat.svg}</svg>
                    <h3 className="font-bold text-slate-900 text-sm mb-1">{feat.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{feat.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── 5. CTA ── */}
        <div id="start" style={{ scrollSnapAlign: 'start', height: '100%' }}>
          <div className={`h-full relative flex flex-col items-center justify-center px-6 text-center overflow-hidden bg-white ${fadeIn(6)}`}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_theme(colors.emerald.50),_transparent_70%)] pointer-events-none" />

            <div className="relative max-w-xl">

              <h2 className="text-4xl sm:text-5xl md:text-7xl font-black text-slate-900 leading-[1.0] tracking-normal mb-6">
                지금 바로 <span className="text-emerald-500">시작하세요.</span>
              </h2>
              <p className="text-base sm:text-lg text-slate-500 font-normal mb-10 leading-relaxed">
                무료로 시작하고, 영상 시청과 동시에 자연스럽게 언어를 학습하세요.
              </p>
              <button
                onClick={() => navigate(user ? '/upload' : '/join')}
                className="rounded-2xl bg-slate-900 px-12 py-4 text-base font-bold text-white hover:bg-slate-700 transition-all shadow-xl shadow-slate-200 hover:shadow-slate-300 hover:-translate-y-0.5"
              >
                {user ? '영상 업로드하기 →' : '무료로 시작하기 →'}
              </button>
            </div>

            <p className="absolute bottom-6 text-xs text-slate-300">© 2026 OverLang. All rights reserved.</p>
          </div>
        </div>

      </div>

    </div>
  );
}

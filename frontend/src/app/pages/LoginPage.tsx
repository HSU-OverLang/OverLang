import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loginWithGoogle, loginWithEmail, error, clearError } = useAuth();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleClick = async () => {
    clearError();
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch {
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── 왼쪽 브랜딩 패널 ── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col bg-gradient-to-br from-emerald-600 to-teal-500 p-12 text-white">
        <div className="flex-1 flex flex-col justify-center">
          <h2 className="text-4xl font-extrabold leading-tight mb-4">
            영상 속 모든 언어를<br />이해하고 학습하세요.
          </h2>
          <p className="text-emerald-100 text-lg leading-relaxed">
            AI가 음성과 화면 텍스트를 통합 번역하여 완벽한 영상 학습 경험을 제공합니다.
          </p>
          <div className="mt-10 space-y-4">
            {[
              {
                text: 'AI 자막 자동 생성',
                svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />,
              },
              {
                text: '화면 텍스트 OCR 번역',
                svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />,
              },
              {
                text: '단어 드래그 즉시 검색',
                svg: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
              },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">{item.svg}</svg>
                </span>
                <span className="text-emerald-50">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-emerald-200 text-sm">© 2026 OverLang. All rights reserved.</p>
      </div>

      {/* ── 오른쪽 로그인 폼 ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">

          <h1 className="text-3xl font-extrabold text-slate-900 mb-1">다시 만나요!</h1>
          <p className="text-slate-500 mb-8">계정에 로그인하여 학습을 계속하세요.</p>

          {/* 에러 */}
          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              아이디 또는 비밀번호가 올바르지 않습니다.
            </div>
          )}

          {/* Google 로그인 */}
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <GoogleIcon />
            Google로 계속하기
          </button>

          {/* 구분선 */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-400">또는 이메일로 로그인</span>
            </div>
          </div>

          {/* 폼 */}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">이메일</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-700">비밀번호</label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-xs text-emerald-600 hover:text-emerald-500 transition-colors"
                >
                  비밀번호 찾기
                </button>
              </div>
              <input
                type="password"
                placeholder="비밀번호를 입력하세요."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-100 hover:shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  로그인 중...
                </span>
              ) : '로그인'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            아직 계정이 없으신가요?{' '}
            <button
              type="button"
              onClick={() => navigate('/join')}
              className="font-semibold text-emerald-600 hover:text-emerald-500 transition-colors"
            >
              무료 회원가입
            </button>
          </p>
          <p className="text-[11px] text-slate-300 text-center mt-8">© 2026 OverLang. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

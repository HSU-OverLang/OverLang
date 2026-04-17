import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/utils/cn';

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
      // error is set in AuthProvider
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
      // error is set in AuthProvider
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-lg">

        {/* 헤더 */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">로그인</h1>
          <p className="text-sm text-slate-500">계정에 로그인하세요</p>
        </div>

        {/* 에러 */}
        {error && (
          <div role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-600 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* Google 로그인 */}
        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={submitting}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300',
            'bg-white px-4 py-3 font-medium text-slate-700',
            'hover:bg-slate-50 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <GoogleIcon />
          Google로 로그인
        </button>

        {/* 구분선 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 text-slate-400">또는</span>
          </div>
        </div>

        {/* 폼 */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {/* 이메일 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">이메일</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-3 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* 비밀번호 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">비밀번호</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-3 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'w-full rounded-lg px-4 py-3 font-medium transition-colors',
              'bg-emerald-600 text-white hover:bg-emerald-500',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {submitting ? '로그인 중...' : '로그인'}
          </button>

          <p className="text-center text-sm text-slate-500">
            계정이 없으신가요?{' '}
            <button
              type="button"
              onClick={() => navigate('/join')}
              className="text-emerald-600 hover:text-emerald-500 font-medium"
            >
              회원가입
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
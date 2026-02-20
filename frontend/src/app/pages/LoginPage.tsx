import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/utils/cn';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, loginWithGoogle, loginWithEmail, signUpWithEmail, error, clearError } =
    useAuth();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
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
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-700 bg-slate-900/80 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-center">Over Lang</h1>
        <p className="text-slate-400 text-sm text-center">로그인하여 시작하세요</p>

        {error && (
          <div
            role="alert"
            className="rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 px-3 py-2 text-sm"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={submitting}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-lg border border-slate-600',
            'bg-slate-800 px-4 py-3 font-medium text-slate-100',
            'hover:bg-slate-700 hover:border-slate-500 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <GoogleIcon />
          Google로 로그인
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-600" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-slate-900 px-2 text-slate-500">또는</span>
          </div>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'w-full rounded-lg px-4 py-3 font-medium transition-colors',
              'bg-blue-600 text-white hover:bg-blue-500',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isSignUp ? '회원가입' : '이메일로 로그인'}
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp((v) => !v)}
            className="w-full text-sm text-slate-400 hover:text-slate-300"
          >
            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
          </button>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

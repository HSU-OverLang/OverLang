import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setError('등록되지 않은 이메일이거나 형식이 올바르지 않습니다.');
      } else {
        setError('이메일 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
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
            비밀번호를<br />재설정해드릴게요.
          </h2>
          <p className="text-emerald-100 text-lg leading-relaxed">
            가입한 이메일 주소를 입력하면 재설정 링크를 보내드립니다.
          </p>
        </div>
        <p className="text-emerald-200 text-sm">© 2026 OverLang. All rights reserved.</p>
      </div>

      {/* ── 오른쪽 폼 ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">

          {sent ? (
            /* ── 전송 완료 ── */
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-5">
                <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 mb-2">이메일을 확인해주세요.</h1>
              <p className="text-slate-500 text-sm leading-relaxed mb-2">
                <span className="font-semibold text-slate-700">{email}</span>으로<br />
                비밀번호 재설정 링크를 보내드렸어요.
              </p>
              <p className="text-xs text-slate-400 mb-8">스팸 폴더도 확인해보세요.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-100"
              >
                로그인으로 돌아가기
              </button>
            </div>
          ) : (
            /* ── 이메일 입력 폼 ── */
            <>
              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors mb-6"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                로그인으로 돌아가기
              </button>

              <h1 className="text-3xl font-extrabold text-slate-900 mb-1">비밀번호 찾기</h1>
              <p className="text-slate-500 mb-8">가입한 이메일로 재설정 링크를 보내드려요.</p>

              {error && (
                <div className="mb-5 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">가입한 이메일</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
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
                      전송 중...
                    </span>
                  ) : '재설정 링크 보내기'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <footer className="py-4 text-center">
        <p className="text-xs text-slate-300">© 2026 OverLang. All rights reserved.</p>
      </footer>
    </div>
  );
}

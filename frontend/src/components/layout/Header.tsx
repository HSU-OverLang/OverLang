import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';

const PAGE_TITLES: Record<string, string> = {
  '/mypage': '마이페이지',
  '/words': '학습 노트',
  '/dashboard': '대시보드',
  '/upload': '업로드',
};

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const pageTitle = PAGE_TITLES[location.pathname];

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">

        {/* 왼쪽: 로고 + 페이지 타이틀 */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600">
              <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-slate-800">OverLang</span>
          </Link>
          {pageTitle && (
            <>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-medium text-slate-500">{pageTitle}</span>
            </>
          )}
        </div>

        {/* 오른쪽: 유저 메뉴 */}
        <div className="flex items-center gap-1">
          {user ? (
            <>
              <button
                onClick={() => navigate('/words')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/words'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                학습 노트
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === '/dashboard'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                대시보드
              </button>

              {/* 구분선 */}
              <div className="w-px h-4 bg-slate-200 mx-1" />

              {/* 유저 아바타 + 이름 */}
              <button
                onClick={() => navigate('/mypage')}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 shrink-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} className="h-full w-full rounded-full object-cover" alt="" />
                  ) : (
                    <span className="text-xs font-bold text-white">
                      {(user.displayName ?? user.email ?? 'U')[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium text-slate-700 hidden sm:block">
                  {user.displayName ?? user.email?.split('@')[0]}
                </span>
              </button>

              <button
                onClick={async () => { await logout(); navigate('/'); }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                로그인
              </button>
              <button
                onClick={() => navigate('/join')}
                className="ml-1 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
              >
                무료로 시작 →
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';

export function Header() {
  const { user, logout, profileImageUrl } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const profilePhoto = profileImageUrl || null;

  const displayName = user?.displayName || user?.email?.split('@')[0] || '';

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [dropdownOpen]);

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100 shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">

        {/* ── 로고 ── */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm group-hover:bg-emerald-500 transition-colors">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <span className="text-[15px] font-bold text-slate-800 tracking-tight">OverLang</span>
        </Link>

        {/* ── 오른쪽 영역 ── */}
        <div className="flex items-center gap-1">
          {user ? (
            <>
              {/* 대시보드 링크 */}
              <button
                onClick={() => navigate('/dashboard')}
                className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive('/dashboard')
                    ? 'text-emerald-700 bg-emerald-50'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                대시보드
                {isActive('/dashboard') && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-emerald-500" />
                )}
              </button>

              <div className="w-px h-5 bg-slate-200 mx-2" />

              {/* 유저 드롭다운 */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(o => !o)}
                  className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl transition-all ${
                    dropdownOpen ? 'bg-slate-100' : 'hover:bg-slate-100'
                  }`}
                >
                  {/* 아바타 */}
                  <div className="h-8 w-8 rounded-full overflow-hidden ring-2 ring-white shadow-sm shrink-0 bg-violet-100">
                    {profilePhoto ? (
                      <img src={profilePhoto} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-violet-600">
                        <span className="text-xs font-bold text-white">
                          {displayName[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-700 hidden sm:block max-w-[100px] truncate">
                    {displayName}
                  </span>
                  <svg
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* 드롭다운 메뉴 */}
                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl bg-white shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden z-50">
                    {/* 유저 정보 */}
                    <div className="px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full overflow-hidden shrink-0 bg-violet-100">
                          {profilePhoto ? (
                            <img src={profilePhoto} className="h-full w-full object-cover" alt="" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-violet-600">
                              <span className="text-xs font-bold text-white">{displayName[0]?.toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                          <p className="text-xs text-slate-400 truncate">{user.email}</p>
                        </div>
                      </div>
                    </div>

                    {/* 메뉴 아이템 */}
                    <div className="py-1.5">
                      {[
                        {
                          label: '마이페이지',
                          to: '/mypage',
                          icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
                        },
                        {
                          label: '학습 노트',
                          to: '/study',
                          icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
                        },
                      ].map(item => (
                        <button
                          key={item.to}
                          onClick={() => { navigate(item.to); setDropdownOpen(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                            isActive(item.to)
                              ? 'bg-emerald-50 text-emerald-700 font-medium'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                        >
                          <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                          </svg>
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="mx-3 border-t border-slate-100" />

                    <div className="py-1.5">
                      <button
                        onClick={async () => {
                          setDropdownOpen(false);
                          await logout();
                          navigate('/');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
                      >
                        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        로그아웃
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                로그인
              </button>
              <button
                onClick={() => navigate('/join')}
                className="ml-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors shadow-sm"
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

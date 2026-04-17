import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { Button } from '@/components/ui';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-slate-800 bg-grey-950/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* 로고 */}
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-bold text-black hover:text-blue-400 transition-colors"
        >
          <span className="text-violet-400">⬡</span>
          OverLang
        </Link>

        {/* 우측 버튼 */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
            <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/words')}            
            >
                학습 노트
            </Button>


              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/mypage')}
              >
                마이페이지
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
              >
                로그아웃
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/login')}
              >
                로그인
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/join')}
              >
                회원가입
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
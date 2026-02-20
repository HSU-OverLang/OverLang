import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import './App.css';

function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">로딩 중...</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h1 className="text-3xl font-bold underline">Over Lang</h1>
        {user ? (
          <div className="mt-4 space-y-2">
            <p className="text-slate-600">
              로그인됨: <span className="font-medium text-slate-900">{user.email}</span>
            </p>
            <button
              type="button"
              onClick={logout}
              className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-300"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <Link
              to="/login"
              className="inline-block rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
            >
              로그인
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

export default App;

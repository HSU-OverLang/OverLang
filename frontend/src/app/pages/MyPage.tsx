import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { cn } from '@/utils/cn';

const MOCK_PROJECTS = [
  { id: 1, title: '제품 소개 영상', date: '2026.03.10', duration: '3:45' },
  { id: 2, title: '강의 영상 1강', date: '2026.03.12', duration: '15:20' },
  { id: 3, title: '브이로그 촬영본', date: '2026.03.08', duration: '8:12' },
  { id: 4, title: '인터뷰 영상', date: '2026.03.05', duration: '12:30' },
];

function formatDate(isoString?: string | null) {
  if (!isoString) return '알 수 없음';
  const d = new Date(isoString);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

type SubPage = 'main' | 'settings';

export function MyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subPage, setSubPage] = useState<SubPage>('main');

  const displayName = user?.displayName || user?.email?.split('@')[0] || '사용자';

  if (subPage === 'settings') {
    return (
      <SettingsPage
        onBack={() => setSubPage('main')}
        onDeleteSuccess={() => navigate('/')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col md:flex-row gap-6">

        {/* ── 왼쪽: 프로필 카드 ── */}
        <div className="w-full md:w-64 shrink-0">
          <div className="rounded-2xl bg-white p-6 shadow-sm flex flex-col items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600">
              {user?.photoURL ? (
                <img src={user.photoURL} className="h-full w-full rounded-full object-cover" alt="프로필" />
              ) : (
                <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>

            <div className="text-center">
              <p className="font-bold text-slate-800 text-lg">{displayName}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>

            <div className="w-full space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-xs text-slate-400">이메일</p>
                  <p className="text-sm font-medium text-slate-700 truncate max-w-[140px]">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-xs text-slate-400">가입일</p>
                  <p className="text-sm font-medium text-slate-700">
                    {formatDate(user?.metadata.creationTime)}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSubPage('settings')}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              계정 설정
            </button>
          </div>
        </div>

        {/* ── 오른쪽 ── */}
        <div className="flex-1 space-y-6">

          {/* 최근 프로젝트 */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-800">최근 프로젝트</h2>
              <button
                onClick={() => navigate('/dashboard')}
                className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                전체 보기
              </button>
            </div>
            <div className="space-y-2">
              {MOCK_PROJECTS.map((proj) => (
                <div
                  key={proj.id}
                  className="flex items-center gap-4 rounded-xl hover:bg-slate-50 px-3 py-3 transition-colors cursor-pointer"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 shrink-0">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{proj.title}</p>
                    <p className="text-xs text-slate-400">{proj.date} · {proj.duration}</p>
                  </div>
                  <svg className="h-4 w-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* 새 프로젝트 CTA */}
          <div
            onClick={() => navigate('/upload')}
            className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 p-6 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <p className="font-bold text-white text-lg">새 프로젝트 시작하기</p>
            <p className="text-emerald-100 text-sm mt-1">영상을 업로드하고 AI 자막 생성을 시작하세요</p>
            <button className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors">
              프로젝트 만들기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 계정 설정 서브페이지 ──────────────────────────────
function SettingsPage({
  onBack,
  onDeleteSuccess,
}: {
  onBack: () => void;
  onDeleteSuccess: () => void;
}) {
  const { user, changePassword, deleteAccount, clearError } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | null>(user?.photoURL ?? null);
  const [name, setName] = useState(user?.displayName ?? '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmPw, setConfirmPw] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setProfileImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handlePwChange = async () => {
    setPwError('');
    clearError();
    if (newPw !== newPwConfirm) {
      setPwError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPw.length < 8) {
      setPwError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    try {
      await changePassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setNewPwConfirm('');
      alert('비밀번호가 변경되었습니다.');
    } catch {
      setPwError('현재 비밀번호가 올바르지 않습니다.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('정말로 탈퇴하시겠습니까? 모든 데이터가 삭제됩니다.')) return;
    setDeleteError('');
    try {
      await deleteAccount(confirmPw);
      onDeleteSuccess();
    } catch {
      setDeleteError('비밀번호가 올바르지 않습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">

        {/* 뒤로가기 + 타이틀 */}
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-4"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            마이페이지로 돌아가기
          </button>
          <h1 className="text-xl font-bold text-slate-800">계정 설정</h1>
        </div>

        {/* 프로필 정보 */}
        <div className="rounded-2xl bg-white p-6 shadow-sm space-y-5">
          <h2 className="font-bold text-slate-800">프로필 정보</h2>

          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <div className="h-16 w-16 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                {profileImage ? (
                  <img src={profileImage} className="h-full w-full object-cover" alt="프로필" />
                ) : (
                  <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">프로필 사진</p>
              <p className="text-xs text-slate-400">JPG, PNG 파일 (최대 5MB)</p>
            </div>
          </div>

          <hr className="border-slate-100" />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">이름</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">이메일</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <input
                type="email"
                value={user?.email ?? ''}
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            className={cn(
              'flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-colors',
              saved ? 'bg-green-500' : 'bg-emerald-600 hover:bg-emerald-500'
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {saved ? '저장됨 ✓' : '저장하기'}
          </button>
        </div>

        {/* 비밀번호 변경 */}
        <div className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-800">비밀번호 변경</h2>

          {[
            { label: '현재 비밀번호', placeholder: '현재 비밀번호', value: currentPw, onChange: setCurrentPw },
            { label: '새 비밀번호', placeholder: '새 비밀번호 (8자 이상)', value: newPw, onChange: setNewPw },
            { label: '새 비밀번호 확인', placeholder: '새 비밀번호 확인', value: newPwConfirm, onChange: setNewPwConfirm },
          ].map((field, i) => (
            <div key={field.label} className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{field.label}</label>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type="password"
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  className={cn(
                    'w-full rounded-xl border bg-white pl-10 pr-4 py-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1',
                    i === 2 && pwError
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                      : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500'
                  )}
                />
              </div>
              {i === 2 && pwError && <p className="text-xs text-red-500">{pwError}</p>}
            </div>
          ))}

          <button
            onClick={handlePwChange}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            비밀번호 변경
          </button>
        </div>

        {/* 회원 탈퇴 */}
        <div className="rounded-2xl bg-white border border-red-200 p-6 shadow-sm space-y-3">
          <h2 className="font-bold text-red-600">회원 탈퇴</h2>
          <p className="text-sm text-slate-500">
            계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">비밀번호 확인</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <input
                type="password"
                placeholder="현재 비밀번호 입력"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-slate-800 placeholder-slate-400 focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
            {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
          </div>
          <button
            onClick={handleDeleteAccount}
            className="flex items-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white hover:bg-red-400 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            회원 탈퇴하기
          </button>
        </div>

      </div>
    </div>
  );
}
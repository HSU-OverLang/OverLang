import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { getProjects } from '@/api/video';
import type { ProjectResult } from '@/api/video';
import { getMySavedWords } from '@/api/words';
import { cn } from '@/utils/cn';
import { Header } from '@/components/layout/Header';

const RECENT_PROJECTS_KEY = 'overlang_recent_projects';

function formatDate(isoString?: string | null) {
  if (!isoString) return '알 수 없음';
  const d = new Date(isoString);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function formatStudyTime(minutes: number): string {
  if (minutes <= 0) return '0분';
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

type SubPage = 'main' | 'settings';

type RecentProject = ProjectResult & { clickedAt: string };

export function MyPage() {
  const { user, loading: authLoading, profileImageUrl } = useAuth();
  const navigate = useNavigate();
  const [subPage, setSubPage] = useState<SubPage>('main');
  const [totalProjects, setTotalProjects] = useState<number>(0);
  const [savedWordsCount, setSavedWordsCount] = useState<number>(0);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  const displayName = user?.displayName || user?.email?.split('@')[0] || '사용자';

  useEffect(() => {
    if (authLoading || !user) return;

    // 총 프로젝트 수 + 최근 프로젝트 교차 검증 (삭제된 항목 제거)
    getProjects()
      .then(data => {
        setTotalProjects(data.length);
        const existingIds = new Set(data.map(p => p.id ?? p.projectId));

        // localStorage 최근 프로젝트에서 삭제된 것 제거
        try {
          const recent: RecentProject[] = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? '[]');
          const filtered = recent.filter(p => existingIds.has(p.id ?? p.projectId));
          localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(filtered));
          setRecentProjects(filtered.slice(0, 3));
        } catch { setRecentProjects([]); }
      })
      .catch(() => {
        setTotalProjects(0);
        // API 실패 시 localStorage 그대로 사용
        try {
          const recent: RecentProject[] = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? '[]');
          setRecentProjects(recent.slice(0, 3));
        } catch { setRecentProjects([]); }
      });

    // 저장된 단어 수 (API)
    getMySavedWords()
      .then(words => setSavedWordsCount(words.length))
      .catch(() => setSavedWordsCount(0));
  }, [authLoading, user]);

  if (subPage === 'settings') {
    return (
      <SettingsPage
        onBack={() => setSubPage('main')}
        onDeleteSuccess={() => navigate('/')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      {/* ── 프로필 헤더 ── */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-500 px-6 pt-8 pb-20">
        <div className="mx-auto max-w-5xl flex items-end justify-between">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="h-20 w-20 rounded-2xl overflow-hidden ring-4 ring-white/30 shadow-lg bg-white/20">
                {profileImageUrl ? (
                  <img src={profileImageUrl} className="h-full w-full object-cover" alt="프로필" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <svg className="h-10 w-10 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white">{displayName}</p>
              <p className="text-emerald-100 text-sm mt-0.5">{user?.email}</p>
              <p className="text-emerald-200 text-xs mt-1">가입일 {formatDate(user?.metadata.creationTime)}</p>
            </div>
          </div>
          <button
            onClick={() => setSubPage('settings')}
            className="flex items-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-white transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            계정 설정
          </button>
        </div>
      </div>

      {/* ── 컨텐츠 ── */}
      <div className="mx-auto max-w-5xl px-6 -mt-10 pb-12 space-y-5">

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 gap-4">
          <div
            className="rounded-2xl bg-white p-5 shadow-sm text-center cursor-pointer hover:bg-emerald-50 transition-colors"
            onClick={() => navigate('/dashboard')}
          >
            <p className="text-2xl mb-1">🎬</p>
            <p className="text-2xl font-extrabold text-slate-800">{totalProjects}</p>
            <p className="text-xs text-emerald-500 mt-0.5 font-medium">총 프로젝트 →</p>
          </div>
          <div
            className="rounded-2xl bg-white p-5 shadow-sm text-center cursor-pointer hover:bg-emerald-50 transition-colors"
            onClick={() => navigate('/study')}
          >
            <p className="text-2xl mb-1">📖</p>
            <p className="text-2xl font-extrabold text-slate-800">{savedWordsCount}</p>
            <p className="text-xs text-emerald-500 mt-0.5 font-medium">저장된 단어 →</p>
          </div>
        </div>

        {/* 최근 프로젝트 */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-slate-800 text-lg">최근 시청한 프로젝트</h2>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-500 transition-colors flex items-center gap-1"
            >
              전체 보기
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          {recentProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <p className="text-sm text-slate-400">아직 방문한 프로젝트가 없어요</p>
              <button
                onClick={() => navigate('/dashboard')}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-500 transition-colors"
              >
                프로젝트 목록 보기 →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentProjects.map((proj) => {
                const pid = proj.id ?? proj.projectId;
                const isYoutube = proj.sourceType === 'YOUTUBE';
                const videoSrc = isYoutube ? (proj.sourceUrl ?? '') : (proj.fileUrl ?? '');
                return (
                  <div
                    key={`${pid}_${proj.clickedAt}`}
                    onClick={() => {
                      if (!pid) return;
                      if (isYoutube) {
                        navigate(`/translate/${pid}`, { state: { videoSrc } });
                      } else {
                        navigate(`/translate/${pid}`);
                      }
                    }}
                    className="group flex items-center gap-4 rounded-xl hover:bg-slate-50 px-3 py-3.5 transition-colors cursor-pointer"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors shrink-0">
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{proj.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatDate(proj.createdAt)} · {isYoutube ? 'YouTube' : '파일'}
                      </p>
                    </div>
                    <svg className="h-4 w-4 text-slate-300 group-hover:text-slate-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 새 프로젝트 CTA */}
        <div
          onClick={() => navigate('/upload')}
          className="relative rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 p-6 cursor-pointer hover:from-emerald-500 hover:to-teal-400 transition-all shadow-lg shadow-emerald-100 overflow-hidden"
        >
          {/* 배경 장식 */}
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute -right-2 top-8 h-16 w-16 rounded-full bg-white/10" />
          <div className="relative">
            <p className="font-bold text-white text-xl">새 프로젝트 시작하기 →</p>
            <p className="text-emerald-100 text-sm mt-1.5">영상을 업로드하고 AI 자막 생성을 시작하세요</p>
          </div>
        </div>

      </div>
    </div>
  );
}

const PROFILE_PHOTO_KEY = 'overlang_profile_photo';

// ── 계정 설정 서브페이지 ──────────────────────────────
function SettingsPage({
  onBack,
  onDeleteSuccess,
}: {
  onBack: () => void;
  onDeleteSuccess: () => void;
}) {
  const { user, changePassword, deleteAccount, clearError, updateUserProfile, profileImageUrl, uploadProfileImage } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | null>(
    profileImageUrl ?? null
  );
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [name, setName] = useState(user?.displayName ?? '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError('');
    setImageUploading(true);
    try {
      await uploadProfileImage(file);
      // 업로드 성공 시 미리보기도 즉시 갱신
      const reader = new FileReader();
      reader.onload = () => setProfileImage(reader.result as string);
      reader.readAsDataURL(file);
    } catch (e: any) {
      setImageError(e?.message ?? '이미지 업로드에 실패했습니다.');
    } finally {
      setImageUploading(false);
    }
  };

  const handleSave = async () => {
    setSaveError('');
    try {
      await updateUserProfile(name.trim() || (user?.displayName ?? ''));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError('저장에 실패했습니다. 다시 시도해주세요.');
    }
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
    <div className="min-h-screen bg-slate-50">

      {/* 헤더 */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-10">
        <div className="mx-auto max-w-2xl flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-800">계정 설정</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-8 space-y-5">

        {/* 프로필 정보 */}
        <div className="rounded-2xl bg-white p-6 shadow-sm space-y-5">
          <h2 className="font-bold text-slate-800">프로필 정보</h2>

          <div className="flex items-center gap-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
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
                onClick={() => !imageUploading && fileInputRef.current?.click()}
                disabled={imageUploading}
                className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-500 shadow disabled:opacity-60"
              >
                {imageUploading ? (
                  <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">프로필 사진</p>
              <p className="text-xs text-slate-400 mt-0.5">JPG, PNG (최대 5MB)</p>
              <button
                onClick={() => !imageUploading && fileInputRef.current?.click()}
                disabled={imageUploading}
                className="mt-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-500 transition-colors disabled:opacity-50"
              >
                {imageUploading ? '업로드 중...' : '사진 변경'}
              </button>
              {imageError && <p className="mt-1 text-xs text-red-500">{imageError}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">이메일</label>
            <input
              type="email"
              value={user?.email ?? ''}
              readOnly
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400">이메일은 변경할 수 없습니다.</p>
          </div>

          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          <button
            onClick={handleSave}
            className={cn(
              'flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all',
              saved ? 'bg-green-500' : 'bg-emerald-600 hover:bg-emerald-500'
            )}
          >
            {saved ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                저장됨
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                저장하기
              </>
            )}
          </button>
        </div>

        {/* 비밀번호 변경 */}
        <div className="rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-800">비밀번호 변경</h2>

          {[
            { label: '현재 비밀번호', placeholder: '현재 비밀번호', value: currentPw, onChange: setCurrentPw, isLast: false },
            { label: '새 비밀번호', placeholder: '새 비밀번호 (8자 이상)', value: newPw, onChange: setNewPw, isLast: false },
            { label: '새 비밀번호 확인', placeholder: '새 비밀번호 확인', value: newPwConfirm, onChange: setNewPwConfirm, isLast: true },
          ].map((field) => (
            <div key={field.label} className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{field.label}</label>
              <input
                type="password"
                placeholder={field.placeholder}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                className={cn(
                  'w-full rounded-xl border bg-slate-50 px-4 py-3 text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all',
                  field.isLast && pwError
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-100'
                )}
              />
              {field.isLast && pwError && <p className="text-xs text-red-500">{pwError}</p>}
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
        <div className="rounded-2xl bg-white border border-red-100 p-6 shadow-sm space-y-4">
          <div>
            <h2 className="font-bold text-red-600">회원 탈퇴</h2>
            <p className="text-sm text-slate-500 mt-1">
              계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-1">
            <p className="text-xs font-semibold text-red-700">삭제되는 항목</p>
            <p className="text-xs text-red-600">모든 프로젝트 · 저장된 단어 · 계정 정보</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">비밀번호 확인</label>
            <input
              type="password"
              placeholder="현재 비밀번호 입력"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
            />
            {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
          </div>

          <button
            onClick={handleDeleteAccount}
            className="flex items-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white hover:bg-red-400 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            회원 탈퇴하기
          </button>
        </div>

      </div>
    </div>
  );
}

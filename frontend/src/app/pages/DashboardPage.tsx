import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, getVideoPresignedUrl, updateProjectTitle, deleteProject, retryJob, getProjectJobs } from '@/api/video';
import { getMySavedWords, deleteSavedWord } from '@/api/words';
import type { ProjectResult } from '@/api/video';
import { useAuth } from '@/app/providers/AuthProvider';
import { Header } from '@/components/layout/Header';

function extractYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return id;
      const shorts = parsed.pathname.match(/\/shorts\/([^/?&]+)/);
      if (shorts) return shorts[1];
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('?')[0] || null;
    }
  } catch { /* ignore */ }
  return null;
}

const RECENT_PROJECTS_KEY = 'overlang_recent_projects';

function saveRecentProject(project: ProjectResult) {
  const pid = project.id ?? project.projectId;
  try {
    const existing: (ProjectResult & { clickedAt: string })[] =
      JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) ?? '[]');
    const filtered = existing.filter(p => (p.id ?? p.projectId) !== pid);
    const updated = [{ ...project, clickedAt: new Date().toISOString() }, ...filtered].slice(0, 10);
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

const CARD_COLORS = [
  'from-violet-400 to-violet-600',
  'from-emerald-400 to-emerald-600',
  'from-blue-400 to-blue-600',
  'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600',
  'from-teal-400 to-teal-600',
];

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  CREATED:    { label: '대기 중',  dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-500' },
  PROCESSING: { label: '분석 중',  dot: 'bg-blue-500 animate-pulse', badge: 'bg-blue-50 text-blue-600' },
  COMPLETED:  { label: '완료',     dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  FAILED:     { label: '실패',     dot: 'bg-red-500',     badge: 'bg-red-50 text-red-600' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// 스켈레톤 카드
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="aspect-video bg-slate-100 animate-pulse" />
      <div className="p-4 space-y-2.5">
        <div className="h-4 bg-slate-100 rounded-lg animate-pulse w-3/4" />
        <div className="h-3 bg-slate-100 rounded-lg animate-pulse w-1/2" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});

  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [renameProject, setRenameProject] = useState<ProjectResult | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProjectResult | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [retryingId, setRetryingId] = useState<number | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const [processingToast, _setProcessingToast] = useState(false);

  const toggleSelect = (pid: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}개 프로젝트를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    setBulkDeleteLoading(true);
    try {
      await Promise.allSettled(
        Array.from(selectedIds).map(async pid => {
          try {
            const savedWords = await getMySavedWords();
            const projectWords = savedWords.filter(w => w.projectId === pid);
            await Promise.allSettled(projectWords.map(w => deleteSavedWord(w.savedWordId)));
          } catch { /* ignore */ }
          await deleteProject(pid);
        })
      );
      setProjects(prev => prev.filter(p => !selectedIds.has(p.id ?? p.projectId ?? -1)));
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch {
      alert('일부 프로젝트 삭제에 실패했습니다.');
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    if (menuOpenId !== null) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpenId]);

  const handleRenameSubmit = async () => {
    if (!renameProject || !renameValue.trim()) return;
    const pid = renameProject.id ?? renameProject.projectId;
    if (!pid) return;
    setRenameLoading(true);
    try {
      const updated = await updateProjectTitle(pid, renameValue.trim());
      setProjects(prev => prev.map(p =>
        (p.id ?? p.projectId) === pid ? { ...p, title: updated.title ?? renameValue.trim() } : p
      ));
      setRenameProject(null);
    } catch {
      alert('제목 수정에 실패했습니다.');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleRetry = async (project: ProjectResult) => {
    const pid = project.id ?? project.projectId;
    if (!pid) return;
    setRetryingId(pid);
    setMenuOpenId(null);
    try {
      const result = await retryJob(pid);
      const isYoutube = project.sourceType === 'YOUTUBE';
      const videoSrc = isYoutube ? (project.sourceUrl ?? '') : '';
      navigate('/processing', { state: { jobId: result.jobId, projectId: pid, videoSrc } });
    } catch {
      alert('재분석 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const pid = deleteTarget.id ?? deleteTarget.projectId;
    if (!pid) return;
    setDeleteLoading(true);
    try {
      try {
        const savedWords = await getMySavedWords();
        const projectWords = savedWords.filter(w => w.projectId === pid);
        await Promise.allSettled(projectWords.map(w => deleteSavedWord(w.savedWordId)));
      } catch { /* ignore */ }
      await deleteProject(pid);
      setProjects(prev => prev.filter(p => (p.id ?? p.projectId) !== pid));
      setDeleteTarget(null);
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    setLoading(true);
    getProjects()
      .then(data => {
        setProjects(data);
        data.forEach(project => {
          if (project.sourceType === 'YOUTUBE') return;
          const pid = project.id ?? project.projectId;
          if (!pid) return;
          getVideoPresignedUrl(pid)
            .then(url => setThumbUrls(prev => ({ ...prev, [pid]: url })))
            .catch(() => {});
        });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  const completedCount = projects.filter(p => p.status === 'COMPLETED').length;
  const processingCount = projects.filter(p => p.status === 'PROCESSING' || p.status === 'CREATED').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── 페이지 헤더 ── */}
        <div className="mb-8">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">나의 프로젝트</h1>
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-2">
              {selectMode ? (
                <>
                  <span className="text-sm text-slate-500 mr-1">{selectedIds.size}개 선택</span>
                  <button
                    onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                    className="px-4 py-2.5 border border-slate-200 bg-white text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={selectedIds.size === 0 || bulkDeleteLoading}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500 text-white rounded-xl font-semibold text-sm hover:bg-red-400 disabled:opacity-40 transition-colors shadow-sm"
                  >
                    {bulkDeleteLoading ? (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                    {bulkDeleteLoading ? '삭제 중...' : '삭제'}
                  </button>
                </>
              ) : (
                <>
                  {projects.length > 0 && (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="px-4 py-2.5 border border-slate-200 bg-white text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-50 transition-colors"
                    >
                      선택
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/upload')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-700 transition-colors shadow-sm"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    새 영상 업로드
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 통계 바 */}
          {!loading && projects.length > 0 && (
            <div className="mt-5 flex items-center gap-5">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="text-slate-800 font-semibold">{projects.length}</span> 전체
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-slate-800 font-semibold">{completedCount}</span> 완료
              </div>
              {processingCount > 0 && (
                <>
                  <div className="w-px h-4 bg-slate-200" />
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-slate-800 font-semibold">{processingCount}</span> 분석 중
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 에러 ── */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">불러오는 중 문제가 생겼어요</p>
            <p className="text-sm text-slate-400">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* ── 로딩 스켈레톤 ── */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── 빈 상태 ── */}
        {!loading && !error && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white border border-slate-100 shadow-sm">
                <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-700 text-lg">첫 영상을 업로드해보세요</p>
              <p className="text-sm text-slate-400 mt-1.5">AI가 자막과 화면 텍스트를 자동으로 번역해드려요</p>
            </div>
            <button
              onClick={() => navigate('/upload')}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              영상 업로드하기
            </button>
          </div>
        )}

        {/* ── 프로젝트 그리드 ── */}
        {!loading && !error && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project, idx) => {
              const pid = project.id ?? project.projectId;
              const statusCfg = STATUS_CONFIG[project.status] ?? { label: project.status, dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-500' };
              const isYoutube = project.sourceType === 'YOUTUBE';
              const youtubeId = isYoutube && project.sourceUrl ? extractYoutubeId(project.sourceUrl) : null;
              const videoSrc = isYoutube ? (project.sourceUrl ?? '') : (project.fileUrl ?? '');
              const cardColor = CARD_COLORS[idx % CARD_COLORS.length];
              const isSelected = pid ? selectedIds.has(pid) : false;
              const isClickable = project.status === 'COMPLETED' || project.status === 'PROCESSING';

              return (
                <div
                  key={pid ?? idx}
                  onClick={async () => {
                    if (!pid) return;
                    if (selectMode) { toggleSelect(pid); return; }
                    if (menuOpenId !== null) return;
                    if (!isClickable) return;
                    if (project.status === 'PROCESSING') {
                      try {
                        const jobs = await getProjectJobs(pid);
                        const job = jobs[0];
                        if (job) {
                          navigate('/processing', { state: { jobId: job.jobId, projectId: pid, videoSrc } });
                        }
                      } catch { /* ignore */ }
                      return;
                    }
                    saveRecentProject(project);
                    if (isYoutube) {
                      navigate(`/translate/${pid}`, { state: { videoSrc } });
                    } else {
                      navigate(`/translate/${pid}`);
                    }
                  }}
                  className={`group relative bg-white rounded-2xl border transition-all duration-200 ${menuOpenId === pid ? 'z-10' : ''} ${
                    selectMode
                      ? isSelected
                        ? 'border-emerald-400 ring-2 ring-emerald-100 cursor-pointer shadow-sm'
                        : 'border-slate-200 cursor-pointer hover:border-emerald-200'
                      : isClickable
                        ? 'border-slate-200 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100 cursor-pointer hover:-translate-y-0.5'
                        : 'border-slate-200 cursor-default'
                  }`}

                >
                  {/* FAILED 카드 반투명 오버레이 (메뉴 버튼은 제외) */}
                  {!isClickable && (
                    <div className="absolute inset-0 bg-white/50 rounded-2xl pointer-events-none z-[1]" />
                  )}
                  {/* 썸네일 */}
                  <div className="aspect-video relative overflow-hidden rounded-t-2xl bg-slate-100">
                    {youtubeId ? (
                      <img
                        src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                        alt={project.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : pid && thumbUrls[pid] ? (
                      <>
                        <video
                          src={thumbUrls[pid]}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          preload="metadata"
                          muted
                          playsInline
                          onLoadedMetadata={e => { e.currentTarget.currentTime = 0; }}
                          onError={e => {
                            const el = e.currentTarget;
                            el.style.display = 'none';
                            const fallback = el.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div
                          style={{ display: 'none' }}
                          className={`absolute inset-0 bg-gradient-to-br ${cardColor} flex items-center justify-center`}
                        >
                          <span className="text-white text-4xl font-bold opacity-90">
                            {project.title.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${cardColor} flex items-center justify-center`}>
                        <span className="text-white text-4xl font-bold opacity-90">
                          {project.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* 재생 오버레이 */}
                    {isClickable && !selectMode && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                        <div className="w-13 h-13 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-90 group-hover:scale-100 shadow-xl p-3">
                          <svg className="h-5 w-5 text-slate-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* 소스 타입 뱃지 */}
                    <div className={`absolute top-2.5 left-2.5 text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm ${
                      isYoutube ? 'bg-red-500/90 text-white' : 'bg-black/50 text-white'
                    }`}>
                      {isYoutube ? 'YouTube' : '파일'}
                    </div>

                    {/* 선택 체크박스 */}
                    {selectMode && (
                      <div className="absolute inset-0 flex items-start justify-end p-2.5">
                        <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected ? 'bg-emerald-500 border-emerald-500 scale-110' : 'bg-white/80 border-slate-300 backdrop-blur-sm'
                        }`}>
                          {isSelected && (
                            <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 카드 하단 정보 */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2 break-all flex-1">
                        {project.title}
                      </h3>

                      {pid && !selectMode && (
                        <div className="relative shrink-0 mt-0.5" ref={menuOpenId === pid ? menuRef : undefined}>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === pid ? null : pid);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                            </svg>
                          </button>

                          {menuOpenId === pid && (
                            <div className="absolute right-0 top-full mt-1.5 w-40 rounded-2xl bg-white shadow-xl shadow-slate-200/80 border border-slate-100 overflow-hidden z-50 py-1.5">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setMenuOpenId(null);
                                  setRenameValue(project.title);
                                  setRenameProject(project);
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors text-left"
                              >
                                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                제목 수정
                              </button>
                              {project.status === 'FAILED' && (
                                <>
                                  <div className="mx-3 my-1 border-t border-slate-100" />
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleRetry(project);
                                    }}
                                    disabled={retryingId === pid}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors text-left disabled:opacity-50"
                                  >
                                    {retryingId === pid ? (
                                      <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin shrink-0" />
                                    ) : (
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                      </svg>
                                    )}
                                    다시 분석하기
                                  </button>
                                </>
                              )}
                              <div className="mx-3 my-1 border-t border-slate-100" />
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setMenuOpenId(null);
                                  setDeleteTarget(project);
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                삭제
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-400 flex-1">{formatDate(project.createdAt)}</p>
                      {/* 상태 뱃지 (카드 하단으로 이동) */}
                      <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusCfg.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── 제목 수정 모달 ── */}
      {renameProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-7">
            <h2 className="text-base font-bold text-slate-800 mb-1">제목 수정</h2>
            <p className="text-xs text-slate-400 mb-5 truncate">{renameProject.title}</p>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenameProject(null); }}
              maxLength={100}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              placeholder="새 프로젝트 제목"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setRenameProject(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleRenameSubmit}
                disabled={renameLoading || !renameValue.trim()}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {renameLoading ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 mb-5">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-800 mb-1.5">프로젝트 삭제</h2>
            <p className="text-sm text-slate-500 mb-1">
              <span className="font-semibold text-slate-700">"{deleteTarget.title}"</span>을(를) 삭제할까요?
            </p>
            <p className="text-xs text-slate-400 mb-6">삭제된 프로젝트는 복구할 수 없습니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 분석 중 토스트 ── */}
      {processingToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm text-white shadow-2xl shadow-slate-900/20">
          <svg className="h-4 w-4 text-blue-400 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          AI가 영상을 분석하는 중이에요. 완료 후 다시 시도해주세요.
        </div>
      )}
      <footer className="mt-auto py-4 text-center">
        <p className="text-xs text-slate-300">© 2026 OverLang. All rights reserved.</p>
      </footer>
    </div>
  );
}

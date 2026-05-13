import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, getVideoPresignedUrl, updateProjectTitle, deleteProject } from '@/api/video';
import { getMySavedWords, deleteSavedWord } from '@/api/words';
import type { ProjectResult } from '@/api/video';
import { useAuth } from '@/app/providers/AuthProvider';

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

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  CREATED:    { label: '대기 중',  color: 'bg-gray-100 text-gray-500' },
  PROCESSING: { label: '분석 중',  color: 'bg-blue-100 text-blue-600' },
  COMPLETED:  { label: '완료',     color: 'bg-emerald-100 text-emerald-700' },
  FAILED:     { label: '실패',     color: 'bg-red-100 text-red-600' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<ProjectResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});

  // 드롭다운 메뉴
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 제목 수정 모달
  const [renameProject, setRenameProject] = useState<ProjectResult | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<ProjectResult | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 분석 중 클릭 시 안내 토스트
  const [processingToast, setProcessingToast] = useState(false);
  const showProcessingToast = () => {
    setProcessingToast(true);
    setTimeout(() => setProcessingToast(false), 2500);
  };

  // 드롭다운 외부 클릭 닫기
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
    } catch (e) {
      alert('제목 수정에 실패했습니다.');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const pid = deleteTarget.id ?? deleteTarget.projectId;
    if (!pid) return;
    setDeleteLoading(true);
    try {
      // 해당 프로젝트에 연결된 저장 단어 먼저 삭제
      try {
        const savedWords = await getMySavedWords();
        const projectWords = savedWords.filter(w => w.projectId === pid);
        await Promise.allSettled(projectWords.map(w => deleteSavedWord(w.savedWordId)));
      } catch { /* 단어 삭제 실패해도 프로젝트 삭제는 진행 */ }

      await deleteProject(pid);
      setProjects(prev => prev.filter(p => (p.id ?? p.projectId) !== pid));
      setDeleteTarget(null);
    } catch (e) {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;       // Firebase 초기화 대기
    if (!user) {                   // 비로그인 시 빈 상태
      setLoading(false);
      return;
    }
    setLoading(true);
    getProjects()
      .then(data => {
        setProjects(data);
        // 파일 업로드 프로젝트의 presigned URL 병렬 발급
        data.forEach(project => {
          if (project.sourceType === 'YOUTUBE') return;
          const pid = project.id ?? project.projectId;
          if (!pid) return;
          getVideoPresignedUrl(pid)
            .then(url => setThumbUrls(prev => ({ ...prev, [pid]: url })))
            .catch(() => {}); // 실패 시 그라디언트 폴백
        });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate('/')}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-slate-800">OverLang</span>
          </div>
          <button
            onClick={() => navigate('/mypage')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* 타이틀 + 업로드 버튼 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">내 영상</h1>
            <p className="text-sm text-slate-400 mt-1">업로드한 영상과 번역 결과를 확인하세요</p>
          </div>
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 영상 업로드
          </button>
        </div>

        {/* 로딩 */}
        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin" />
          </div>
        )}

        {/* 에러 */}
        {!loading && error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-6 py-5 text-sm text-red-600 text-center">
            불러오는 중 오류가 발생했습니다: {error}
          </div>
        )}

        {/* 빈 상태 */}
        {!loading && !error && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">아직 업로드한 영상이 없어요</p>
            <button
              onClick={() => navigate('/upload')}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              첫 영상 업로드하기
            </button>
          </div>
        )}

        {/* 프로젝트 그리드 */}
        {!loading && !error && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project, idx) => {
              const pid = project.id ?? project.projectId; // 목록: id, 생성: projectId
              const statusCfg = STATUS_CONFIG[project.status] ?? { label: project.status, color: 'bg-gray-100 text-gray-500' };
              const isYoutube = project.sourceType === 'YOUTUBE';
              const youtubeId = isYoutube && project.sourceUrl ? extractYoutubeId(project.sourceUrl) : null;
              const videoSrc = isYoutube ? (project.sourceUrl ?? '') : (project.fileUrl ?? '');
              const cardColor = CARD_COLORS[idx % CARD_COLORS.length];

              return (
                <div
                  key={pid ?? idx}
                  onClick={() => {
                    if (menuOpenId !== null) return;
                    if (project.status === 'CREATED' || project.status === 'PROCESSING') {
                      showProcessingToast();
                      return;
                    }
                    saveRecentProject(project);
                    if (isYoutube) {
                      navigate('/translate', { state: { videoSrc, projectId: pid } });
                    } else {
                      navigate('/translate', { state: { projectId: pid } });
                    }
                  }}
                  className={`bg-white rounded-2xl border border-gray-200 transition-all group ${
                    project.status === 'CREATED' || project.status === 'PROCESSING'
                      ? 'cursor-not-allowed opacity-75'
                      : 'hover:shadow-md hover:border-emerald-300 cursor-pointer'
                  }`}
                >
                  {/* 썸네일 */}
                  <div className="aspect-video relative overflow-hidden rounded-t-2xl">
                    {youtubeId ? (
                      /* YouTube 썸네일 이미지 */
                      <img
                        src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                        alt={project.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : pid && thumbUrls[pid] ? (
                      /* presigned URL로 첫 프레임 표시 */
                      <video
                        src={thumbUrls[pid]}
                        className="w-full h-full object-cover"
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
                    ) : (
                      /* presigned URL 로딩 중 or 실패 시 그라디언트 */
                      <div className={`w-full h-full bg-gradient-to-br ${cardColor} flex items-center justify-center`}>
                        <span className="text-white text-4xl font-bold opacity-80">
                          {project.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* video 로드 실패 시 폴백 */}
                    {!isYoutube && pid && thumbUrls[pid] && (
                      <div
                        style={{ display: 'none' }}
                        className={`absolute inset-0 bg-gradient-to-br ${cardColor} flex items-center justify-center`}
                      >
                        <span className="text-white text-4xl font-bold opacity-80">
                          {project.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* 재생 오버레이 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                        <svg className="h-5 w-5 text-slate-700 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>

                    {/* 상태 뱃지 */}
                    <span className={`absolute top-2.5 right-2.5 text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${statusCfg.color}`}>
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* 카드 정보 */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-slate-800 text-sm truncate flex-1">{project.title}</h3>

                      {/* ⋮ 메뉴 버튼 */}
                      {pid && (
                        <div className="relative shrink-0" ref={menuOpenId === pid ? menuRef : undefined}>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setMenuOpenId(menuOpenId === pid ? null : pid);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                            </svg>
                          </button>

                          {menuOpenId === pid && (
                            <div className="absolute right-0 top-full mt-1 w-36 rounded-xl bg-white shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden z-20">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setMenuOpenId(null);
                                  setRenameValue(project.title);
                                  setRenameProject(project);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors text-left"
                              >
                                <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                제목 수정
                              </button>
                              <div className="mx-3 border-t border-slate-100" />
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setMenuOpenId(null);
                                  setDeleteTarget(project);
                                }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
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

                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">{formatDate(project.createdAt)}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        isYoutube ? 'text-red-500 bg-red-50' : 'text-slate-500 bg-slate-100'
                      }`}>
                        {isYoutube ? 'YouTube' : '파일'}
                      </span>
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
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
            <h2 className="text-base font-bold text-slate-800 mb-1">제목 수정</h2>
            <p className="text-xs text-slate-400 mb-4 truncate">{renameProject.title}</p>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenameProject(null); }}
              maxLength={100}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
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
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
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
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-800 mb-1">프로젝트 삭제</h2>
            <p className="text-sm text-slate-500 mb-1">
              <span className="font-semibold text-slate-700">"{deleteTarget.title}"</span>을(를) 삭제할까요?
            </p>
            <p className="text-xs text-slate-400 mb-5">삭제된 프로젝트는 복구할 수 없습니다.</p>
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

      {/* 분석 중 토스트 */}
      {processingToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-xl bg-slate-800 px-5 py-3 text-sm text-white shadow-xl">
          <svg className="h-4 w-4 text-blue-400 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          AI가 영상을 분석하는 중이에요. 완료 후 다시 시도해주세요.
        </div>
      )}

    </div>
  );
}

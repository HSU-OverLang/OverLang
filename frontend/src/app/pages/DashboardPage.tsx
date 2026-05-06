import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects } from '@/api/video';
import type { ProjectResult } from '@/api/video';

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
  const [projects, setProjects] = useState<ProjectResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
              const statusCfg = STATUS_CONFIG[project.status] ?? { label: project.status, color: 'bg-gray-100 text-gray-500' };
              const isYoutube = project.sourceType === 'YOUTUBE';
              const youtubeId = isYoutube && project.sourceUrl ? extractYoutubeId(project.sourceUrl) : null;
              const videoSrc = isYoutube ? (project.sourceUrl ?? '') : (project.fileUrl ?? '');
              const cardColor = CARD_COLORS[idx % CARD_COLORS.length];

              return (
                <div
                  key={project.projectId}
                  onClick={() => navigate('/translate', { state: { videoSrc } })}
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group"
                >
                  {/* 썸네일 */}
                  <div className="aspect-video relative overflow-hidden">
                    {youtubeId ? (
                      /* YouTube 썸네일 이미지 */
                      <img
                        src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                        alt={project.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : project.fileUrl ? (
                      /* S3 영상 첫 프레임 (퍼블릭일 때만 동작) */
                      <video
                        src={project.fileUrl}
                        className="w-full h-full object-cover"
                        preload="metadata"
                        muted
                        playsInline
                        onError={e => {
                          const el = e.currentTarget;
                          el.style.display = 'none';
                          const fallback = el.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : (
                      /* 폴백: 컬러 그라디언트 */
                      <div className={`w-full h-full bg-gradient-to-br ${cardColor} flex items-center justify-center`}>
                        <span className="text-white text-4xl font-bold opacity-80">
                          {project.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* S3 로드 실패 시 폴백 (video onError로 표시) */}
                    {project.fileUrl && !isYoutube && (
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
                    <h3 className="font-semibold text-slate-800 text-sm truncate mb-2">{project.title}</h3>
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
    </div>
  );
}

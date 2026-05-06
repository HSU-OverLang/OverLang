import { apiGet, apiPost } from './client';

// Backend는 { status, data } 래퍼로 응답을 감싸므로 unwrap 처리
async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `서버 오류 (${res.status})`;
    try {
      const body = await res.json();
      message = body?.message ?? message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  const json = await res.json();
  return (json.data ?? json) as T;
}

// ── Types ──────────────────────────────────────────────

export interface FileUploadResult {
  fileName: string;
  fileKey: string;
  fileUrl: string;
}

export interface ProjectResult {
  projectId: number;
  memberId: number;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  fileUrl: string | null;
  fileKey: string | null;
  status: string;
  createdAt: string;
}

export interface JobResult {
  jobId: number;
  status: string;
  progress: number;
  currentStage: string;
}

export interface JobDetail {
  id: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  currentStage: string;
  errorCode?: string;
  errorMessage?: string;
}

// ── API 함수 ────────────────────────────────────────────

/** 내 프로젝트 목록 조회 */
export async function getProjects(): Promise<ProjectResult[]> {
  const res = await apiGet('/v1/projects');
  const data = await unwrap<ProjectResult[] | { content: ProjectResult[] }>(res);
  return Array.isArray(data) ? data : data.content ?? [];
}

/** S3에 영상 파일 업로드 */
export async function uploadVideoFile(file: File): Promise<FileUploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiPost('/v1/files/upload', form);
  return unwrap<FileUploadResult>(res);
}

/** 프로젝트 생성 */
export async function createProject(params: {
  title: string;
  sourceType: 'UPLOAD' | 'YOUTUBE';
  sourceUrl?: string;
  fileUrl?: string;
  fileKey?: string;
}): Promise<ProjectResult> {
  const res = await apiPost('/v1/projects', params);
  return unwrap<ProjectResult>(res);
}

/** AI Job 생성 (FULL_ANALYSIS 고정) */
export async function createJob(
  projectId: number,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<JobResult> {
  const res = await apiPost(`/v1/projects/${projectId}/jobs`, {
    jobType: 'FULL_ANALYSIS',
    sourceLanguage,
    targetLanguage,
    translationProvider: 'DEFAULT',
    useUserApiKey: false,
  });
  return unwrap<JobResult>(res);
}

/** Job 상태 조회 (폴링용) */
export async function getJobDetail(jobId: number): Promise<JobDetail> {
  const res = await apiGet(`/v1/jobs/${jobId}`);
  return unwrap<JobDetail>(res);
}

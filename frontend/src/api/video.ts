import { apiGet, apiPost, apiPatch, apiDelete } from './client';

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
  id?: number;        // 목록 조회 응답
  projectId?: number; // 생성 응답
  memberId?: number;
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
    translationProvider: 'OPENAI',
  });
  return unwrap<JobResult>(res);
}

/** Job 상태 조회 (폴링용) */
export async function getJobDetail(jobId: number): Promise<JobDetail> {
  const res = await apiGet(`/v1/jobs/${jobId}`);
  return unwrap<JobDetail>(res);
}

/** Presigned URL 발급 (Private S3 영상 재생용) */
export async function getVideoPresignedUrl(projectId: number): Promise<string> {
  const res = await apiGet(`/v1/projects/${projectId}/video-url`);
  const data = await unwrap<{ presignedUrl: string }>(res);
  return data.presignedUrl;
}

// ── 자막 / OCR Types ────────────────────────────────────

export interface JobSummary {
  jobId: number;
  projectId: number;
  jobType: string;
  status: string;
  progress: number;
  currentStage: string;
  sourceLanguage: string;
  targetLanguage: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface SegmentWord {
  segmentWordId: number;
  seq: number;
  word: string;
  startTime: number;
  endTime: number;
}

export interface SegmentResult {
  segmentId: number;
  jobId: number;
  seq: number;
  startTime: number;
  endTime: number;
  text: string;
  translatedText: string | null;
  languageCode: string;
  words: SegmentWord[];
}

export interface OcrItemResult {
  ocrItemId: number;
  jobId: number;
  startTime: number;
  endTime: number;
  originText: string;
  translatedText: string | null;
  boundingBox: { x: number; y: number; w: number; h: number };
  confidence: number;
}

/** 프로젝트의 Job 목록 조회 */
export async function getProjectJobs(projectId: number): Promise<JobSummary[]> {
  const res = await apiGet(`/v1/projects/${projectId}/jobs`);
  const data = await unwrap<JobSummary[] | { content: JobSummary[] }>(res);
  return Array.isArray(data) ? data : data.content ?? [];
}

/** STT 세그먼트(자막) 조회 */
export async function getSegments(jobId: number): Promise<SegmentResult[]> {
  const res = await apiGet(`/v1/jobs/${jobId}/segments?size=10000`);
  const raw = await res.clone().json().catch(() => null);
  console.log('[OverLang] segments 원시 응답:', JSON.stringify(raw)?.slice(0, 300));
  const data = await unwrap<SegmentResult[] | { content: SegmentResult[] }>(res);
  if (Array.isArray(data)) return data;
  if (data && 'content' in data && Array.isArray(data.content)) return data.content;
  // 그 외 형태도 처리 (totalElements 등이 있는 Pageable 응답)
  const anyData = data as unknown;
  if (anyData?.content) return anyData.content;
  return [];
}

/** OCR 결과 조회 */
export async function getOcrItems(jobId: number): Promise<OcrItemResult[]> {
  const res = await apiGet(`/v1/jobs/${jobId}/ocr-items?size=10000`);
  const raw = await res.clone().json().catch(() => null);
  console.log('[OverLang] ocr-items 원시 응답:', JSON.stringify(raw)?.slice(0, 300));
  const data = await unwrap<OcrItemResult[] | { content: OcrItemResult[] }>(res);
  if (Array.isArray(data)) return data;
  if (data && 'content' in data && Array.isArray(data.content)) return data.content;
  const anyData = data as any;
  if (anyData?.content) return anyData.content;
  return [];
}

/** 프로젝트 제목 수정 */
export async function updateProjectTitle(projectId: number, title: string): Promise<ProjectResult> {
  const res = await apiPatch(`/v1/projects/${projectId}`, { title });
  return unwrap<ProjectResult>(res);
}

/** 프로젝트 삭제 */
export async function deleteProject(projectId: number): Promise<void> {
  const res = await apiDelete(`/v1/projects/${projectId}`);
  await unwrap<unknown>(res);
}

export interface RetryJobResult {
  projectId: number;
  jobId: number;
  jobStatus: string;
  projectStatus: string;
  message: string;
}

/** 실패한 분석 재처리 요청 */
export async function retryJob(projectId: number): Promise<RetryJobResult> {
  const res = await apiPost(`/v1/projects/${projectId}/jobs/retry`, {});
  return unwrap<RetryJobResult>(res);
}

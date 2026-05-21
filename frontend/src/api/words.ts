import { apiGet, apiPost, apiDelete } from './client';

// ── 요청/응답 타입 ─────────────────────────────────────

export interface ExplainWordRequest {
  segmentId?: number;
  word: string;
  selectedTextType: 'ORIGINAL' | 'TRANSLATION';
  originalSentence: string;
  translatedSentence: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface ExplainWordResponse {
  word: string;
  meaning: string;
  relatedWords: string[];
  matchedExpression: boolean;
}

export interface SaveWordRequest {
  segmentWordId: number;
  word: string;
  matchedExpression?: boolean;
  meaning: string;
  contextMeaning: string;
  memo?: string;
}

export interface SavedWordResult {
  savedWordId: number;
  segmentWordId: number;
  segmentId: number | null;
  word: string;
  selectedTextType: 'ORIGINAL' | 'TRANSLATION';
  meaning: string;
  contextMeaning: string;
  memo: string;
  matchedExpression: boolean;
  startTime: number | null;
  endTime: number | null;
  originalSentence: string;
  translatedSentence: string;
  projectId: number | null;
  projectTitle: string | null;
  createdAt: string;
  lang?: string;
}

// ── API 함수 ──────────────────────────────────────────

/** POST /api/v1/words/explain — 단어 뜻 + 관련 단어 분석 */
export async function explainWord(req: ExplainWordRequest): Promise<ExplainWordResponse> {
  const res = await apiPost('/v1/words/explain', req);
  if (!res.ok) throw new Error(`단어 분석 실패 (${res.status})`);
  const json = await res.json();
  // 서버가 { status, data } 래핑을 할 수도 있어서 data 먼저 시도
  return json.data ?? json;
}

/** POST /api/v1/saved-words — 단어 저장 */
export async function saveWord(req: SaveWordRequest): Promise<SavedWordResult> {
  const res = await apiPost('/v1/saved-words', req);
  if (!res.ok) throw new Error(`단어 저장 실패 (${res.status})`);
  const json = await res.json();
  return json.data ?? json;
}

/** GET /api/v1/me/saved-words — 저장된 단어 전체 조회 */
export async function getMySavedWords(): Promise<SavedWordResult[]> {
  const res = await apiGet('/v1/me/saved-words');
  if (!res.ok) throw new Error(`단어 목록 조회 실패 (${res.status})`);
  const json = await res.json();
  const raw = json.data ?? json;
  return Array.isArray(raw) ? raw : [];
}

/** DELETE /api/v1/saved-words/{savedWordId} — 단어 삭제 */
export async function deleteSavedWord(savedWordId: number): Promise<void> {
  const res = await apiDelete(`/v1/saved-words/${savedWordId}`);
  if (!res.ok) throw new Error(`단어 삭제 실패 (${res.status})`);
}

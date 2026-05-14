import { apiGet, apiPost } from './client';

export async function registerWithFirebase(idToken?: string) {
  if (idToken) {
    const base = import.meta.env.VITE_API_BASE_URL;
    return fetch(`${base}/v1/auth/firebase`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
  }
  return apiPost('/v1/auth/firebase');
}

export async function getMe(): Promise<{ profileImageUrl: string | null }> {
  const res = await apiGet('/v1/auth/me');
  if (!res.ok) throw new Error('사용자 정보를 불러오지 못했습니다.');
  const json = await res.json();
  return json.data ?? json;
}

/** 프로필 이미지 업로드 — multipart/form-data, field: file */
export async function uploadProfileImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiPost('/v1/members/me/profile-image', formData);
  if (!res.ok) {
    let msg = `이미지 업로드 실패 (${res.status})`;
    try {
      const body = await res.json();
      msg = body?.message ?? body?.error ?? msg;
    } catch { /* ignore */ }
    console.error('[uploadProfileImage]', res.status, msg);
    throw new Error(msg);
  }
  const json = await res.json();
  const url = (json.data ?? json)?.profileImageUrl;
  if (!url) throw new Error('이미지 URL을 받지 못했습니다.');
  return url;
}

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

export async function getMe() {
  return apiGet('/v1/auth/me');
}

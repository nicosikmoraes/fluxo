import { reactive } from 'vue';

export const auth = reactive({ user: null, csrfToken: '', loading: true, error: '', message: '' });
let restoring;

export async function restoreSession() {
 if (restoring) return restoring;
 auth.error = '';
 restoring = (async () => {
  try {
   const response = await fetch('/api/auth/session', { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
   if (!response.ok) throw new Error('Não foi possível conectar ao Fluxo. Tente novamente.');
   const data = await response.json();
   auth.user = data.user; auth.csrfToken = data.csrf_token;
  } catch (error) { auth.error = error.message; throw error; }
  finally { auth.loading = false; restoring = null; }
 })();
 return restoring;
}

export async function apiRequest(url, method = 'GET', data) {
 if (!auth.csrfToken) await restoreSession();
 const form = data instanceof FormData;
 const response = await fetch('/api' + url, {
  method, credentials: 'same-origin', cache: 'no-store',
  headers: { Accept: 'application/json', 'X-CSRF-TOKEN': auth.csrfToken, ...(data && !form ? { 'Content-Type': 'application/json' } : {}) },
  body: data ? (form ? data : JSON.stringify(data)) : undefined,
 });
 const body = response.status === 204 ? null : await response.json().catch(() => ({}));
 if (!response.ok) {
  if (response.status === 401 || response.status === 419) {
   if (response.status === 401) auth.user = null;
   await restoreSession().catch(() => {});
   auth.message = auth.user ? '' : 'Sua sessão expirou. Entre novamente para continuar.';
  }
  const message = response.status === 429 ? 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.' : response.status === 419 ? 'Sua sessão foi atualizada. Tente novamente.' : body?.errors ? Object.values(body.errors).flat().join(' ') : body?.message || 'Não foi possível salvar. Tente novamente.';
  const error = new Error(message); error.status = response.status; error.errors = body?.errors || {};
  throw error;
 }
 if (body?.csrf_token) auth.csrfToken = body.csrf_token;
 return response.status === 204 ? true : body;
}

export async function signOut() {
 const data = await apiRequest('/auth/logout', 'POST');
 auth.user = data.user; auth.csrfToken = data.csrf_token; auth.message = '';
}

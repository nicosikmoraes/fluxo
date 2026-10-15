export function createSessionClient(baseUrl, fetcher = globalThis.fetch) {
 const cookies = new Map(); let csrfToken = '';
 return async function sessionFetch(input, init = {}) {
  const url = new URL(input, baseUrl);
  const headers = new Headers(init.headers);
  if (cookies.size) headers.set('Cookie', [...cookies].map(([name, value]) => name + '=' + value).join('; '));
  if (csrfToken) headers.set('X-CSRF-TOKEN', csrfToken);
  const response = await fetcher(url.toString(), { credentials: 'include', ...init, headers });
  for (const cookie of response.headers.getSetCookie()) {
   const pair = cookie.split(';', 1)[0]; const index = pair.indexOf('=');
   cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  if (response.ok && url.pathname.startsWith('/api/auth/')) {
   const data = await response.clone().json().catch(() => ({}));
   if (data.csrf_token) csrfToken = data.csrf_token;
  }
  return response;
 };
}

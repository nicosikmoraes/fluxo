import { beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { apiRequest, auth, restoreSession } from '../src/auth';
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => {
 const headers = new Headers(init.headers);
 if (auth.csrfToken) headers.set('X-CSRF-TOKEN', auth.csrfToken);
 return originalFetch(new URL(input, 'http://127.0.0.1:8002').toString(), { ...init, credentials: 'same-origin', headers });
};
beforeAll(async () => {
 await restoreSession();
 const data = await apiRequest('/auth/register', 'POST', { name: 'Conta de teste', email: randomUUID() + '@example.com', password: 'senha de testes 123', password_confirmation: 'senha de testes 123' });
 auth.user = data.user;
});
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};

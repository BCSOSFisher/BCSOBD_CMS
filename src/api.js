async function req(method, url, body, isForm) {
  const opt = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    if (isForm) opt.body = body;
    else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  }
  const r = await fetch(url, opt);
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (r.status === 401 && !/^\/(login|denied)/.test(location.pathname)) {
    location.href = data?.code === 'revoked' ? '/denied?reason=revoked' : '/login';
    throw new Error('Signed out');
  }
  if (!r.ok) { const err = new Error(data?.error || `Request failed (${r.status})`); err.data = data; err.status = r.status; throw err; }
  return data;
}
export const api = {
  get: (u) => req('GET', u),
  post: (u, b) => req('POST', u, b ?? {}),
  patch: (u, b) => req('PATCH', u, b),
  del: (u) => req('DELETE', u),
  upload: (u, form) => req('POST', u, form, true),
};

// Download a generated .docx via fetch so errors can be shown instead of a broken file.
export async function download(url, fallbackName) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) {
    let msg = `Download failed (${r.status})`;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') || '';
  const name = decodeURIComponent((cd.match(/filename="([^"]+)"/) || [])[1] || fallbackName);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Penal code is large; load once and cache.
let pcPromise;
export const loadPenalCode = () => (pcPromise ||= api.get('/api/penal-code'));

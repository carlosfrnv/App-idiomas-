/** Supabase simulado en memoria (Auth + PostgREST + Storage) servido con page.route. Sólo para E2E. */
import type { BrowserContext, Route } from '@playwright/test';

type Row = Record<string, unknown>;
export interface FakeDb { users: Map<string, { id: string; email: string; password: string; meta: Row }>; tables: Record<string, Row[]>; objects: Map<string, Buffer>; unhandled: string[] }

export function createFakeDb(): FakeDb {
  return { users: new Map(), tables: { projects: [], assets: [], project_assets: [], profiles: [] }, objects: new Map(), unhandled: [] };
}

const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });

function session(u: { id: string; email: string; meta: Row }) {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.meta, app_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: `tok-${u.id}`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: `ref-${u.id}`, user };
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const [op, ...rest] = v.split('.');
    const val = rest.join('.');
    const cell = row[k];
    if (op === 'eq' && String(cell) !== val) return false;
    if (op === 'is' && val === 'null' && cell != null) return false;
    if (op === 'in' && !val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(cell))) return false;
  }
  return true;
}

/** storage-js envía los Blob como multipart/form-data (como espera el Storage real). */
function extractFile(body: Buffer, contentType: string): Buffer {
  const m = contentType.match(/boundary=(.+)$/);
  if (!m) return body;
  const boundary = Buffer.from(`--${m[1]}`);
  let start = 0;
  for (;;) {
    const i = body.indexOf(boundary, start);
    if (i < 0) break;
    const next = body.indexOf(boundary, i + boundary.length);
    if (next < 0) break;
    const part = body.subarray(i + boundary.length + 2, next - 2);
    const sep = part.indexOf('\r\n\r\n');
    const headers = part.subarray(0, sep).toString();
    if (/filename=|name=""/.test(headers) || /content-type: audio/i.test(headers)) return part.subarray(sep + 4);
    start = next;
  }
  return body;
}

export async function installFakeSupabase(ctx: BrowserContext, db: FakeDb, base = 'http://supabase.test') {
  await ctx.route(`${base}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const auth = req.headers()['authorization'] ?? '';
    const uid = auth.startsWith('Bearer tok-') ? auth.slice('Bearer tok-'.length) : null;

    // ---- Auth
    if (path === '/auth/v1/signup') {
      const b = req.postDataJSON();
      if ([...db.users.values()].some((u) => u.email === b.email)) return json(route, 422, { code: 422, msg: 'User already registered' });
      const u = { id: `user-${db.users.size + 1}`, email: b.email, password: b.password, meta: b.data ?? {} };
      db.users.set(u.id, u);
      db.tables.profiles.push({ id: u.id, plan_id: 'free', display_name: null });
      return json(route, 200, session(u));
    }
    if (path === '/auth/v1/token') {
      const b = req.postDataJSON();
      const u = [...db.users.values()].find((x) => x.email === b.email && x.password === b.password);
      if (!u) return json(route, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return json(route, 200, session(u));
    }
    if (path === '/auth/v1/user') {
      const u = uid ? db.users.get(uid) : undefined;
      if (!u) return json(route, 401, { msg: 'unauthorized' });
      if (method === 'PUT') { const b = req.postDataJSON(); u.meta = { ...u.meta, ...(b.data ?? {}) }; }
      return json(route, 200, session(u).user);
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });

    // ---- Storage
    if (path.startsWith('/storage/v1/object')) {
      if (!uid) return json(route, 401, { message: 'unauthorized' });
      const objPath = path.replace(/^\/storage\/v1\/object\/(authenticated\/)?audio\//, '');
      if (method === 'POST' || method === 'PUT') {
        if (!objPath.startsWith(`${uid}/`)) return json(route, 403, { message: 'RLS: carpeta ajena' });
        db.objects.set(objPath, extractFile(req.postDataBuffer() ?? Buffer.alloc(0), req.headers()['content-type'] ?? ''));
        return json(route, 200, { Key: `audio/${objPath}`, Id: objPath });
      }
      if (method === 'GET') {
        if (!objPath.startsWith(`${uid}/`)) return json(route, 403, { message: 'RLS' });
        const b = db.objects.get(objPath);
        return b ? route.fulfill({ status: 200, body: b, headers: { 'access-control-allow-origin': '*', 'content-type': 'audio/wav' } }) : json(route, 404, { message: 'not found' });
      }
      if (method === 'DELETE') { for (const p of (req.postDataJSON()?.prefixes ?? []) as string[]) db.objects.delete(p); return json(route, 200, []); }
    }

    // ---- PostgREST (con RLS: cada usuario sólo ve sus filas)
    const m = path.match(/^\/rest\/v1\/(\w+)$/);
    if (m && db.tables[m[1]]) {
      if (!uid) return json(route, 401, { message: 'JWT required' });
      const table = m[1];
      const owner = (r: Row) => (table === 'profiles' ? r.id === uid : table === 'project_assets' ? db.tables.projects.some((p) => p.id === r.project_id && p.owner_id === uid) : r.owner_id === uid);
      const rows = db.tables[table];
      const visible = rows.filter((r) => owner(r) && matches(r, url.searchParams));
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
      if (method === 'GET' || method === 'HEAD') {
        if (single) return visible.length === 1 ? json(route, 200, visible[0]) : visible.length === 0 ? json(route, 406, { code: 'PGRST116', message: 'no rows' }) : json(route, 406, { message: 'many' });
        return json(route, 200, visible);
      }
      if (method === 'POST') {
        const body = req.postDataJSON();
        const list: Row[] = Array.isArray(body) ? body : [body];
        for (const r of list) {
          if (table !== 'project_assets' && r.owner_id !== uid) return json(route, 403, { message: 'RLS violation' });
          const key = (x: Row) => (table === 'project_assets' ? `${x.project_id}|${x.asset_id}` : String(x.id));
          const i = rows.findIndex((x) => key(x) === key(r));
          if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ ...r });
        }
        return json(route, 201, list);
      }
      if (method === 'PATCH') { const b = req.postDataJSON(); visible.forEach((r) => Object.assign(r, b)); return json(route, 200, visible); }
      if (method === 'DELETE') { db.tables[table] = rows.filter((r) => !visible.includes(r)); return json(route, 200, visible); }
    }
    db.unhandled.push(`${method} ${path}${url.search}`);
    return json(route, 404, { message: `fake supabase: ruta no simulada ${method} ${path}` });
  });
}

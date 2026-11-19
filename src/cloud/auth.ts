/** Cuentas de usuario (Supabase Auth). Sólo se activa si hay VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. */
import { create } from 'zustand';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { repository, setCloudBackend } from '@/persistence/localRepository';
import type { SyncState } from '@/persistence/hybridRepository';

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
export const cloudConfigured = !!(URL_ && KEY);

export interface CloudUser { id: string; email: string; name: string }
export type AuthMode = 'login' | 'register' | 'forgot' | 'recovery';

interface AuthState {
  ready: boolean;
  user: CloudUser | null;
  sync: SyncState;
  syncError: string | null;
  dialog: AuthMode | null;
  profileOpen: boolean;
  set(p: Partial<AuthState>): void;
}

export const useAuth = create<AuthState>((set) => ({ ready: !cloudConfigured, user: null, sync: 'local', syncError: null, dialog: null, profileOpen: false, set: (p) => set(p) }));

let client: SupabaseClient | null = null;

async function getClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) throw new Error('La nube no está configurada.');
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return client;
}

function toUser(u: User): CloudUser {
  return { id: u.id, email: u.email ?? '', name: (u.user_metadata?.display_name as string | undefined) ?? (u.email ?? '').split('@')[0] };
}

async function applyUser(u: User | null) {
  if (u) {
    const { SupabaseBackend } = await import('./supabaseBackend');
    setCloudBackend(new SupabaseBackend(await getClient(), u.id));
    useAuth.getState().set({ user: toUser(u), sync: 'synced' });
  } else {
    setCloudBackend(null);
    useAuth.getState().set({ user: null, sync: 'local' });
  }
}

export async function initCloud() {
  repository.onSync = (s, e) => useAuth.getState().set({ sync: s, syncError: e ?? null });
  if (!cloudConfigured) return;
  try {
    const sb = await getClient();
    sb.auth.onAuthStateChange((event, session) => {
      void applyUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') useAuth.getState().set({ dialog: 'recovery' });
    });
    const { data } = await sb.auth.getSession();
    await applyUser(data.session?.user ?? null);
  } catch (e) {
    console.warn('[cloud] no disponible', e);
  } finally {
    useAuth.getState().set({ ready: true });
  }
}

const msg = (e: { message: string } | null | undefined, fallback: string) => {
  if (!e) return fallback;
  if (/invalid login credentials/i.test(e.message)) return 'Correo o contraseña incorrectos.';
  if (/already registered/i.test(e.message)) return 'Ya existe una cuenta con ese correo.';
  if (/password should be/i.test(e.message)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/email not confirmed/i.test(e.message)) return 'Confirma tu correo antes de iniciar sesión (revisa tu bandeja de entrada).';
  return e.message;
};

export async function signIn(email: string, password: string) {
  const { error } = await (await getClient()).auth.signInWithPassword({ email, password });
  if (error) throw new Error(msg(error, 'No se pudo iniciar sesión.'));
}

/** Devuelve true si hay que confirmar el correo antes de entrar. */
export async function signUp(email: string, password: string, name: string): Promise<boolean> {
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const { data, error } = await (await getClient()).auth.signUp({ email, password, options: { data: { display_name: name.slice(0, 80) }, emailRedirectTo: location.origin } });
  if (error) throw new Error(msg(error, 'No se pudo crear la cuenta.'));
  return !data.session;
}

export async function signOut() {
  await (await getClient()).auth.signOut();
}

export async function sendPasswordReset(email: string) {
  const { error } = await (await getClient()).auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) throw new Error(msg(error, 'No se pudo enviar el correo.'));
}

export async function updatePassword(password: string) {
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const { error } = await (await getClient()).auth.updateUser({ password });
  if (error) throw new Error(msg(error, 'No se pudo cambiar la contraseña.'));
}

export async function updateDisplayName(name: string) {
  const sb = await getClient();
  const { data, error } = await sb.auth.updateUser({ data: { display_name: name.slice(0, 80) } });
  if (error) throw new Error(msg(error, 'No se pudo actualizar el perfil.'));
  const u = useAuth.getState().user;
  if (u) await sb.from('profiles').update({ display_name: name.slice(0, 80) }).eq('id', u.id);
  if (data.user) useAuth.getState().set({ user: toUser(data.user) });
}

export async function cloudProfile(): Promise<{ plan: string; storage: number } | null> {
  const u = useAuth.getState().user;
  if (!u) return null;
  const sb = await getClient();
  const { data } = await sb.from('profiles').select('plan_id').eq('id', u.id).maybeSingle();
  const { data: rows } = await sb.from('assets').select('size_bytes');
  const storage = ((rows ?? []) as { size_bytes: number }[]).reduce((n, r) => n + Number(r.size_bytes), 0);
  return { plan: (data as { plan_id?: string } | null)?.plan_id ?? 'free', storage };
}

export function uploadLocalProjects(onProgress?: (d: number, t: number) => void) {
  return repository.uploadAllLocal(onProgress);
}

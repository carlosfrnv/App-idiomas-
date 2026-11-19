import { useEffect, useState } from 'react';
import { CloudUpload, KeyRound, LogOut, UserRound, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cloudProfile, sendPasswordReset, signIn, signOut, signUp, updateDisplayName, updatePassword, uploadLocalProjects, useAuth, type AuthMode } from '@/cloud/auth';
import { PLANS } from '@/config/plans';
import { formatBytes } from '@/lib/format';
import { toast } from '@/state/toastStore';

const input = 'h-9 w-full rounded-md border border-line bg-bg px-3 text-sm outline-none focus:border-primary';
const TITLES: Record<AuthMode, string> = { login: 'Iniciar sesión', register: 'Crear cuenta', forgot: 'Recuperar contraseña', recovery: 'Nueva contraseña' };

export function AuthDialog() {
  const mode = useAuth((s) => s.dialog);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  useEffect(() => { setError(''); setInfo(''); setPassword(''); }, [mode]);
  const close = () => useAuth.getState().set({ dialog: null });
  const go = (m: AuthMode) => useAuth.getState().set({ dialog: m });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try {
      if (mode === 'login') { await signIn(email.trim(), password); toast.success('Sesión iniciada'); close(); }
      else if (mode === 'register') {
        const confirm = await signUp(email.trim(), password, name.trim());
        if (confirm) setInfo('Te hemos enviado un correo para confirmar tu cuenta. Después, inicia sesión.');
        else { toast.success('Cuenta creada'); close(); }
      } else if (mode === 'forgot') { await sendPasswordReset(email.trim()); setInfo('Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.'); }
      else if (mode === 'recovery') { await updatePassword(password); toast.success('Contraseña actualizada'); close(); }
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  if (!mode) return null;
  return (
    <Modal open onClose={close} title={TITLES[mode]} subtitle="Guarda tus proyectos en la nube y ábrelos desde cualquier dispositivo" icon={<UserRound size={18} />} width={420}>
      <form onSubmit={submit} className="flex flex-col gap-3" data-testid="auth-form">
        {mode === 'register' && <input className={input} placeholder="Nombre artístico" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" aria-label="Nombre" />}
        {mode !== 'recovery' && <input className={input} type="email" required placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="Correo" />}
        {mode !== 'forgot' && <input className={input} type="password" required minLength={mode === 'login' ? 1 : 8} placeholder={mode === 'login' ? 'Contraseña' : 'Contraseña (mín. 8 caracteres)'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-label="Contraseña" />}
        {error && <div className="rounded-md border border-rec/30 bg-rec/10 px-3 py-2 text-xs text-rec">{error}</div>}
        {info && <div className="rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">{info}</div>}
        <Button type="submit" variant="primary" disabled={busy} icon={busy ? <Loader2 size={14} className="animate-spin" /> : undefined}>{TITLES[mode]}</Button>
        <div className="flex justify-between text-xs text-muted">
          {mode === 'login' && <><button type="button" className="hover:text-fg" onClick={() => go('forgot')}>¿Olvidaste la contraseña?</button><button type="button" className="text-primary" onClick={() => go('register')}>Crear cuenta</button></>}
          {(mode === 'register' || mode === 'forgot') && <button type="button" className="text-primary" onClick={() => go('login')}>Ya tengo cuenta</button>}
        </div>
        <p className="text-[10px] text-dim">Tus grabaciones son privadas: sólo tú puedes acceder a tus proyectos y audios.</p>
      </form>
    </Modal>
  );
}

export function ProfileDialog() {
  const open = useAuth((s) => s.profileOpen);
  const user = useAuth((s) => s.user);
  const sync = useAuth((s) => s.sync);
  const syncError = useAuth((s) => s.syncError);
  const [name, setName] = useState('');
  const [info, setInfo] = useState<{ plan: string; storage: number } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  useEffect(() => { if (open && user) { setName(user.name); cloudProfile().then(setInfo).catch(() => setInfo(null)); } }, [open, user]);
  if (!open || !user) return null;
  const plan = PLANS[(info?.plan as 'free' | 'pro') ?? 'free'] ?? PLANS.free;
  const close = () => useAuth.getState().set({ profileOpen: false });
  return (
    <Modal open onClose={close} title="Perfil" subtitle={user.email} icon={<UserRound size={18} />} width={460}>
      <div className="flex flex-col gap-4 text-sm">
        <label className="flex flex-col gap-1.5"><span className="label-xs">Nombre artístico</span>
          <div className="flex gap-2"><input className={input} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre artístico" />
            <Button onClick={async () => { try { await updateDisplayName(name.trim()); toast.success('Perfil actualizado'); } catch (e) { toast.error('Error', (e as Error).message); } }}>Guardar</Button></div>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line p-3"><div className="label-xs">Plan</div><div className="mt-1 font-semibold">{info?.plan === 'pro' ? 'Pro' : 'Gratis'}</div></div>
          <div className="rounded-lg border border-line p-3"><div className="label-xs">Almacenamiento</div><div className="mt-1 font-semibold">{info ? `${formatBytes(info.storage)} / ${formatBytes(plan.maxStorageBytes)}` : '—'}</div></div>
        </div>
        <div className="rounded-lg border border-line p-3 text-xs text-muted">
          Sincronización: <b className={sync === 'error' ? 'text-rec' : 'text-ok'}>{sync === 'syncing' ? 'sincronizando…' : sync === 'error' ? 'error' : 'al día'}</b>{syncError && <span className="block text-rec">{syncError}</span>}
          <div className="mt-2"><Button size="sm" icon={uploading ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} />} disabled={!!uploading} onClick={async () => {
            setUploading('…');
            try { const n = await uploadLocalProjects((d, t) => setUploading(`${d}/${t}`)); toast.success('Proyectos subidos', `${n} proyecto(s) de este navegador ya están en tu cuenta.`); }
            catch (e) { toast.error('Error al subir', (e as Error).message); } finally { setUploading(null); }
          }}>{uploading ? `Subiendo ${uploading}` : 'Subir los proyectos de este navegador'}</Button></div>
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" icon={<KeyRound size={14} />} onClick={() => useAuth.getState().set({ profileOpen: false, dialog: 'recovery' })}>Cambiar contraseña</Button>
          <Button variant="ghost" icon={<LogOut size={14} />} onClick={async () => { await signOut(); close(); toast.info('Sesión cerrada', 'Tus proyectos siguen en este navegador y en la nube.'); }}>Cerrar sesión</Button>
        </div>
      </div>
    </Modal>
  );
}

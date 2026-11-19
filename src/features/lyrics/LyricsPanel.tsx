import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Lightbulb, Loader2, Music2, PenLine, RefreshCw, Repeat2, Sparkles, Wand2, X, ArrowDownToLine, Replace, AlertTriangle } from 'lucide-react';
import { useProject } from '@/state/projectStore';
import { emptyLyrics } from '@/state/docOps';
import type { LyricsDoc } from '@/types/project';
import { analyzeLine, rhymeGroups } from '@/lib/spanishMeter';
import { Button } from '@/components/ui/Button';
import { fetchAiStatus, requestLyrics, type AiResult, type AiStatus, type LyricsMode } from '@/app/lyricsAi';
import { toast } from '@/state/toastStore';

const GENRES = ['Trap', 'Rap', 'Reguetón', 'Pop', 'R&B', 'Drill', 'Corrido tumbado', 'Dembow', 'Balada', 'Rock'];
const MOODS = ['Melancólico', 'Motivador', 'Romántico', 'Fiesta', 'Desamor', 'Agresivo', 'Nostálgico', 'Sensual', 'Reflexivo'];
const RHYME_COLORS = ['#8B5CF6', '#38BDF8', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6', '#F97316', '#A3E635'];
const LINE_H = 24;

const ACTIONS: { mode: LyricsMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { mode: 'verse', label: 'Verso', icon: <PenLine size={14} />, hint: 'Escribe un verso de 16 líneas' },
  { mode: 'chorus', label: 'Estribillo', icon: <Repeat2 size={14} />, hint: 'Crea un estribillo pegadizo' },
  { mode: 'continue', label: 'Continuar', icon: <ArrowDownToLine size={14} />, hint: 'Sigue tu letra donde la dejaste' },
  { mode: 'improve', label: 'Mejorar', icon: <Wand2 size={14} />, hint: 'Reescribe el fragmento seleccionado' },
  { mode: 'rhymes', label: 'Rimas', icon: <Music2 size={14} />, hint: 'Rimas para la palabra seleccionada o junto al cursor' },
  { mode: 'ideas', label: 'Ideas', icon: <Lightbulb size={14} />, hint: '5 ideas de canción con gancho' },
];

function wordAt(text: string, pos: number): string {
  const left = text.slice(0, pos).match(/[\p{L}]+$/u)?.[0] ?? '';
  const right = text.slice(pos).match(/^[\p{L}]+/u)?.[0] ?? '';
  return left + right;
}

export function LyricsPanel() {
  const lyrics = useProject((s) => s.doc.lyrics ?? emptyLyrics());
  const bpm = useProject((s) => s.doc.bpm);
  const set = (patch: Partial<LyricsDoc>, key = 'lyrics-meta') =>
    useProject.getState().apply((d) => ({ ...d, lyrics: { ...(d.lyrics ?? emptyLyrics()), ...patch } }), { key });
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const sel = useRef({ start: 0, end: 0 });
  const [status, setStatus] = useState<AiStatus | null | 'loading'>('loading');
  const [busy, setBusy] = useState<LyricsMode | null>(null);
  const [result, setResult] = useState<(AiResult & { mode: LyricsMode; replace?: { start: number; end: number } }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { fetchAiStatus().then(setStatus); return () => abort.current?.abort(); }, []);

  const lines = useMemo(() => lyrics.text.split('\n'), [lyrics.text]);
  const infos = useMemo(() => lines.map(analyzeLine), [lines]);
  const groups = useMemo(() => rhymeGroups(lines), [lines]);
  const words = lyrics.text.split(/\s+/).filter(Boolean).length;

  const rememberSel = () => { const el = ta.current; if (el) sel.current = { start: el.selectionStart, end: el.selectionEnd }; };

  const run = async (mode: LyricsMode) => {
    setError(null);
    const { start, end } = sel.current;
    let selection: string | undefined;
    let replace: { start: number; end: number } | undefined;
    if (mode === 'improve') {
      selection = lyrics.text.slice(start, end).trim();
      if (!selection) { setError('Selecciona en el editor el fragmento que quieres mejorar.'); return; }
      replace = { start, end };
    }
    if (mode === 'rhymes') {
      // última palabra de la selección (completada si la selección la corta) o la palabra junto al cursor
      const trimmedEnd = start === end ? start : start + lyrics.text.slice(start, end).trimEnd().length;
      selection = wordAt(lyrics.text, trimmedEnd) || undefined;
      if (!selection) { setError('Coloca el cursor sobre una palabra (o selecciónala) para buscar rimas.'); return; }
    }
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(mode);
    try {
      const r = await requestLyrics(mode, lyrics, { selection, bpm }, abort.current.signal);
      setResult({ ...r, mode, replace });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const insertEnd = (text: string) => {
    const cur = lyrics.text.replace(/\s+$/, '');
    set({ text: (cur ? `${cur}\n\n` : '') + text }, 'lyrics-insert');
  };
  const insertTag = (tag: string) => {
    const el = ta.current;
    const pos = el ? el.selectionStart : lyrics.text.length;
    const before = lyrics.text.slice(0, pos);
    const ins = `${before && !before.endsWith('\n') ? '\n' : ''}[${tag}]\n`;
    set({ text: before + ins + lyrics.text.slice(pos) }, 'lyrics-insert');
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + ins.length, pos + ins.length); });
  };

  const notConfigured = status !== 'loading' && !status?.configured;

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row" data-testid="lyrics-panel">
      {/* Editor */}
      <section className="flex min-h-[220px] min-w-0 flex-1 flex-col border-line md:border-r">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5">
          <span className="text-[13px] font-semibold">Letra</span>
          <span className="text-[11px] text-dim">{lines.filter((l) => l.trim()).length} líneas · {words} palabras</span>
          <div className="flex-1" />
          {['Intro', 'Verso', 'Pre-estribillo', 'Estribillo', 'Puente', 'Outro'].map((t) => (
            <button key={t} onClick={() => insertTag(t)} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-fg" data-tip={`Insertar sección [${t}]`}>{t}</button>
          ))}
        </div>
        <div className="relative flex min-h-0 flex-1">
          <textarea
            ref={ta}
            data-testid="lyrics-editor"
            aria-label="Letra de la canción"
            value={lyrics.text}
            wrap="off"
            spellCheck
            placeholder={'Escribe tu letra aquí…\n\n[Verso]\nCada línea muestra sus sílabas a la derecha,\ny las líneas que riman se marcan con el mismo color.'}
            onChange={(e) => set({ text: e.target.value }, 'lyrics-text')}
            onSelect={rememberSel}
            onKeyUp={rememberSel}
            onMouseUp={rememberSel}
            onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
            className="min-w-0 flex-1 resize-none overflow-auto bg-bg/40 px-4 py-3 text-[14px] text-fg outline-none placeholder:text-dim"
            style={{ lineHeight: `${LINE_H}px` }}
          />
          <div ref={gutter} className="w-[86px] shrink-0 overflow-hidden border-l border-line-soft bg-panel py-3" aria-label="Sílabas y rimas por línea">
            {infos.map((info, i) => {
              const g = groups[i];
              return (
                <div key={i} className="flex items-center justify-end gap-1.5 pr-2 font-mono text-[10px]" style={{ height: LINE_H }} data-testid="lyrics-line-meta">
                  {g != null && <span className="max-w-[44px] truncate rounded px-1 text-[9px] font-bold text-bg" style={{ background: RHYME_COLORS[g % RHYME_COLORS.length] }} title={`Rima: -${info.key?.consonant}`}>-{info.key?.consonant}</span>}
                  {info.syllables > 0 && <span className="text-muted" title="Sílabas (con sinalefa)">{info.syllables}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Asistente IA */}
      <aside className="flex w-full shrink-0 flex-col overflow-y-auto md:w-[380px]" data-testid="lyrics-ai">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Sparkles size={15} className="text-primary" />
          <span className="text-[13px] font-semibold">Asistente de letras IA</span>
          <div className="flex-1" />
          {status !== 'loading' && status?.configured && <span className="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] font-semibold text-ok">{status.providers.map((p) => (p === 'groq' ? 'Groq' : 'Gemini')).join(' + ')}</span>}
        </div>
        <div className="flex flex-col gap-3 p-3">
          {notConfigured && (
            <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-[11px] text-muted" data-testid="lyrics-ai-off">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
              <div><b className="text-fg">IA no configurada.</b> Añade <code>GROQ_API_KEY</code> o <code>GEMINI_API_KEY</code> (gratuitas) en <code>.env.local</code> del servidor y reinicia. El contador de sílabas y rimas funciona sin IA.</div>
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="label-xs">Tema de la canción</span>
            <input value={lyrics.theme} onChange={(e) => set({ theme: e.target.value.slice(0, 300) })} placeholder="Ej.: salir del barrio sin olvidar de dónde vengo" className="h-8 rounded-md border border-line bg-bg px-2 text-[13px] outline-none focus:border-primary" data-testid="lyrics-theme" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1"><span className="label-xs">Género</span>
              <select value={lyrics.genre} onChange={(e) => set({ genre: e.target.value })} className="h-8 rounded-md border border-line bg-bg px-1.5 text-xs outline-none">{GENRES.map((g) => <option key={g}>{g}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1"><span className="label-xs">Ánimo</span>
              <select value={lyrics.mood} onChange={(e) => set({ mood: e.target.value })} className="h-8 rounded-md border border-line bg-bg px-1.5 text-xs outline-none">{MOODS.map((g) => <option key={g}>{g}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1"><span className="label-xs">Español</span>
              <select value={lyrics.dialect} onChange={(e) => set({ dialect: e.target.value as LyricsDoc['dialect'] })} className="h-8 rounded-md border border-line bg-bg px-1.5 text-xs outline-none">
                <option value="neutro">Neutro</option><option value="espana">España</option><option value="latino">Latino</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {ACTIONS.map((a) => (
              <button
                key={a.mode}
                data-testid={`lyrics-ai-${a.mode}`}
                data-tip={a.hint}
                disabled={!!busy || notConfigured}
                onMouseDown={(e) => e.preventDefault() /* conserva la selección del editor */}
                onClick={() => void run(a.mode)}
                className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-surface/60 text-[12px] font-medium hover:border-primary/60 hover:bg-primary/10 disabled:opacity-40"
              >
                {busy === a.mode ? <Loader2 size={14} className="animate-spin" /> : a.icon}{a.label}
              </button>
            ))}
          </div>
          {busy && <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => abort.current?.abort()}>Cancelar</Button>}
          {error && <div className="rounded-lg border border-rec/30 bg-rec/10 p-2.5 text-[12px] text-rec" data-testid="lyrics-ai-error">{error}</div>}
          {result && (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="lyrics-ai-result">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <Sparkles size={12} className="text-primary" /> Sugerencia · {result.provider === 'groq' ? 'Groq' : 'Gemini'} <span className="truncate font-mono text-dim">{result.model}</span>
              </div>
              <pre className="max-h-[260px] overflow-y-auto whitespace-pre-wrap font-sans text-[13px] leading-6 text-fg">{result.text}</pre>
              <div className="flex flex-wrap gap-1.5">
                {result.mode !== 'rhymes' && result.mode !== 'ideas' && (result.replace
                  ? <Button size="sm" variant="primary" icon={<Replace size={13} />} data-testid="lyrics-ai-replace" onClick={() => { const r = result.replace!; set({ text: lyrics.text.slice(0, r.start) + result.text + lyrics.text.slice(r.end) }, 'lyrics-insert'); setResult(null); toast.success('Fragmento reemplazado'); }}>Reemplazar selección</Button>
                  : <Button size="sm" variant="primary" icon={<ArrowDownToLine size={13} />} data-testid="lyrics-ai-insert" onClick={() => { insertEnd(result.mode === 'chorus' ? `[Estribillo]\n${result.text}` : result.text); setResult(null); toast.success('Añadido a la letra'); }}>Añadir a la letra</Button>)}
                <Button size="sm" icon={<Copy size={13} />} onClick={() => { void navigator.clipboard?.writeText(result.text); toast.info('Copiado'); }}>Copiar</Button>
                <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} disabled={!!busy} onClick={() => void run(result.mode)}>Otra versión</Button>
              </div>
            </div>
          )}
          <p className="text-[10px] leading-snug text-dim">El texto lo genera un servicio externo (Groq o Google). Revísalo antes de publicar: eres responsable de la letra final. No envíes datos personales.</p>
        </div>
      </aside>
    </div>
  );
}

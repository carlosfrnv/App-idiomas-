import { useState } from 'react';
import { GraduationCap, FileAudio, Circle, SlidersHorizontal, Download } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useSettings } from '@/state/settingsStore';

const STEPS = [
  { icon: <FileAudio size={22} />, title: '1 · Importa tu instrumental', text: 'Arrastra un archivo de audio a la línea temporal o usa la biblioteca de la izquierda. Verás su forma de onda real.' },
  { icon: <Circle size={22} className="text-rec" fill="currentColor" />, title: '2 · Graba tu voz', text: 'Ponte auriculares y pulsa el botón rojo (o R). El beat sonará mientras grabas; cada toma se guarda como un clip editable.' },
  { icon: <SlidersHorizontal size={22} />, title: '3 · Edita y mezcla', text: 'Mueve, recorta y divide clips (S). Ajusta volumen y panorama en el mezclador y añade presets vocales en Efectos.' },
  { icon: <Download size={22} />, title: '4 · Exporta', text: 'Tu proyecto se guarda solo. Cuando esté listo, pulsa Exportar para descargar la mezcla en WAV.' },
];

export function Tutorial() {
  const done = useSettings((s) => s.tutorialDone);
  const [i, setI] = useState(0);
  const close = () => { useSettings.getState().set({ tutorialDone: true }); setI(0); };
  const s = STEPS[i];
  return (
    <Modal open={!done} onClose={close} title="Bienvenido a tu estudio" subtitle="Un recorrido rápido de 4 pasos (puedes saltarlo)" icon={<GraduationCap size={18} />} width={460}
      footer={<>
        <Button variant="ghost" onClick={close} data-testid="tutorial-skip">Saltar</Button>
        {i > 0 && <Button onClick={() => setI(i - 1)}>Anterior</Button>}
        {i < STEPS.length - 1 ? <Button variant="primary" onClick={() => setI(i + 1)}>Siguiente</Button> : <Button variant="primary" onClick={close}>Empezar</Button>}
      </>}>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">{s.icon}</div>
        <h3 className="text-base font-semibold">{s.title}</h3>
        <p className="max-w-sm text-sm text-muted">{s.text}</p>
        <div className="mt-2 flex gap-1.5">{STEPS.map((_, j) => <span key={j} className={`h-1.5 rounded-full transition-all ${j === i ? 'w-5 bg-primary' : 'w-1.5 bg-line'}`} />)}</div>
      </div>
    </Modal>
  );
}

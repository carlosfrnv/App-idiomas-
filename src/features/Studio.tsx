import { useEffect, useRef } from 'react';
import { ChevronRight, Upload } from 'lucide-react';
import { TopBar } from './topbar/TopBar';
import { TransportBar } from './transport/TransportBar';
import { LibraryPanel } from './library/LibraryPanel';
import { Timeline } from './editor/Timeline';
import { BottomPanel } from './editor/BottomPanel';
import { ExportDialog } from './export/ExportDialog';
import { RecordSetupDialog } from './recording/RecordSetupDialog';
import { HelpDialog } from './projects/HelpDialog';
import { SettingsDialog } from './projects/SettingsDialog';
import { Tutorial } from './onboarding/Tutorial';
import { useUi } from '@/state/uiStore';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useIsMobile, useIsTablet } from '@/hooks/useMediaQuery';
import { importFiles } from '@/app/editing';
import { useTransport } from '@/state/transportStore';
import { IMPORT_LIMITS } from '@/config/app';
import { IconButton, Button } from '@/components/ui/Button';

export function Studio() {
  useShortcuts();
  const libraryOpen = useUi((s) => s.libraryOpen);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const fileRef = useRef<HTMLInputElement>(null);
  const openImport = () => fileRef.current?.click();

  useEffect(() => { if (isTablet) useUi.getState().set({ libraryOpen: false }); }, [isTablet]);
  useEffect(() => { if (isMobile) useUi.getState().set({ bottomPanel: null, pxPerSec: 20 }); }, [isMobile]);

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="studio">
      <TopBar />
      <TransportBar />
      <div className="flex min-h-0 flex-1">
        {!isMobile && (libraryOpen ? <LibraryPanel onImport={openImport} /> : (
          <div className="flex w-8 shrink-0 flex-col items-center border-r border-line bg-panel py-2">
            <IconButton label="Mostrar biblioteca (B)" size="sm" tipPos="right" onClick={() => useUi.getState().set({ libraryOpen: true })}><ChevronRight size={15} /></IconButton>
            <IconButton label="Importar audio" size="sm" tipPos="right" onClick={openImport}><Upload size={14} /></IconButton>
          </div>
        ))}
        <div className="flex min-w-0 flex-1 flex-col">
          <Timeline onImportClick={openImport} />
          {!isMobile && <BottomPanel />}
          {isMobile && (
            <div className="flex shrink-0 items-center gap-2 border-t border-line bg-panel p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
              <Button size="lg" icon={<Upload size={16} />} onClick={openImport} className="flex-1">Importar audio</Button>
              <span className="text-[11px] text-dim">Vista simplificada · usa un ordenador para mezclar</span>
            </div>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={[...IMPORT_LIMITS.acceptedMime, ...IMPORT_LIMITS.acceptedExt.map((e) => `.${e}`)].join(',')}
        className="hidden"
        data-testid="file-input"
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; if (files.length) void importFiles(files, { at: useTransport.getState().position > 0 ? useTransport.getState().position : 0 }); }}
      />
      <ExportDialog />
      <RecordSetupDialog />
      <HelpDialog />
      <SettingsDialog />
      <Tutorial />
    </div>
  );
}

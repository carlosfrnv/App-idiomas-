/** Configuración global de marca. El nombre es configurable vía VITE_APP_NAME. */
export const APP_NAME: string = (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || 'estudivo.com';

/** Límites de importación (validación de archivos). */
export const IMPORT_LIMITS = {
  maxFileBytes: 200 * 1024 * 1024,
  acceptedMime: ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm'],
  acceptedExt: ['wav', 'wave', 'mp3', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'webm', 'opus'],
} as const;

export const TRACK_COLORS = ['#8B5CF6', '#38BDF8', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6', '#F97316', '#A3E635', '#6366F1', '#EF4444'] as const;

# Cuentas y nube (Supabase) — puesta en marcha

Estado: **implementado y probado contra un Supabase simulado** (`e2e/cloud.spec.ts`). Falta la
verificación con un proyecto Supabase real, que requiere tu cuenta. Mientras no configures las
variables, la app funciona en modo local y **no muestra** ninguna opción de cuenta.

## Qué incluye
- Registro, inicio de sesión, recuperación y cambio de contraseña, perfil (nombre artístico, plan, espacio usado).
- Sincronización híbrida (`src/persistence/hybridRepository.ts`): IndexedDB siempre (funciona sin conexión)
  + nube con sesión. Gana la versión más reciente; los audios se suben una sola vez; otro dispositivo
  descarga proyecto y audio y los guarda en caché.
- "Subir los proyectos de este navegador" para migrar lo local a la cuenta.
- Seguridad: RLS en todas las tablas y bucket privado `audio/<user_id>/…` (`supabase/migrations/0001_init.sql`).
  La clave *anon* es pública por diseño; la `service_role` **nunca** va en el frontend.

## Pasos (unos 10 minutos)
1. Crea un proyecto gratis en https://supabase.com.
2. En *SQL Editor*, pega y ejecuta `supabase/migrations/0001_init.sql`.
3. En *Project Settings → API*, copia **Project URL** y **anon public key** a `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. En *Authentication → URL Configuration*, pon como *Site URL* la dirección de tu web (en local `http://localhost:5173`).
5. Opcional: en *Authentication → Providers → Email* decide si exiges confirmar el correo.
6. Opcional (retención): programa `select public.purge_deleted_projects();` con pg_cron.

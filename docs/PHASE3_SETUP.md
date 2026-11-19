# Fase 3 — Plataforma online (preparación)

Estado: **preparado, no activado**. Requiere un proyecto de Supabase (decisión y credenciales del usuario).

## Qué hay listo
- `supabase/migrations/0001_init.sql`: tablas `profiles`, `plans`, `subscriptions`,
  `projects`, `assets`, `project_assets`, `usage_events`; **RLS en todas** (cada usuario sólo
  ve lo suyo), bucket privado `audio` con límite de tamaño y tipos MIME, políticas de Storage
  por carpeta `<user_id>/…`, función de retención `purge_deleted_projects`.
- `src/persistence/repository.ts`: interfaz `ProjectRepository`; la app sólo depende de ella.
  Implementar `SupabaseRepository` con la misma interfaz no requiere tocar la UI ni el motor.

## Pasos manuales necesarios
1. Crear un proyecto en https://supabase.com y ejecutar la migración (`supabase db push` o el editor SQL).
2. Copiar `.env.example` a `.env.local` y rellenar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (la clave *anon* es pública y está protegida por RLS). **Nunca** pongas la `service_role` en el frontend.
3. Configurar en Auth: plantillas de correo (recuperación de contraseña) y URL del sitio.

## Pendiente de implementar al disponer de credenciales
- `SupabaseRepository` (subida de audio a Storage con reanudación, caché local en IndexedDB).
- Pantallas de registro, inicio de sesión, recuperación de contraseña y perfil.
- Migración de proyectos locales a la cuenta al iniciar sesión.

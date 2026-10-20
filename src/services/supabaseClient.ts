import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.ts';
import { validateSupabaseEnvConfig } from '../utils/permissions.ts';

export { validateSupabaseEnvConfig };

const envUrl =
  import.meta.env?.VITE_SUPABASE_URL?.trim() ||
  'https://hfauomdafjwknhxfuoce.supabase.co';
const envAnonKey =
  import.meta.env?.VITE_SUPABASE_ANON_KEY?.trim() ||
  'sb_publishable_32L6HtBqvj6NvLFoHdJovA_o0Mul52L';

const envCheck = validateSupabaseEnvConfig(envUrl, envAnonKey);

export const IS_SUPABASE_CONFIGURED = envCheck.isConfigured;
export const SUPABASE_SECURITY_WARNING = envCheck.securityWarning;

export const STORAGE_BUCKET_NAME =
  import.meta.env?.VITE_SUPABASE_STORAGE_BUCKET?.trim() || 'student-photos';

export const DEFAULT_JPEG_QUALITY = Number(
  import.meta.env?.VITE_DEFAULT_JPEG_QUALITY || 0.9
);

/**
 * Instancia tipada de Supabase Client.
 * Si Supabase no está configurado aún en `.env`, es `null` y el sistema informa
 * con total transparencia que se requiere configurar `.env` (o permite usar el entorno de demostración).
 */
export const supabase: SupabaseClient<Database> | null = IS_SUPABASE_CONFIGURED
  ? createClient<Database>(envUrl, envAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'srf_institucional_auth_v1'
      }
    })
  : null;

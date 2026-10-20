import type { PermissionCheck, UserSessionContext } from '../types/domain.ts';

export type ProtectedAction =
  | 'IMPORT_PADRON'
  | 'DELETE_STUDENT'
  | 'MANAGE_USERS'
  | 'CAPTURE_PHOTO'
  | 'REPLACE_PHOTO'
  | 'VIEW_PHOTO'
  | 'EXPORT_PHOTOS';

/**
 * Valida permisos según el rol (admin vs operator) y estado activo del usuario.
 * No asume que estar autenticado da permiso para todas las operaciones.
 */
export function checkActionPermission(
  session: UserSessionContext | null | undefined,
  action: ProtectedAction
): PermissionCheck {
  if (!session || !session.userId) {
    return {
      allowed: false,
      reason: 'Debe iniciar sesión con una cuenta autorizada para realizar esta acción.'
    };
  }

  if (!session.isActive) {
    return {
      allowed: false,
      reason: 'Su cuenta de usuario se encuentra desactivada. Contacte al administrador del sistema.'
    };
  }

  const adminOnlyActions: ProtectedAction[] = [
    'IMPORT_PADRON',
    'DELETE_STUDENT',
    'MANAGE_USERS'
  ];

  if (adminOnlyActions.includes(action) && session.role !== 'admin') {
    return {
      allowed: false,
      reason: 'Operación restringida: únicamente los usuarios con rol Administrador pueden realizar esta acción.'
    };
  }

  if (session.role !== 'admin' && session.role !== 'operator') {
    return {
      allowed: false,
      reason: 'Su perfil no tiene un rol válido asignado en la institución.'
    };
  }

  return { allowed: true };
}

/**
 * Comprueba que las variables de entorno correspondan a un proyecto real de Supabase
 * y no a valores de ejemplo o vacíos.
 * Asimismo, verifica que por ningún motivo se haya colocado una clave `service_role`.
 */
export function validateSupabaseEnvConfig(url: string, key: string): {
  isConfigured: boolean;
  securityWarning: string | null;
} {
  if (!url || !key) {
    return { isConfigured: false, securityWarning: null };
  }
  if (
    url.includes('su-proyecto-id.supabase.co') ||
    key.endsWith('...') ||
    key === 'your-anon-key'
  ) {
    return { isConfigured: false, securityWarning: null };
  }

  // Bloquear claves secretas del nuevo formato Supabase (`sb_secret_...`)
  if (key.startsWith('sb_secret_')) {
    return {
      isConfigured: false,
      securityWarning:
        'ALERTA DE SEGURIDAD CRÍTICA: Se detectó una clave secreta (`sb_secret_`) en el cliente frontend. El cliente se ha bloqueado para proteger la base de datos. Utilice únicamente la clave pública (`sb_publishable_` o `anon`).'
    };
  }

  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson) as { role?: string };
      if (payload.role === 'service_role') {
        return {
          isConfigured: false,
          securityWarning:
            'ALERTA DE SEGURIDAD CRÍTICA: Se detectó una clave `service_role` en VITE_SUPABASE_ANON_KEY. El cliente se ha bloqueado para proteger la base de datos. Reemplácela inmediatamente por la clave pública `anon`.'
        };
      }
    }
  } catch {
    // Continuar si la clave no es un JWT estándar decodificable
  }

  return { isConfigured: true, securityWarning: null };
}


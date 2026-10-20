import { IS_SUPABASE_CONFIGURED, supabase } from './supabaseClient.ts';
import type { Profile, UserRole } from '../types/database.ts';
import { DEMO_PROFILES } from '../data/demoStudents.ts';
import { AppError, normalizeError } from '../utils/errorHandler.ts';
import { checkActionPermission } from '../utils/permissions.ts';

// Estado en memoria de sesión para modo demostración local (nunca persiste contraseñas ni imágenes en localStorage)
let demoActiveProfile: Profile | null = null;
let demoProfilesStore: Profile[] = [...DEMO_PROFILES];

export interface AuthStateResult {
  profile: Profile | null;
  isDemoMode: boolean;
}

/**
 * Inicia sesión con correo electrónico y contraseña mediante Supabase Auth.
 * No habilita registro público de cuentas ni guarda contraseñas en la base de datos de la aplicación.
 */
export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<AuthStateResult> {
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanEmail || !password) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Por favor ingrese su correo electrónico institucional y su contraseña.',
      false
    );
  }

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    // Modo demostración local claramente identificado cuando aún no se configura .env
    const foundDemo = demoProfilesStore.find(
      (p) => p.email.toLowerCase() === cleanEmail
    );
    if (!foundDemo || password.length < 4) {
      throw new AppError(
        'AUTH_INVALID_CREDENTIALS',
        'Credenciales de demostración no válidas. Use una de las cuentas de prueba indicadas en pantalla.',
        false
      );
    }
    if (!foundDemo.is_active) {
      throw new AppError(
        'AUTH_UNAUTHORIZED',
        'Esta cuenta de usuario se encuentra desactivada por el administrador.',
        false
      );
    }
    demoActiveProfile = { ...foundDemo };
    return { profile: demoActiveProfile, isDemoMode: true };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error || !data.user) {
      throw normalizeError(error, 'No se pudo iniciar sesión. Verifique sus credenciales.');
    }

    const profile = await fetchUserProfileById(data.user.id, data.user.email || cleanEmail);
    if (!profile.is_active) {
      await supabase.auth.signOut();
      throw new AppError(
        'AUTH_UNAUTHORIZED',
        'Su cuenta está desactivada. Comuníquese con el administrador del sistema.',
        false
      );
    }

    return { profile, isDemoMode: false };
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Cierra la sesión activa de forma segura.
 */
export async function signOutSession(): Promise<void> {
  demoActiveProfile = null;
  if (IS_SUPABASE_CONFIGURED && supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw normalizeError(error, 'Error al cerrar la sesión.');
    }
  }
}

/**
 * Recupera la sesión persistida en Supabase Auth y su perfil asociado en `public.profiles`.
 */
export async function getCurrentSessionProfile(): Promise<AuthStateResult> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return { profile: demoActiveProfile, isDemoMode: true };
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) {
    return { profile: null, isDemoMode: false };
  }

  try {
    const profile = await fetchUserProfileById(
      data.session.user.id,
      data.session.user.email || ''
    );
    if (!profile.is_active) {
      await supabase.auth.signOut();
      return { profile: null, isDemoMode: false };
    }
    return { profile, isDemoMode: false };
  } catch {
    return { profile: null, isDemoMode: false };
  }
}

async function fetchUserProfileById(userId: string, fallbackEmail: string): Promise<Profile> {
  if (!supabase) {
    throw new AppError('AUTH_UNAUTHORIZED', 'Cliente de Supabase no inicializado.', false);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    throw new AppError(
      'AUTH_UNAUTHORIZED',
      `El usuario (${fallbackEmail}) no cuenta con un perfil autorizado en la institución.`,
      false
    );
  }

  return data as Profile;
}

/**
 * Lista los perfiles de usuarios registrados para gestión básica por el administrador.
 */
export async function listAuthorizedProfiles(currentProfile: Profile): Promise<Profile[]> {
  const perm = checkActionPermission(
    { userId: currentProfile.id, role: currentProfile.role, isActive: currentProfile.is_active },
    'MANAGE_USERS'
  );
  if (!perm.allowed) {
    throw new AppError('AUTH_FORBIDDEN_ROLE', perm.reason || 'Permiso denegado.', false);
  }

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return [...demoProfilesStore];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw normalizeError(error, 'Error al consultar la lista de usuarios autorizados.');
  }

  return (data || []) as Profile[];
}

/**
 * Permite a un administrador cambiar el rol ('admin' | 'operator'), nombre o estado activo de un usuario.
 */
export async function updateAuthorizedUserProfile(
  adminProfile: Profile,
  targetUserId: string,
  updates: { role?: UserRole; is_active?: boolean; full_name?: string }
): Promise<Profile> {
  const perm = checkActionPermission(
    { userId: adminProfile.id, role: adminProfile.role, isActive: adminProfile.is_active },
    'MANAGE_USERS'
  );
  if (!perm.allowed) {
    throw new AppError('AUTH_FORBIDDEN_ROLE', perm.reason || 'Permiso denegado.', false);
  }

  if (adminProfile.id === targetUserId && updates.is_active === false) {
    throw new AppError(
      'VALIDATION_ERROR',
      'No puede desactivar su propia cuenta de administrador mientras tiene una sesión activa.',
      false
    );
  }

  if (adminProfile.id === targetUserId && updates.role === 'operator') {
    throw new AppError(
      'VALIDATION_ERROR',
      'No puede quitarse a sí mismo el rol de Administrador.',
      false
    );
  }

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const idx = demoProfilesStore.findIndex((p) => p.id === targetUserId);
    if (idx === -1) {
      throw new AppError('VALIDATION_ERROR', 'Usuario no encontrado.', false);
    }
    demoProfilesStore[idx] = {
      ...demoProfilesStore[idx],
      ...updates,
      updated_at: new Date().toISOString()
    };
    return demoProfilesStore[idx];
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', targetUserId)
    .select('*')
    .single();

  if (error || !data) {
    throw normalizeError(error, 'No se pudo actualizar el perfil del usuario.');
  }

  return data as Profile;
}

import {
  IS_SUPABASE_CONFIGURED,
  createIsolatedAuthClient,
  supabase
} from './supabaseClient.ts';
import type {
  Profile,
  UserEducationLevelScope,
  UserRole
} from '../types/database.ts';
import { DEMO_PROFILES } from '../data/demoStudents.ts';
import { AppError, normalizeError } from '../utils/errorHandler.ts';
import { checkActionPermission } from '../utils/permissions.ts';
import { getUserEffectiveLevelScope } from '../utils/academicFilter.ts';

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

  const profile = data as Profile;
  return {
    ...profile,
    assigned_level: getUserEffectiveLevelScope(profile)
  };
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
    return demoProfilesStore.map((p) => ({
      ...p,
      assigned_level: getUserEffectiveLevelScope(p)
    }));
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    throw normalizeError(error, 'Error al consultar la lista de usuarios autorizados.');
  }

  return ((data || []) as Profile[]).map((p) => ({
    ...p,
    assigned_level: getUserEffectiveLevelScope(p)
  }));
}

/**
 * Permite a un administrador crear una nueva cuenta de usuario (con rol y nivel Primaria/Secundaria/Todos)
 * directamente desde la aplicación web sin cerrar su propia sesión.
 */
export async function createAuthorizedUserAccount(
  adminProfile: Profile,
  input: {
    email: string;
    password: string;
    full_name: string;
    role: UserRole;
    assigned_level: UserEducationLevelScope;
  }
): Promise<{ profile: Profile; requiresEmailConfirmSQL: boolean }> {
  const perm = checkActionPermission(
    { userId: adminProfile.id, role: adminProfile.role, isActive: adminProfile.is_active },
    'MANAGE_USERS'
  );
  if (!perm.allowed) {
    throw new AppError('AUTH_FORBIDDEN_ROLE', perm.reason || 'Permiso denegado.', false);
  }

  const cleanEmail = input.email.trim().toLowerCase();
  const cleanName = input.full_name.trim();
  const password = input.password;

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new AppError('VALIDATION_ERROR', 'Ingrese un correo electrónico válido.', false);
  }
  if (password.length < 6) {
    throw new AppError('VALIDATION_ERROR', 'La contraseña debe tener al menos 6 caracteres.', false);
  }
  if (cleanName.length < 2) {
    throw new AppError('VALIDATION_ERROR', 'Ingrese el nombre completo o cargo del usuario.', false);
  }

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    if (demoProfilesStore.some((p) => p.email.toLowerCase() === cleanEmail)) {
      throw new AppError('VALIDATION_ERROR', 'Ya existe un usuario con ese correo.', false);
    }
    const created: Profile = {
      id: crypto.randomUUID(),
      email: cleanEmail,
      full_name: cleanName,
      role: input.role,
      assigned_level: input.assigned_level,
      is_active: true,
      created_at: new Date().toISOString()
    };
    demoProfilesStore.push(created);
    return { profile: created, requiresEmailConfirmSQL: false };
  }

  // 1. Intentar creación directa con correo ya confirmado mediante la función RPC de la migración 005
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'admin_create_user_account',
    {
      p_email: cleanEmail,
      p_password: password,
      p_full_name: cleanName,
      p_role: input.role,
      p_assigned_level: input.assigned_level
    }
  );

  if (!rpcError && rpcData) {
    const row = rpcData as {
      id: string;
      email: string;
      full_name: string;
      role: UserRole;
      assigned_level: UserEducationLevelScope;
      is_active: boolean;
    };
    return {
      profile: {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: row.role,
        assigned_level: row.assigned_level,
        is_active: row.is_active,
        created_at: new Date().toISOString()
      },
      requiresEmailConfirmSQL: false
    };
  }

  // Si el error es de negocio (ej. correo duplicado), propagarlo
  if (rpcError && String(rpcError.message || '').includes('Ya existe una cuenta')) {
    throw new AppError('VALIDATION_ERROR', rpcError.message, false);
  }

  // 2. Respaldo mediante cliente aislado (si aún no se corrió la migración 005 en SQL Editor)
  const isolatedClient = createIsolatedAuthClient();
  if (!isolatedClient) {
    throw new AppError('AUTH_UNAUTHORIZED', 'Cliente de Supabase no disponible.', false);
  }

  const { data: signUpData, error: signUpError } = await isolatedClient.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: cleanName,
        role: input.role,
        assigned_level: input.assigned_level
      }
    }
  });

  if (signUpError || !signUpData.user) {
    throw normalizeError(signUpError, 'No se pudo registrar la nueva cuenta de usuario.');
  }

  // Asegurar rol y nivel en public.profiles
  const { data: updatedProfile } = await supabase
    .from('profiles')
    .update({
      full_name: cleanName,
      role: input.role,
      assigned_level: input.assigned_level,
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', signUpData.user.id)
    .select('*')
    .single();

  const finalProfile: Profile = (updatedProfile as Profile) || {
    id: signUpData.user.id,
    email: cleanEmail,
    full_name: cleanName,
    role: input.role,
    assigned_level: input.assigned_level,
    is_active: true,
    created_at: new Date().toISOString()
  };

  return {
    profile: finalProfile,
    requiresEmailConfirmSQL: !signUpData.user.email_confirmed_at
  };
}

/**
 * Permite a un administrador cambiar el rol ('admin' | 'operator'), nivel ('ALL' | 'Primaria' | 'Secundaria'),
 * nombre o estado activo de un usuario.
 */
export async function updateAuthorizedUserProfile(
  adminProfile: Profile,
  targetUserId: string,
  updates: {
    role?: UserRole;
    assigned_level?: UserEducationLevelScope;
    is_active?: boolean;
    full_name?: string;
  }
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

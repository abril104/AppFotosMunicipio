import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Lock,
  AlertTriangle,
  RefreshCw,
  UserPlus,
  GraduationCap
} from 'lucide-react';
import type {
  Profile,
  UserEducationLevelScope,
  UserRole
} from '../types/database.ts';
import {
  createAuthorizedUserAccount,
  listAuthorizedProfiles,
  updateAuthorizedUserProfile
} from '../services/authService.ts';
import { normalizeError } from '../utils/errorHandler.ts';
import { useToast } from '../components/ui/ToastProvider.tsx';

interface UsersManagementPageProps {
  currentProfile: Profile;
}

export const UsersManagementPage: React.FC<UsersManagementPageProps> = ({
  currentProfile
}) => {
  const { showToast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Estado del formulario para crear una nueva cuenta de usuario con rol y nivel
  const [newFullName, setNewFullName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newRole, setNewRole] = useState<UserRole>('operator');
  const [newLevel, setNewLevel] = useState<UserEducationLevelScope>('Secundaria');
  const [creating, setCreating] = useState<boolean>(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const list = await listAuthorizedProfiles(currentProfile);
      setProfiles(list);
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'Error al cargar usuarios', normalized.userMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentProfile.role === 'admin') {
      void loadProfiles();
    }
  }, [currentProfile.id, currentProfile.role]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setPendingConfirmEmail(null);

    try {
      const result = await createAuthorizedUserAccount(currentProfile, {
        email: newEmail,
        password: newPassword,
        full_name: newFullName,
        role: newRole,
        assigned_level: newLevel
      });

      setProfiles((prev) => [...prev, result.profile]);
      setNewFullName('');
      setNewEmail('');
      setNewPassword('');

      if (result.requiresEmailConfirmSQL) {
        setPendingConfirmEmail(result.profile.email);
        showToast(
          'info',
          'Cuenta creada (requiere activar migración 005)',
          `Se registró ${result.profile.email}. Ejecute la migración 005 en Supabase para confirmar correos automáticamente.`
        );
      } else {
        showToast(
          'success',
          'Cuenta creada y activada',
          `El usuario ${result.profile.full_name} (${result.profile.email}) ya puede iniciar sesión con acceso a ${
            result.profile.assigned_level === 'ALL'
              ? 'Todos los niveles'
              : result.profile.assigned_level
          }.`
        );
      }
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'No se pudo crear la cuenta', normalized.userMessage);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRole = async (target: Profile, role: UserRole) => {
    if (target.role === role) return;
    setUpdatingId(target.id);
    try {
      const updated = await updateAuthorizedUserProfile(currentProfile, target.id, {
        role
      });
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast(
        'success',
        'Rol actualizado',
        `El usuario ${updated.full_name} ahora tiene el rol de ${
          updated.role === 'admin' ? 'Administrador' : 'Operador'
        }.`
      );
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'No se pudo cambiar el rol', normalized.userMessage);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleChangeLevel = async (
    target: Profile,
    assigned_level: UserEducationLevelScope
  ) => {
    if ((target.assigned_level || 'ALL') === assigned_level) return;
    setUpdatingId(target.id);
    try {
      const updated = await updateAuthorizedUserProfile(currentProfile, target.id, {
        assigned_level
      });
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === updated.id ? { ...updated, assigned_level } : p
        )
      );
      showToast(
        'success',
        'Nivel educativo actualizado',
        `${updated.full_name} ahora visualiza: ${
          assigned_level === 'ALL'
            ? 'Todos los niveles (Primaria y Secundaria)'
            : `Solo ${assigned_level}`
        }.`
      );
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'No se pudo cambiar el nivel', normalized.userMessage);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleActive = async (target: Profile) => {
    setUpdatingId(target.id);
    try {
      const updated = await updateAuthorizedUserProfile(currentProfile, target.id, {
        is_active: !target.is_active
      });
      setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      showToast(
        'success',
        updated.is_active ? 'Cuenta activada' : 'Cuenta suspendida',
        `El acceso de ${updated.full_name} ha sido ${
          updated.is_active ? 'habilitado' : 'desactivado'
        }.`
      );
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'No se pudo actualizar el estado', normalized.userMessage);
    } finally {
      setUpdatingId(null);
    }
  };

  if (currentProfile.role !== 'admin') {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center max-w-lg mx-auto my-8">
        <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Acceso exclusivo para Administradores</h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          No cuenta con permisos para administrar usuarios autorizados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Gestión de Cuentas, Roles y Niveles Educativos
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Cree cuentas para operadores o coordinadores y asigne si pertenecen a Primaria, Secundaria o toda la institución
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadProfiles()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar lista</span>
        </button>
      </div>

      {/* 1. FORMULARIO PARA CREAR NUEVA CUENTA CON ROL Y NIVEL (PRIMARIA / SECUNDARIA / TODOS) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-900 text-white flex items-center gap-2.5">
          <UserPlus className="w-5 h-5 text-sky-400" />
          <div>
            <h3 className="text-sm sm:text-base font-bold">
              Crear Nueva Cuenta de Usuario
            </h3>
            <p className="text-xs text-slate-300">
              Si asigna "Solo Primaria" o "Solo Secundaria", el usuario verá exclusivamente las secciones y estudiantes de ese nivel
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateUser} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre o Cargo *
              </label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Ej. Coordinación Primaria"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Correo electrónico *
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="primaria@colegio.edu.pe"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contraseña (mín. 6 caracteres) *
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Primaria2026!"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Rol en el sistema *
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 font-semibold"
              >
                <option value="operator">Operador (Cámara y Exportar)</option>
                <option value="admin">Administrador (Control Total)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nivel Educativo Asignado *
              </label>
              <select
                value={newLevel}
                onChange={(e) =>
                  setNewLevel(e.target.value as UserEducationLevelScope)
                }
                className="w-full px-3 py-2 text-sm border border-sky-300 rounded-xl bg-sky-50 text-sky-950 font-bold"
              >
                <option value="Primaria">Solo Primaria (1ro a 6to)</option>
                <option value="Secundaria">Solo Secundaria (1ro a 5to)</option>
                <option value="ALL">Todos los niveles (General)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-sky-600 shrink-0" />
              <span>
                El nivel elegido filtra automáticamente el Panel Principal, Padrón, Cámara y Exportación ZIP para ese usuario.
              </span>
            </p>

            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{creating ? 'Creando cuenta...' : 'Crear cuenta de usuario'}</span>
            </button>
          </div>

          {pendingConfirmEmail && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <p className="font-bold">
                Para que las cuentas creadas desde aquí queden activadas sin pedir confirmación por correo:
              </p>
              <p>
                Copie y ejecute el archivo{' '}
                <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
                  supabase/migrations/005_user_creation_and_level_scope.sql
                </code>{' '}
                en el SQL Editor de Supabase, o ejecute:{' '}
                <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
                  UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = '{pendingConfirmEmail}';
                </code>
              </p>
            </div>
          )}
        </form>
      </div>

      {/* 2. TABLA DE USUARIOS AUTORIZADOS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">
            Perfiles Registrados en la Institución
          </h3>
          <p className="text-xs text-slate-500">
            Modifique el Rol o el Nivel Educativo (Primaria / Secundaria / Todos) de cualquier usuario
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Nombre del Personal</th>
                <th className="py-3 px-4">Correo Electrónico</th>
                <th className="py-3 px-4">Nivel Asignado</th>
                <th className="py-3 px-4">Rol Asignado</th>
                <th className="py-3 px-4">Estado de Acceso</th>
                <th className="py-3 px-4 text-right">Acciones de Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {profiles.map((user) => {
                const isSelf = user.id === currentProfile.id;
                const currentLevel = user.assigned_level || 'ALL';

                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {user.full_name}
                      {isSelf && (
                        <span className="ml-2 px-2 py-0.5 text-[10px] rounded bg-slate-200 text-slate-700 font-bold">
                          Sesión actual
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{user.email}</td>
                    <td className="py-3.5 px-4">
                      <select
                        value={currentLevel}
                        disabled={updatingId === user.id}
                        onChange={(e) =>
                          void handleChangeLevel(
                            user,
                            e.target.value as UserEducationLevelScope
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-sky-300 bg-sky-50 text-xs font-bold text-sky-900 disabled:opacity-50"
                      >
                        <option value="ALL">Todos los niveles</option>
                        <option value="Primaria">Solo Primaria</option>
                        <option value="Secundaria">Solo Secundaria</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={user.role}
                        disabled={isSelf || updatingId === user.id}
                        onChange={(e) =>
                          void handleToggleRole(user, e.target.value as UserRole)
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 disabled:opacity-50"
                      >
                        <option value="admin">Administrador</option>
                        <option value="operator">Operador Fotográfico</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4">
                      {user.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          Autorizado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                          <UserX className="w-3.5 h-3.5 text-rose-600" />
                          Suspendido
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        disabled={isSelf || updatingId === user.id}
                        onClick={() => void handleToggleActive(user)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          user.is_active
                            ? 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        {user.is_active ? 'Suspender acceso' : 'Reactivar acceso'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen de Seguridad */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
        <div className="flex items-center gap-2 text-slate-900">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm sm:text-base font-bold">
            Aislamiento por Nivel Educativo y Protección de Datos
          </h3>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed flex items-start gap-2">
          <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            Cuando un usuario tiene asignado el nivel <strong>Solo Primaria</strong> o <strong>Solo Secundaria</strong>, la aplicación restringe automáticamente su Panel Principal, la lista de estudiantes, la cámara, la importación y la exportación ZIP exclusivamente a las secciones de su nivel educativo.
          </span>
        </p>
      </div>
    </div>
  );
};

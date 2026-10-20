import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  UserCheck,
  UserX,
  Lock,
  KeyRound,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import type { Profile, UserRole } from '../types/database.ts';
import {
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

  const handleToggleRole = async (target: Profile, newRole: UserRole) => {
    if (target.role === newRole) return;
    setUpdatingId(target.id);
    try {
      const updated = await updateAuthorizedUserProfile(currentProfile, target.id, {
        role: newRole
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
            Gestión de Usuarios Autorizados y Seguridad de Datos
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Control de roles (Administrador / Operador), activación de cuentas y políticas de protección de datos de menores
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

      {/* Tabla de usuarios autorizados */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-900">
            Perfiles Registrados en la Institución
          </h3>
          <p className="text-xs text-slate-500">
            Asigne permisos de Administrador (importación, eliminación, usuarios) u Operador (cámara, consulta, exportación)
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Nombre del Personal</th>
                <th className="py-3 px-4">Correo Electrónico</th>
                <th className="py-3 px-4">Rol Asignado</th>
                <th className="py-3 px-4">Estado de Acceso</th>
                <th className="py-3 px-4 text-right">Acciones de Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {profiles.map((user) => {
                const isSelf = user.id === currentProfile.id;
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

      {/* Guía de alta segura de usuarios y arquitectura de seguridad */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-slate-900">
            <KeyRound className="w-5 h-5 text-sky-600" />
            <h3 className="text-sm sm:text-base font-bold">
              ¿Cómo dar de alta un nuevo Operador o Administrador?
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Para evitar exponer la clave secreta <code className="font-mono">service_role</code> en el navegador y mantener deshabilitado el registro público:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-700">
            <li>
              Ingrese al panel de su proyecto en <strong>Supabase Dashboard → Authentication → Users</strong>.
            </li>
            <li>
              Haga clic en <strong>"Add user" → "Create new user"</strong> con su correo institucional y contraseña segura.
            </li>
            <li>
              El disparador automático <code className="font-mono">on_auth_user_created</code> creará su perfil inmediatamente en esta tabla con rol <strong>Operador</strong>.
            </li>
            <li>
              Desde esta misma pantalla usted puede cambiar su rol a <strong>Administrador</strong> o suspender su acceso en cualquier momento.
            </li>
          </ol>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm sm:text-base font-bold">
              Medidas Activas de Protección de Datos de Menores
            </h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-700">
            <li className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Bucket Privado (<code className="font-mono">student-photos</code>):</strong> Ninguna fotografía tiene URL pública. La visualización utiliza URLs firmadas temporales de 5 minutos.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Row Level Security (RLS):</strong> Políticas estrictas en PostgreSQL y Storage que validan rol activo en cada lectura, carga, reemplazo o eliminación.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Procesamiento 100% Local en Navegador:</strong> No se envían fotografías a servicios externos ni motores de IA. Las contraseñas jamás se almacenan en tablas de la aplicación.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

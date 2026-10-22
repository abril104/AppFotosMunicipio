import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileSpreadsheet,
  FolderArchive,
  ShieldCheck,
  LogOut,
  Camera,
  Wifi,
  WifiOff,
  AlertTriangle
} from 'lucide-react';
import type { Profile } from '../../types/database.ts';
import { IS_SUPABASE_CONFIGURED, SUPABASE_SECURITY_WARNING } from '../../services/supabaseClient.ts';
import { getUserEffectiveLevelScope } from '../../utils/academicFilter.ts';
import { cn } from '../../utils/cn.ts';

interface AppLayoutProps {
  profile: Profile;
  isDemoMode: boolean;
  onSignOut: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  profile,
  isDemoMode,
  onSignOut,
  children
}) => {
  const [isOnline, setIsOnline] = React.useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  React.useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const userLevelScope = getUserEffectiveLevelScope(profile);
  const levelBadgeLabel =
    userLevelScope === 'ALL' ? 'Primaria y Secundaria' : `Nivel ${userLevelScope}`;

  const navItems = [
    {
      to: '/',
      label: 'Panel Principal',
      icon: LayoutDashboard,
      roles: ['admin', 'operator']
    },
    {
      to: '/estudiantes',
      label: 'Padrón y Cámara',
      icon: Camera,
      roles: ['admin', 'operator']
    },
    {
      to: '/importar',
      label: 'Importar Excel',
      icon: FileSpreadsheet,
      roles: ['admin']
    },
    {
      to: '/exportar',
      label: 'Exportar Fotos ZIP',
      icon: FolderArchive,
      roles: ['admin', 'operator']
    },
    {
      to: '/usuarios',
      label: 'Usuarios y Seguridad',
      icon: ShieldCheck,
      roles: ['admin']
    }
  ].filter((item) => item.roles.includes(profile.role));

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 text-slate-900">
      {/* Menú lateral fijo en pantallas grandes (Laptop / Escritorio) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-68 lg:fixed lg:inset-y-0 bg-slate-900 text-white border-r border-slate-800 z-30">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
              Registro Fotográfico
            </h1>
            <p className="text-[11px] text-slate-400">Sistema Escolar Institucional</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Información de sesión y estado de red en barra lateral */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Conectado</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300 font-semibold">Sin Internet</span>
                </>
              )}
            </span>
            <span
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                profile.role === 'admin'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              )}
            >
              {profile.role === 'admin' ? 'Administrador' : 'Operador'}
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">{profile.full_name}</p>
            <p className="text-[11px] text-sky-300 font-medium truncate">{levelBadgeLabel}</p>
            <p className="text-[11px] text-slate-400 truncate">{profile.email}</p>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-600/90 text-slate-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Contenedor principal */}
      <div className="flex-1 lg:pl-68 flex flex-col min-h-screen pb-16 lg:pb-0">
        {/* Encabezado compacto en dispositivos móviles y tablets */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900 text-white shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-bold block leading-none">Registro Fotográfico</span>
              <span className="text-[10px] text-slate-300">
                {levelBadgeLabel} • {profile.full_name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold">
                <WifiOff className="w-3 h-3" /> Offline
              </span>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Avisos de estado de configuración de Supabase o Seguridad */}
        {SUPABASE_SECURITY_WARNING && (
          <div className="bg-rose-600 text-white px-4 py-3 text-xs sm:text-sm font-medium flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{SUPABASE_SECURITY_WARNING}</span>
          </div>
        )}

        {(isDemoMode || !IS_SUPABASE_CONFIGURED) && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-8 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Entorno Local de Demostración:</strong> Las variables{' '}
                <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> y{' '}
                <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code>{' '}
                aún no están conectadas en <code className="font-mono">.env</code>. Se muestran datos ficticios en memoria.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-amber-800">
              Consulte el archivo README.md para conectar Supabase Cloud
            </span>
          </div>
        )}

        {/* Contenido de la vista activa */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        {/* Barra de navegación inferior compacta para celulares y tablets */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 flex items-center justify-around py-1.5 px-2 shadow-lg">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center py-1 px-2 rounded-lg text-[11px] font-medium transition-colors min-w-[60px]',
                    isActive ? 'text-sky-600 font-semibold' : 'text-slate-500 hover:text-slate-900'
                  )
                }
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="truncate max-w-[76px]">{item.label.split(' ')[0]}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

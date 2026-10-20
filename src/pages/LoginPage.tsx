import React, { useState } from 'react';
import { Camera, Lock, Mail, AlertCircle, ShieldCheck, Info } from 'lucide-react';
import { IS_SUPABASE_CONFIGURED } from '../services/supabaseClient.ts';
import { signInWithEmailPassword } from '../services/authService.ts';
import { normalizeError } from '../utils/errorHandler.ts';
import type { Profile } from '../types/database.ts';

interface LoginPageProps {
  onLoginSuccess: (profile: Profile, isDemoMode: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const result = await signInWithEmailPassword(email, password);
      if (result.profile) {
        onLoginSuccess(result.profile, result.isDemoMode);
      }
    } catch (err) {
      const normalized = normalizeError(err);
      setErrorMessage(normalized.userMessage);
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (role: 'admin' | 'operator') => {
    if (role === 'admin') {
      setEmail('admin.demo@institucion.edu.pe');
      setPassword('DemoAdmin2026!');
    } else {
      setEmail('operador.demo@institucion.edu.pe');
      setPassword('DemoOperador2026!');
    }
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 bg-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Cabecera institucional */}
        <div className="bg-slate-900 text-white px-6 py-7 text-center">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 mx-auto mb-3">
            <Camera className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">
            Sistema de Registro Fotográfico Escolar
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Acceso exclusivo para personal autorizado de la institución educativa
          </p>
        </div>

        {/* Formulario de inicio de sesión */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Correo electrónico institucional
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@institucion.edu.pe"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold text-sm shadow-xs transition-colors cursor-pointer"
          >
            {loading ? 'Verificando credenciales...' : 'Iniciar sesión'}
          </button>

          {/* Aviso de seguridad: Sin registro público */}
          <div className="pt-3 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              El registro público de cuentas está deshabilitado por seguridad. Las cuentas de operadores son habilitadas únicamente por el administrador institucional.
            </span>
          </div>

          {/* Selector rápido en modo demostración local cuando aún no se configura .env */}
          {!IS_SUPABASE_CONFIGURED && (
            <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-amber-900">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Modo de evaluación local (Sin .env conectado)</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Seleccione un rol de prueba para inspeccionar el flujo completo (padrón ficticio, cámara, validación Excel y exportación ZIP):
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fillDemoAccount('admin')}
                  className="py-1.5 px-2.5 text-xs font-semibold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg cursor-pointer"
                >
                  Probar como Admin
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount('operator')}
                  className="py-1.5 px-2.5 text-xs font-semibold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg cursor-pointer"
                >
                  Probar como Operador
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import type { VisualProcessState } from '../../types/domain.ts';
import { cn } from '../../utils/cn.ts';

interface StatusBadgeProps {
  state: VisualProcessState;
  labelOverride?: string;
  size?: 'sm' | 'md';
}

/**
 * Indicador visual institucional claro para los 4 estados clave del sistema:
 * - pendiente
 * - guardada
 * - procesando
 * - error
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  state,
  labelOverride,
  size = 'md'
}) => {
  const styles: Record<VisualProcessState, string> = {
    pendiente: 'bg-amber-50 text-amber-800 border-amber-200',
    guardada: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    procesando: 'bg-sky-50 text-sky-800 border-sky-200',
    error: 'bg-rose-50 text-rose-800 border-rose-200'
  };

  const defaultLabels: Record<VisualProcessState, string> = {
    pendiente: 'Pendiente',
    guardada: 'Guardada',
    procesando: 'Procesando...',
    error: 'Error'
  };

  const icons: Record<VisualProcessState, React.ReactNode> = {
    pendiente: <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />,
    guardada: <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />,
    procesando: <Loader2 className="w-3.5 h-3.5 shrink-0 text-sky-600 animate-spin" />,
    error: <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border rounded-full',
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-xs sm:text-sm',
        styles[state]
      )}
    >
      {icons[state]}
      <span>{labelOverride || defaultLabels[state]}</span>
    </span>
  );
};

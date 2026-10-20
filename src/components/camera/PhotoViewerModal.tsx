import React, { useEffect, useState } from 'react';
import { X, Camera, Loader2, ShieldCheck } from 'lucide-react';
import type { Student } from '../../types/database.ts';
import { getAuthorizedPhotoSignedUrl } from '../../services/storageService.ts';
import { StatusBadge } from '../ui/Badge.tsx';

interface PhotoViewerModalProps {
  student: Student | null;
  onClose: () => void;
  onReplaceRequest: (student: Student) => void;
}

/**
 * Modal para visualizar de forma autorizada la fotografía registrada de una estudiante
 * mediante una URL firmada temporal del bucket privado.
 */
export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({
  student,
  onClose,
  onReplaceRequest
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (!student?.photo_path) {
      setSignedUrl(null);
      return;
    }
    setLoading(true);
    getAuthorizedPhotoSignedUrl(student.photo_path, true)
      .then((url) => {
        if (active) {
          setSignedUrl(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setSignedUrl(null);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [student]);

  if (!student) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">{student.full_name}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              DNI: {student.dni} • {student.grade} "{student.section}"
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
            aria-label="Cerrar vista de fotografía"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center bg-slate-50">
          <div className="w-64 h-80 bg-slate-900 rounded-xl overflow-hidden border border-slate-200 shadow-md flex items-center justify-center">
            {loading ? (
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
            ) : signedUrl ? (
              <img
                src={signedUrl}
                alt={`Fotografía de ${student.full_name}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <p className="text-xs text-slate-300 text-center px-4">
                Fotografía registrada en el bucket privado ({student.dni}.jpg).
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600">
            <StatusBadge state="guardada" size="sm" />
            <span className="inline-flex items-center gap-1 text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Acceso privado con URL firmada temporal
            </span>
          </div>

          {student.photo_updated_at && (
            <p className="mt-2 text-[11px] text-slate-400">
              Última actualización: {new Date(student.photo_updated_at).toLocaleString('es-PE')}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 bg-white border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onReplaceRequest(student);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            <Camera className="w-4 h-4" />
            <span>Repetir o reemplazar fotografía</span>
          </button>
        </div>
      </div>
    </div>
  );
};

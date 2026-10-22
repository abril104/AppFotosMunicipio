import React, { useEffect, useState } from 'react';
import { User, Loader2 } from 'lucide-react';
import { getAuthorizedPhotoSignedUrl } from '../../services/storageService.ts';
import { cn } from '../../utils/cn.ts';

interface StudentAvatarProps {
  photoPath: string | null;
  fullName: string;
  updatedAt?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
}

/**
 * Muestra la miniatura de la fotografía de la estudiante recuperándola mediante
 * una URL firmada temporal desde el bucket privado de Supabase Storage.
 */
export const StudentAvatar: React.FC<StudentAvatarProps> = ({
  photoPath,
  fullName,
  updatedAt,
  size = 'md',
  onClick
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    if (!photoPath) {
      setSignedUrl(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getAuthorizedPhotoSignedUrl(photoPath, Boolean(updatedAt))
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
  }, [photoPath, updatedAt]);

  const sizeClasses = {
    sm: 'w-10 h-10 rounded-lg',
    md: 'w-12 h-14 rounded-lg',
    lg: 'w-20 h-24 rounded-xl',
    xl: 'w-40 h-48 rounded-xl'
  }[size];

  if (!photoPath) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-400 shrink-0',
          sizeClasses
        )}
        title="Sin fotografía registrada"
      >
        <User className="w-5 h-5" />
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-400 shrink-0',
          sizeClasses
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold text-center px-1 shrink-0',
          sizeClasses
        )}
        title="Fotografía guardada en el bucket privado"
      >
        JPG
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'relative overflow-hidden border border-slate-200 bg-slate-100 shrink-0 group focus:outline-none focus:ring-2 focus:ring-slate-900',
        sizeClasses,
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
      title={`Ver fotografía de ${fullName}`}
    >
      <img
        src={signedUrl}
        alt={`Fotografía de ${fullName}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    </button>
  );
};

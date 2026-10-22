import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Camera,
  Loader2,
  ShieldCheck,
  Crop,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Move,
  Undo2
} from 'lucide-react';
import type { Profile, Student } from '../../types/database.ts';
import {
  downloadAuthorizedPhotoBlob,
  getAuthorizedPhotoSignedUrl,
  uploadAndRegisterStudentPhoto
} from '../../services/storageService.ts';
import { normalizeError } from '../../utils/errorHandler.ts';
import { StatusBadge } from '../ui/Badge.tsx';
import { useToast } from '../ui/ToastProvider.tsx';

interface PhotoViewerModalProps {
  student: Student | null;
  currentProfile: Profile;
  onClose: () => void;
  onReplaceRequest: (student: Student) => void;
  onPhotoUpdated: (updatedStudent: Student) => void;
}

const CROP_VIEWPORT_WIDTH = 240;
const CROP_VIEWPORT_HEIGHT = 320; // Proporción carnet 3:4 exacta

/**
 * Modal para visualizar de forma autorizada la fotografía registrada de una estudiante,
 * permitiendo además recortarla interactivamente (zoom, encuadre arrastrable y rotación)
 * y guardarla directamente en la nube.
 */
export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({
  student,
  currentProfile,
  onClose,
  onReplaceRequest,
  onPhotoUpdated
}) => {
  const { showToast } = useToast();

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Estado del modo de recorte interactivo
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [savingCrop, setSavingCrop] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1.15);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [dragging, setDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number }>({
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0
  });
  const imageElementRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;

    setIsCropping(false);
    setZoom(1.15);
    setOffset({ x: 0, y: 0 });
    setRotation(0);

    if (!student?.photo_path) {
      setSignedUrl(null);
      setLocalBlobUrl(null);
      return;
    }

    setLoading(true);

    // Cargar tanto la URL firmada como el Blob local seguro (para permitir recorte en <canvas> sin bloqueo CORS)
    Promise.all([
      getAuthorizedPhotoSignedUrl(student.photo_path, true),
      downloadAuthorizedPhotoBlob(student.photo_path).catch(() => null)
    ])
      .then(([url, blob]) => {
        if (!active) return;
        setSignedUrl(url);
        if (blob) {
          createdObjectUrl = URL.createObjectURL(blob);
          setLocalBlobUrl(createdObjectUrl);
        } else {
          setLocalBlobUrl(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setSignedUrl(null);
          setLocalBlobUrl(null);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [student]);

  if (!student) return null;

  const activeImageSrc = localBlobUrl || signedUrl;

  const handleStartCropMode = () => {
    setZoom(1.15);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
    setIsCropping(true);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isCropping) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !isCropping) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    setOffset({
      x: dragStartRef.current.origX + dx,
      y: dragStartRef.current.origY + dy
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  /**
   * Genera la nueva imagen JPEG recortada según el encuadre 3:4, zoom, desplazamiento y rotación
   * que el usuario ajustó en pantalla, y la guarda en Supabase Storage.
   */
  const handleSaveCroppedPhoto = async () => {
    const imgEl = imageElementRef.current;
    if (!imgEl || !student) return;

    const naturalW = imgEl.naturalWidth || imgEl.width;
    const naturalH = imgEl.naturalHeight || imgEl.height;
    if (!naturalW || !naturalH) return;

    setSavingCrop(true);

    try {
      const outputWidth = 900;
      const outputHeight = 1200; // Proporción 3:4 de alta nitidez institucional
      const ratio = outputWidth / CROP_VIEWPORT_WIDTH;

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('No se pudo inicializar el lienzo de recorte.');
      }

      // Fondo blanco institucional
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outputWidth, outputHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Calcular escala base object-cover respecto al visor (240x320)
      const isRotated90 = rotation % 180 !== 0;
      const effW = isRotated90 ? naturalH : naturalW;
      const effH = isRotated90 ? naturalW : naturalH;
      const baseCoverScale = Math.max(
        CROP_VIEWPORT_WIDTH / effW,
        CROP_VIEWPORT_HEIGHT / effH
      );

      // Trasladar al centro del lienzo de salida + el desplazamiento aplicado por el usuario
      ctx.save();
      ctx.translate(
        outputWidth / 2 + offset.x * ratio,
        outputHeight / 2 + offset.y * ratio
      );
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(baseCoverScale * zoom * ratio, baseCoverScale * zoom * ratio);
      ctx.drawImage(imgEl, -naturalW / 2, -naturalH / 2, naturalW, naturalH);
      ctx.restore();

      const croppedBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (!b) {
              reject(new Error('No se pudo generar el archivo JPG recortado.'));
              return;
            }
            resolve(b);
          },
          'image/jpeg',
          0.92
        );
      });

      const updatedStudent = await uploadAndRegisterStudentPhoto(
        currentProfile,
        student,
        croppedBlob
      );

      // Actualizar vista previa local inmediatamente con el nuevo recorte
      const newUrl = URL.createObjectURL(croppedBlob);
      setLocalBlobUrl(newUrl);
      setSignedUrl(newUrl);
      setIsCropping(false);

      onPhotoUpdated(updatedStudent);
      showToast(
        'success',
        'Fotografía recortada y guardada',
        `Se guardó el nuevo encuadre de ${updatedStudent.full_name} (${updatedStudent.dni}.jpg).`
      );
    } catch (err) {
      const normalized = normalizeError(
        err,
        'No se pudo guardar el recorte de la fotografía.'
      );
      showToast('error', 'Error al guardar el recorte', normalized.userMessage);
    } finally {
      setSavingCrop(false);
    }
  };

  // Calcular dimensiones base para mostrar la imagen en el visor interactivo
  const getInteractiveImageStyle = (): React.CSSProperties => {
    return {
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg) scale(${zoom})`,
      transformOrigin: 'center center',
      transition: dragging ? 'none' : 'transform 120ms ease-out'
    };
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-auto">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-900 text-white">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm sm:text-base font-bold truncate">
              {student.full_name}
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              DNI: {student.dni} • {student.education_level || 'Secundaria'} {student.grade} "{student.section}"
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={savingCrop}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg bg-slate-800"
            aria-label="Cerrar vista de fotografía"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visor de fotografía o editor de recorte 3:4 */}
        <div className="p-4 flex flex-col items-center bg-slate-50">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              width: `${CROP_VIEWPORT_WIDTH}px`,
              height: `${CROP_VIEWPORT_HEIGHT}px`
            }}
            className={`relative bg-slate-900 rounded-xl overflow-hidden border-2 shadow-md flex items-center justify-center select-none ${
              isCropping
                ? 'border-sky-500 cursor-grab active:cursor-grabbing touch-none'
                : 'border-slate-200'
            }`}
          >
            {loading ? (
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
            ) : activeImageSrc ? (
              <>
                <img
                  ref={imageElementRef}
                  src={activeImageSrc}
                  crossOrigin="anonymous"
                  alt={`Fotografía de ${student.full_name}`}
                  draggable={false}
                  style={isCropping ? getInteractiveImageStyle() : undefined}
                  className="w-full h-full object-cover pointer-events-none"
                />

                {/* Cuadrícula guía de recorte cuando está en modo Recortar */}
                {isCropping && (
                  <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-sky-400/90 rounded-lg flex flex-col justify-between p-2">
                    <span className="text-[10px] font-semibold bg-slate-900/80 text-sky-200 px-2 py-0.5 rounded self-center flex items-center gap-1">
                      <Move className="w-3 h-3" /> Arrastre para encuadrar
                    </span>
                    <div className="grid grid-cols-3 grid-rows-3 flex-1 opacity-30">
                      <div className="border-r border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-b border-white" />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-300 text-center px-4">
                Fotografía registrada en el bucket privado ({student.dni}.jpg).
              </p>
            )}
          </div>

          {/* Controles interactivos de Zoom y Rotación cuando está recortando */}
          {isCropping ? (
            <div className="w-full mt-3.5 p-3 rounded-xl bg-white border border-slate-200 space-y-2.5">
              <div className="flex items-center gap-2">
                <ZoomOut className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  type="range"
                  min={1}
                  max={2.6}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  aria-label="Nivel de acercamiento (Zoom)"
                  className="w-full accent-slate-900 cursor-pointer"
                />
                <ZoomIn className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-xs font-mono font-bold text-slate-700 w-11 text-right">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotar 90°</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setZoom(1.15);
                    setOffset({ x: 0, y: 0 });
                    setRotation(0);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Centrar</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600">
              <StatusBadge state="guardada" size="sm" />
              <span className="inline-flex items-center gap-1 text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Archivo {student.dni}.jpg
              </span>
            </div>
          )}
        </div>

        {/* Botones de acción inferiores */}
        <div className="px-4 py-3.5 bg-white border-t border-slate-100">
          {!isCropping ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleStartCropMode}
                disabled={loading || !activeImageSrc}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 rounded-xl shadow-xs cursor-pointer"
              >
                <Crop className="w-4 h-4" />
                <span>Recortar fotografía</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReplaceRequest(student);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Tomar / Subir otra</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsCropping(false)}
                disabled={savingCrop}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => void handleSaveCroppedPhoto()}
                disabled={savingCrop}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-xl shadow-sm cursor-pointer"
              >
                {savingCrop ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando recorte...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Guardar recorte</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

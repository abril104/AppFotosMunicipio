import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  RefreshCw,
  Check,
  X,
  Upload,
  ChevronLeft,
  ChevronRight,
  FlipHorizontal,
  AlertCircle,
  WifiOff,
  Loader2,
  Sliders
} from 'lucide-react';
import type { Profile, Student } from '../../types/database.ts';
import type { VisualProcessState } from '../../types/domain.ts';
import { DEFAULT_JPEG_QUALITY } from '../../services/supabaseClient.ts';
import {
  convertSourceToJpegBlob,
  processUploadedFileToJpeg
} from '../../utils/photoProcessor.ts';
import { uploadAndRegisterStudentPhoto } from '../../services/storageService.ts';
import { normalizeError } from '../../utils/errorHandler.ts';
import { StatusBadge } from '../ui/Badge.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { useToast } from '../ui/ToastProvider.tsx';

interface CameraCaptureModalProps {
  open: boolean;
  student: Student | null;
  studentsList: Student[];
  currentProfile: Profile;
  onClose: () => void;
  onSelectStudent: (student: Student) => void;
  onPhotoSaved: (updatedStudent: Student) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  open,
  student,
  studentsList,
  currentProfile,
  onClose,
  onSelectStudent,
  onPhotoSaved
}) => {
  const { showToast } = useToast();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [jpegQuality, setJpegQuality] = useState<number>(DEFAULT_JPEG_QUALITY || 0.9);

  // Estado de la fotografía capturada en memoria (no se pierde si falla la subida)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedDimensions, setCapturedDimensions] = useState<{ width: number; height: number } | null>(null);

  const [processState, setProcessState] = useState<VisualProcessState>('pendiente');
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Detectar cambios de conectividad en vivo
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * Detiene estrictamente todas las pistas de vídeo activas para liberar la cámara del dispositivo.
   */
  const stopCameraTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  /**
   * Inicializa la cámara integrada o seleccionada con navigator.mediaDevices.getUserMedia.
   */
  const startCamera = useCallback(async () => {
    stopCameraTracks();
    setCameraError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Su navegador no admite el acceso directo a la cámara (o la página no se abrió mediante HTTPS o localhost). Puede seleccionar una imagen desde su dispositivo.'
      );
      return;
    }

    try {
      const videoConstraints: MediaTrackConstraints = selectedDeviceId
        ? {
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 960 }
          }
        : {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 960 }
          };

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
        setCameraReady(true);
      }

      // Listar cámaras disponibles una vez concedido el permiso
      if (navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(cameras);
      }
    } catch (err) {
      const normalized = normalizeError(err);
      setCameraError(normalized.userMessage);
    }
  }, [facingMode, selectedDeviceId, stopCameraTracks]);

  // Al cambiar de estudiante o abrir el modal, reiniciar el estado de captura
  useEffect(() => {
    if (!open || !student) {
      stopCameraTracks();
      return;
    }

    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    setCapturedDimensions(null);
    setSaveErrorMsg(null);
    setProcessState(student.photo_status === 'completada' ? 'guardada' : 'pendiente');
    void startCamera();

    return () => {
      stopCameraTracks();
    };
  }, [open, student?.id, startCamera, stopCameraTracks]);

  if (!open || !student) return null;

  const currentIndex = studentsList.findIndex((s) => s.id === student.id);
  const prevStudent = currentIndex > 0 ? studentsList[currentIndex - 1] : null;
  const nextStudent =
    currentIndex >= 0 && currentIndex < studentsList.length - 1
      ? studentsList[currentIndex + 1]
      : null;

  const nextPendingStudent = studentsList.find(
    (s, idx) => idx > currentIndex && s.photo_status === 'pendiente'
  ) || studentsList.find((s) => s.id !== student.id && s.photo_status === 'pendiente') || null;

  const handleCaptureFromVideo = async () => {
    if (!videoRef.current || !cameraReady) return;
    setSaveErrorMsg(null);

    try {
      const videoEl = videoRef.current;
      const result = await convertSourceToJpegBlob(
        videoEl,
        videoEl.videoWidth || 1280,
        videoEl.videoHeight || 960,
        { quality: jpegQuality, maxDimension: 1440 }
      );

      setCapturedBlob(result.blob);
      setCapturedPreviewUrl(result.dataUrl);
      setCapturedDimensions({ width: result.width, height: result.height });
      // Detener temporalmente la vista previa de vídeo mientras revisa la foto capturada
      stopCameraTracks();
    } catch (err) {
      const normalized = normalizeError(err);
      setSaveErrorMsg(normalized.userMessage);
      setProcessState('error');
    }
  };

  const handleRetakePhoto = () => {
    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    setCapturedDimensions(null);
    setSaveErrorMsg(null);
    setProcessState(student.photo_status === 'completada' ? 'guardada' : 'pendiente');
    void startCamera();
  };

  const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSaveErrorMsg(null);

    try {
      const result = await processUploadedFileToJpeg(file, {
        quality: jpegQuality,
        maxDimension: 1440
      });
      stopCameraTracks();
      setCapturedBlob(result.blob);
      setCapturedPreviewUrl(result.dataUrl);
      setCapturedDimensions({ width: result.width, height: result.height });
    } catch (err) {
      const normalized = normalizeError(err);
      setSaveErrorMsg(normalized.userMessage);
      setProcessState('error');
    }
  };

  const executeSavePhoto = async () => {
    if (!capturedBlob || !student) return;

    setConfirmReplaceOpen(false);
    setProcessState('procesando');
    setSaveErrorMsg(null);

    try {
      const updated = await uploadAndRegisterStudentPhoto(
        currentProfile,
        student,
        capturedBlob
      );

      setProcessState('guardada');
      onPhotoSaved(updated);
      showToast(
        'success',
        'Fotografía guardada correctamente',
        `Se registró la fotografía JPG de ${updated.full_name} (DNI: ${updated.dni}).`
      );
    } catch (err) {
      const normalized = normalizeError(err);
      setProcessState('error');
      setSaveErrorMsg(normalized.userMessage);
      showToast('error', 'No se pudo guardar la fotografía', normalized.userMessage);
    }
  };

  const handleRequestSave = () => {
    if (!capturedBlob) return;
    if (student.photo_status === 'completada' && student.photo_path) {
      setConfirmReplaceOpen(true);
    } else {
      void executeSavePhoto();
    }
  };

  const handleSwitchFacingMode = () => {
    setSelectedDeviceId('');
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleCloseModal = () => {
    stopCameraTracks();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/75 p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Encabezado con datos de la estudiante y estado visual */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-slate-900 text-white">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-sky-300 font-medium uppercase tracking-wider">
              <span>{student.education_level || 'Secundaria'}</span>
              <span>•</span>
              <span>
                Grado {student.grade} - Sección {student.section}
              </span>
              {currentIndex >= 0 && (
                <>
                  <span>•</span>
                  <span>
                    Estudiante {currentIndex + 1} de {studentsList.length}
                  </span>
                </>
              )}
            </div>
            <h2
              id="camera-modal-title"
              className="text-base sm:text-lg font-bold truncate mt-0.5"
            >
              {student.full_name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 font-mono mt-0.5">
              DNI: <strong className="text-white">{student.dni}</strong> (Nombre de archivo: {student.dni}.jpg)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge state={processState} />
            <button
              type="button"
              onClick={handleCloseModal}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
              aria-label="Cerrar módulo de cámara"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerta de desconexión a Internet */}
        {!isOnline && (
          <div className="flex items-center gap-2.5 px-6 py-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs sm:text-sm">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Sin conexión a Internet:</strong> Puede capturar la fotografía ahora; se mantendrá segura en pantalla para reintentar el guardado en la nube apenas vuelva la red.
            </span>
          </div>
        )}

        {/* Cuerpo principal del módulo de cámara */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 sm:p-6">
          {/* Visor de cámara o imagen capturada */}
          <div className="lg:col-span-7 flex flex-col items-center">
            <div className="relative w-full aspect-4/3 bg-slate-950 rounded-xl overflow-hidden border border-slate-300 flex items-center justify-center shadow-inner">
              {!capturedPreviewUrl ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />

                  {/* Guía visual de encuadre tipo carnet escolar */}
                  {cameraReady && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="w-48 h-60 sm:w-56 sm:h-72 border-2 border-dashed border-sky-400/70 rounded-2xl flex flex-col justify-between p-2">
                        <span className="text-[10px] font-medium text-sky-200 bg-slate-900/60 px-2 py-0.5 rounded self-center">
                          Encuadre sugerido
                        </span>
                      </div>
                    </div>
                  )}

                  {!cameraReady && !cameraError && (
                    <div className="flex flex-col items-center gap-2 text-slate-300 p-6 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
                      <p className="text-sm">Iniciando cámara del dispositivo...</p>
                    </div>
                  )}

                  {cameraError && (
                    <div className="flex flex-col items-center gap-3 text-center p-6 max-w-md">
                      <div className="p-3 rounded-full bg-rose-500/20 text-rose-300">
                        <AlertCircle className="w-7 h-7" />
                      </div>
                      <p className="text-sm text-slate-200 leading-relaxed">{cameraError}</p>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => void startCamera()}
                          className="px-3.5 py-2 text-xs font-semibold bg-white text-slate-900 rounded-lg hover:bg-slate-100"
                        >
                          Reintentar cámara
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3.5 py-2 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-500"
                        >
                          Seleccionar imagen del equipo
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
                  <img
                    src={capturedPreviewUrl}
                    alt={`Captura previa de ${student.full_name}`}
                    className="max-w-full max-h-full object-contain"
                  />
                  <span className="absolute top-3 left-3 bg-slate-900/80 text-white text-xs px-2.5 py-1 rounded-md font-medium">
                    Vista previa JPEG ({capturedDimensions?.width}×{capturedDimensions?.height}px •{' '}
                    {capturedBlob ? `${Math.round(capturedBlob.size / 1024)} KB` : ''})
                  </span>
                </div>
              )}
            </div>

            {/* Controles secundarios de dispositivo de cámara y calidad JPEG */}
            <div className="w-full flex flex-wrap items-center justify-between gap-2 mt-3">
              <div className="flex items-center gap-2">
                {!capturedPreviewUrl && (
                  <>
                    <button
                      type="button"
                      onClick={handleSwitchFacingMode}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                      title="Alternar cámara frontal / trasera en celulares o tablets"
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" />
                      <span>Cámara {facingMode === 'user' ? 'Frontal' : 'Trasera'}</span>
                    </button>

                    {videoDevices.length > 1 && (
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        aria-label="Seleccionar dispositivo de cámara"
                        className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 max-w-[200px]"
                      >
                        <option value="">Automática ({facingMode})</option>
                        {videoDevices.map((dev, idx) => (
                          <option key={dev.deviceId || idx} value={dev.deviceId}>
                            {dev.label || `Cámara ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <label htmlFor="jpeg-quality-select">Calidad JPG:</label>
                <select
                  id="jpeg-quality-select"
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(Number(e.target.value))}
                  disabled={Boolean(capturedPreviewUrl)}
                  className="border border-slate-300 rounded-md px-2 py-1 bg-white text-slate-800 font-medium disabled:opacity-50"
                >
                  <option value={0.95}>Alta (0.95)</option>
                  <option value={0.9}>Estándar Institucional (0.90)</option>
                  <option value={0.82}>Optimizada (0.82)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Panel lateral derecho: Botones grandes de acción y verificación de identidad */}
          <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5">
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Verificación de identidad antes de guardar
                </span>
                <p className="text-sm font-bold text-slate-900 mt-1">{student.full_name}</p>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-500 block">DNI (Archivo JPG):</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {student.dni}.jpg
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Grado y Sección:</span>
                    <span className="font-semibold text-slate-900 text-sm">
                      {student.grade} "{student.section}"
                    </span>
                  </div>
                </div>
              </div>

              {saveErrorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs leading-relaxed flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Error en la operación</p>
                    <p className="mt-0.5">{saveErrorMsg}</p>
                  </div>
                </div>
              )}

              {/* Botones grandes para las acciones principales de cámara */}
              {!capturedPreviewUrl ? (
                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleCaptureFromVideo()}
                    disabled={!cameraReady || processState === 'procesando'}
                    className="w-full py-4 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-base shadow-md flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Camera className="w-6 h-6" />
                    <span>Capturar fotografía</span>
                  </button>

                  <div className="relative flex py-1 items-center">
                    <div className="grow border-t border-slate-200" />
                    <span className="shrink mx-3 text-xs text-slate-400">o alternativa local</span>
                    <div className="grow border-t border-slate-200" />
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileUploadChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={processState === 'procesando'}
                    className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Seleccionar imagen desde el dispositivo</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {processState !== 'guardada' ? (
                    <>
                      <button
                        type="button"
                        onClick={handleRequestSave}
                        disabled={processState === 'procesando'}
                        className="w-full py-4 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-base shadow-md flex items-center justify-center gap-3 transition-colors cursor-pointer"
                      >
                        {processState === 'procesando' ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Subiendo a la nube...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-6 h-6" />
                            <span>
                              {saveErrorMsg ? 'Reintentar guardado' : 'Guardar fotografía'}
                            </span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleRetakePhoto}
                        disabled={processState === 'procesando'}
                        className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Repetir toma</span>
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-medium flex items-center gap-2.5">
                        <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>
                          Fotografía confirmada y almacenada en el bucket privado como{' '}
                          <strong>{student.dni}.jpg</strong>.
                        </span>
                      </div>

                      {nextPendingStudent && (
                        <button
                          type="button"
                          onClick={() => onSelectStudent(nextPendingStudent)}
                          className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                        >
                          <span>Continuar con siguiente pendiente</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleRetakePhoto}
                        className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Tomar otra fotografía para reemplazar</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Navegación continua entre estudiantes sin regresar a la lista general */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 block mb-2">
                Navegación rápida en la sección actual:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => prevStudent && onSelectStudent(prevStudent)}
                  disabled={!prevStudent || processState === 'procesando'}
                  className="py-2.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>
                <button
                  type="button"
                  onClick={() => nextStudent && onSelectStudent(nextStudent)}
                  disabled={!nextStudent || processState === 'procesando'}
                  className="py-2.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmación antes de reemplazar una fotografía existente */}
      <ConfirmDialog
        open={confirmReplaceOpen}
        title="¿Reemplazar fotografía existente?"
        description={`La estudiante ${student.full_name} (DNI: ${student.dni}) ya cuenta con una fotografía guardada en la nube. Al confirmar, se actualizará por la nueva captura sin perder datos en caso de fallo de red.`}
        confirmLabel="Sí, reemplazar fotografía"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={() => void executeSavePhoto()}
        onCancel={() => setConfirmReplaceOpen(false)}
      />
    </div>
  );
};

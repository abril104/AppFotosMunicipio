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
  computeGuideCropFromVideoElement,
  convertSourceToJpegBlob,
  processUploadedFileToJpeg
} from '../../utils/photoProcessor.ts';
import { uploadAndRegisterStudentPhoto } from '../../services/storageService.ts';
import { normalizeError } from '../../utils/errorHandler.ts';
import { StatusBadge } from '../ui/Badge.tsx';
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
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraReady, setCameraReady] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [jpegQuality, setJpegQuality] = useState<number>(DEFAULT_JPEG_QUALITY || 0.9);

  // Estado de la fotografía capturada o seleccionada desde galería en memoria
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedDimensions, setCapturedDimensions] = useState<{ width: number; height: number } | null>(null);
  // Indica exclusivamente si la captura/imagen ACTUAL en pantalla ya se guardó en la nube
  const [isCurrentCaptureSaved, setIsCurrentCaptureSaved] = useState<boolean>(false);

  const [processState, setProcessState] = useState<VisualProcessState>('pendiente');
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
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
    setIsCurrentCaptureSaved(false);
    setSaveErrorMsg(null);
    setProcessState(
      student.photo_status === 'completada'
        ? 'guardada'
        : student.photo_status === 'retirada'
        ? 'retirada'
        : 'pendiente'
    );
    void startCamera();

    return () => {
      stopCameraTracks();
    };
  }, [open, student?.id, startCamera, stopCameraTracks]);

  if (!open || !student) return null;

  const isReplacementMode = student.photo_status === 'completada' && Boolean(student.photo_path);

  const currentIndex = studentsList.findIndex((s) => s.id === student.id);
  const prevStudent = currentIndex > 0 ? studentsList[currentIndex - 1] : null;
  const nextStudent =
    currentIndex >= 0 && currentIndex < studentsList.length - 1
      ? studentsList[currentIndex + 1]
      : null;

  const nextPendingStudent =
    studentsList.find((s, idx) => idx > currentIndex && s.photo_status === 'pendiente') ||
    studentsList.find((s) => s.id !== student.id && s.photo_status === 'pendiente') ||
    null;

  /**
   * Captura el fotograma actual y lo recorta exactamente según el recuadro de
   * "Encuadre sugerido" visible en la pantalla (proporción vertical 3:4).
   * Al capturar una nueva foto (incluso en modo reemplazo), habilita el botón "Guardar fotografía".
   */
  const handleCaptureFromVideo = async () => {
    if (!videoRef.current || !cameraReady) return;
    setSaveErrorMsg(null);

    try {
      const videoEl = videoRef.current;
      const cropRect = computeGuideCropFromVideoElement(videoEl, guideRef.current);

      const result = await convertSourceToJpegBlob(
        videoEl,
        videoEl.videoWidth || 1280,
        videoEl.videoHeight || 960,
        {
          quality: jpegQuality,
          maxDimension: 1200,
          cropRect,
          enforceCarnetAspect: true
        }
      );

      setCapturedBlob(result.blob);
      setCapturedPreviewUrl(result.dataUrl);
      setCapturedDimensions({ width: result.width, height: result.height });
      setIsCurrentCaptureSaved(false);
      setProcessState('pendiente');
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
    setIsCurrentCaptureSaved(false);
    setSaveErrorMsg(null);
    setProcessState(student.photo_status === 'completada' ? 'guardada' : 'pendiente');
    void startCamera();
  };

  /**
   * Procesa una imagen seleccionada desde la galería o archivos del dispositivo,
   * la recorta en proporción 3:4 y habilita inmediatamente el botón "Guardar fotografía".
   */
  const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setSaveErrorMsg(null);

    try {
      const result = await processUploadedFileToJpeg(file, {
        quality: jpegQuality,
        maxDimension: 1200,
        enforceCarnetAspect: true
      });
      stopCameraTracks();
      setCapturedBlob(result.blob);
      setCapturedPreviewUrl(result.dataUrl);
      setCapturedDimensions({ width: result.width, height: result.height });
      setIsCurrentCaptureSaved(false);
      setProcessState('pendiente');
    } catch (err) {
      const normalized = normalizeError(err);
      setSaveErrorMsg(normalized.userMessage);
      setProcessState('error');
    }
  };

  /**
   * Guarda la fotografía nueva o de reemplazo en Supabase Storage y actualiza PostgreSQL.
   */
  const executeSavePhoto = async () => {
    if (!capturedBlob || !student) return;

    setProcessState('procesando');
    setSaveErrorMsg(null);

    try {
      const updated = await uploadAndRegisterStudentPhoto(
        currentProfile,
        student,
        capturedBlob
      );

      setIsCurrentCaptureSaved(true);
      setProcessState('guardada');
      onPhotoSaved(updated);
      showToast(
        'success',
        isReplacementMode ? 'Fotografía reemplazada con éxito' : 'Fotografía guardada correctamente',
        `Se guardó la imagen JPG de ${updated.full_name} (${updated.dni}.jpg).`
      );
    } catch (err) {
      const normalized = normalizeError(err);
      setIsCurrentCaptureSaved(false);
      setProcessState('error');
      setSaveErrorMsg(normalized.userMessage);
      showToast('error', 'No se pudo guardar la fotografía', normalized.userMessage);
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
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/80 p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Barra superior compacta */}
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-900 text-white">
          <div className="flex items-center gap-2 text-xs text-sky-300 font-semibold">
            <span>{student.education_level || 'Secundaria'}</span>
            <span>•</span>
            <span>
              {student.grade} "{student.section}"
            </span>
            {currentIndex >= 0 && (
              <>
                <span>•</span>
                <span>
                  #{currentIndex + 1} de {studentsList.length}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge
              state={processState}
              labelOverride={
                capturedPreviewUrl && !isCurrentCaptureSaved && processState === 'pendiente'
                  ? 'Por guardar'
                  : undefined
              }
              size="sm"
            />
            <button
              type="button"
              onClick={handleCloseModal}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
              aria-label="Cerrar módulo de cámara"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Alerta de desconexión a Internet */}
        {!isOnline && (
          <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Sin Internet:</strong> La captura se mantendrá en pantalla para reintentar al recuperar red.
            </span>
          </div>
        )}

        <div className="p-3 sm:p-4 space-y-3">
          {/* Input oculto para subir foto desde galería o computadora (siempre montado en el DOM) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileUploadChange}
            className="hidden"
          />

          {/* 1. VENTANA DE LA CÁMARA CON RECORTE AL ENCUADRE SUGERIDO */}
          <div className="relative w-full h-[44vh] max-h-[360px] min-h-[250px] bg-slate-950 rounded-xl overflow-hidden border border-slate-300 flex items-center justify-center shadow-inner">
            {!capturedPreviewUrl ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="w-full h-full object-cover"
                />

                {/* Guía visual de encuadre 3:4 */}
                {cameraReady && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                    <div
                      ref={guideRef}
                      className="h-[84%] aspect-3/4 border-2 border-dashed border-sky-400 rounded-xl flex flex-col justify-between p-1.5 shadow-[0_0_0_9999px_rgba(2,6,23,0.52)]"
                    >
                      <span className="text-[10px] font-semibold text-sky-100 bg-slate-900/75 px-2 py-0.5 rounded self-center">
                        Área de recorte (3:4)
                      </span>
                    </div>
                  </div>
                )}

                {!cameraReady && !cameraError && (
                  <div className="flex flex-col items-center gap-2 text-slate-300 p-4 text-center">
                    <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
                    <p className="text-xs sm:text-sm">Iniciando cámara...</p>
                  </div>
                )}

                {cameraError && (
                  <div className="flex flex-col items-center gap-2.5 text-center p-4 max-w-sm">
                    <div className="p-2.5 rounded-full bg-rose-500/20 text-rose-300">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
                    <div className="flex flex-wrap justify-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => void startCamera()}
                        className="px-3 py-1.5 text-xs font-semibold bg-white text-slate-900 rounded-lg hover:bg-slate-100"
                      >
                        Reintentar cámara
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-500"
                      >
                        Subir desde galería / equipo
                      </button>
                    </div>
                  </div>
                )}

                {/* Botón flotante para girar cámara (Frontal / Trasera) */}
                {cameraReady && (
                  <button
                    type="button"
                    onClick={handleSwitchFacingMode}
                    className="absolute bottom-2.5 right-2.5 z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-slate-900/80 hover:bg-slate-900 border border-white/20 rounded-lg backdrop-blur-xs cursor-pointer"
                    title="Cambiar entre cámara frontal y trasera"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5 text-sky-400" />
                    <span>{facingMode === 'user' ? 'Frontal' : 'Trasera'}</span>
                  </button>
                )}
              </>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center bg-slate-950 p-2">
                <img
                  src={capturedPreviewUrl}
                  alt={`Fotografía recortada de ${student.full_name}`}
                  className="h-full aspect-3/4 object-cover rounded-lg border-2 border-emerald-400/80 shadow-lg"
                />
                <span className="absolute top-2.5 left-2.5 bg-slate-900/85 text-white text-[11px] px-2 py-0.5 rounded font-medium">
                  {isCurrentCaptureSaved ? 'Guardada en la nube' : 'Lista para guardar'} (
                  {capturedDimensions?.width}×{capturedDimensions?.height}px •{' '}
                  {capturedBlob ? `${Math.round(capturedBlob.size / 1024)} KB` : ''})
                </span>
              </div>
            )}
          </div>

          {/* 2. JUSTO DEBAJO DE LA CÁMARA: NOMBRE DE LA ESTUDIANTE + DNI */}
          <div className="bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2
                id="camera-modal-title"
                className="text-sm sm:text-base font-bold text-slate-900 truncate leading-snug"
              >
                {student.full_name}
              </h2>
              <p className="text-xs text-slate-600 font-mono">
                DNI: <strong className="text-slate-900">{student.dni}</strong> •{' '}
                <span>
                  {student.education_level || 'Secundaria'} - {student.grade} "{student.section}"
                </span>
              </p>
            </div>
            <span className="text-[11px] font-mono font-semibold px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 shrink-0">
              {student.dni}.jpg
            </span>
          </div>

          {/* Mensaje de error si falló el guardado */}
          {saveErrorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{saveErrorMsg}</span>
            </div>
          )}

          {/* 3. BOTÓN PRINCIPAL DE CAPTURA / GUARDADO INMEDIATAMENTE VISIBLE SIN SCROLL */}
          {!capturedPreviewUrl ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handleCaptureFromVideo()}
                disabled={!cameraReady || processState === 'procesando'}
                className="w-full py-3.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-base shadow-md flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                <Camera className="w-5 h-5" />
                <span>
                  {isReplacementMode ? 'Capturar nueva fotografía' : 'Capturar fotografía'}
                </span>
              </button>

              {/* Controles secundarios compactos en una sola fila */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={processState === 'procesando'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Subir foto de galería / PC</span>
                </button>

                {videoDevices.length > 1 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    aria-label="Seleccionar dispositivo de cámara"
                    className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-700 max-w-[160px]"
                  >
                    <option value="">Cámara auto ({facingMode})</option>
                    {videoDevices.map((dev, idx) => (
                      <option key={dev.deviceId || idx} value={dev.deviceId}>
                        {dev.label || `Cámara ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-1 text-xs text-slate-600 ml-auto">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    id="jpeg-quality-select"
                    value={jpegQuality}
                    onChange={(e) => setJpegQuality(Number(e.target.value))}
                    aria-label="Calidad JPG"
                    className="border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-800 font-medium"
                  >
                    <option value={0.95}>JPG 0.95</option>
                    <option value={0.9}>JPG 0.90</option>
                    <option value={0.82}>JPG 0.82</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {!isCurrentCaptureSaved ? (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <button
                    type="button"
                    onClick={() => void executeSavePhoto()}
                    disabled={processState === 'procesando'}
                    className="sm:col-span-8 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-base shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {processState === 'procesando' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Guardando en la nube...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        <span>
                          {saveErrorMsg
                            ? 'Reintentar guardado'
                            : isReplacementMode
                            ? 'Guardar y reemplazar foto'
                            : 'Guardar fotografía'}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRetakePhoto}
                    disabled={processState === 'procesando'}
                    className="sm:col-span-4 py-3 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Repetir / Otra</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    {nextPendingStudent ? (
                      <button
                        type="button"
                        onClick={() => onSelectStudent(nextPendingStudent)}
                        className="sm:col-span-8 py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                      >
                        <span>Siguiente estudiante pendiente</span>
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    ) : (
                      <div className="sm:col-span-8 py-2.5 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-center gap-1.5">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Guardada como {student.dni}.jpg</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleRetakePhoto}
                      className="sm:col-span-4 py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Otra toma</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. NAVEGACIÓN RÁPIDA ANTERIOR / SIGUIENTE COMPACTA */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => prevStudent && onSelectStudent(prevStudent)}
              disabled={!prevStudent || processState === 'procesando'}
              className="py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>
            <button
              type="button"
              onClick={() => nextStudent && onSelectStudent(nextStudent)}
              disabled={!nextStudent || processState === 'procesando'}
              className="py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import { AppError } from './errorHandler.ts';
import { isValidPeruvianDni } from './excelValidator.ts';
import type { Student } from '../types/database.ts';

/**
 * Construye una ruta determinista y segura dentro del bucket privado de Supabase Storage
 * utilizando el ID único de la estudiante y su DNI validado de 8 dígitos.
 *
 * Formato: padron/{studentId}/{dni}.jpg
 */
export function buildDeterministicPhotoPath(studentId: string, dni: string): string {
  const cleanId = String(studentId || '').trim();
  const cleanDni = String(dni || '').trim();

  if (!cleanId) {
    throw new AppError('VALIDATION_ERROR', 'El identificador interno de la estudiante es inválido.', false);
  }
  if (!isValidPeruvianDni(cleanDni)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'No se puede guardar la fotografía: el DNI de la estudiante debe tener exactamente 8 dígitos válidos.',
      false
    );
  }

  return `padron/${cleanId}/${cleanDni}.jpg`;
}

/**
 * Sanitiza un nombre de carpeta (grado o sección) para uso seguro dentro de un archivo ZIP,
 * evitando caracteres especiales o colisiones de nombres.
 */
export function sanitizeFolderToken(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'SinEspecificar';
}

/**
 * Construye la ruta exacta de cada fotografía dentro del archivo ZIP de exportación:
 *
 * Estructura obligatoria:
 * Fotografias_Estudiantes/
 *   Grado_Seccion/
 *     12345678.jpg
 *
 * El nombre del archivo JPG es EXCLUSIVAMENTE el DNI ({dni}.jpg), sin nombres ni otros datos personales.
 */
export function buildZipPhotoEntryPath(student: Pick<Student, 'dni' | 'grade' | 'section'>): string {
  const cleanDni = String(student.dni || '').trim();
  if (!isValidPeruvianDni(cleanDni)) {
    throw new AppError('EXPORT_ERROR', 'Registro con formato de DNI inválido durante la exportación.', false);
  }
  const gradeFolder = sanitizeFolderToken(student.grade);
  const sectionFolder = sanitizeFolderToken(student.section);
  return `Fotografias_Estudiantes/${gradeFolder}_${sectionFolder}/${cleanDni}.jpg`;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface JpegConversionOptions {
  quality?: number; // Entre 0.70 y 0.98, por defecto 0.90
  maxDimension?: number; // Por defecto 1200px de alto para formato carnet institucional nítido
  cropRect?: CropRect; // Región exacta del encuadre sugerido
  enforceCarnetAspect?: boolean; // Si es true (por defecto), recorta en proporción vertical 3:4
}

/**
 * Calcula el rectángulo exacto de recorte sobre los píxeles reales del vídeo (`videoWidth` × `videoHeight`)
 * que corresponde al recuadro de "Encuadre sugerido" visible en la pantalla (`guideRect` respecto a `videoRect`),
 * teniendo en cuenta que el elemento `<video>` utiliza `object-cover`.
 */
export function computeGuideCropFromVideoElement(
  videoEl: HTMLVideoElement,
  guideEl: HTMLElement | null
): CropRect {
  const vw = videoEl.videoWidth || 1280;
  const vh = videoEl.videoHeight || 960;

  if (guideEl) {
    const vRect = videoEl.getBoundingClientRect();
    const gRect = guideEl.getBoundingClientRect();

    if (vRect.width > 0 && vRect.height > 0 && gRect.width > 0 && gRect.height > 0) {
      // Con object-cover, el vídeo se escala uniformemente para cubrir vRect
      const scale = Math.max(vRect.width / vw, vRect.height / vh);
      const renderedWidth = vw * scale;
      const renderedHeight = vh * scale;

      // Desplazamiento del vídeo centrado dentro de vRect
      const offsetX = (renderedWidth - vRect.width) / 2;
      const offsetY = (renderedHeight - vRect.height) / 2;

      // Posición del recuadro guía dentro de la imagen renderizada
      const guideXInRendered = (gRect.left - vRect.left) + offsetX;
      const guideYInRendered = (gRect.top - vRect.top) + offsetY;

      const sx = Math.max(0, Math.round(guideXInRendered / scale));
      const sy = Math.max(0, Math.round(guideYInRendered / scale));
      const sw = Math.min(vw - sx, Math.round(gRect.width / scale));
      const sh = Math.min(vh - sy, Math.round(gRect.height / scale));

      if (sw > 40 && sh > 40) {
        return { sx, sy, sw, sh };
      }
    }
  }

  return computeCenteredCarnetCrop(vw, vh);
}

/**
 * Calcula un recorte vertical centrado en proporción 3:4 (tipo carnet escolar)
 * cuando no se dispone de coordenadas de guía DOM o al subir un archivo.
 */
export function computeCenteredCarnetCrop(sourceWidth: number, sourceHeight: number): CropRect {
  const targetAspect = 3 / 4; // Ancho / Alto (formato carnet vertical)
  // En una toma de cámara horizontal o vertical, el encuadre ocupa ~82% de la altura
  let sh = Math.round(sourceHeight * 0.84);
  let sw = Math.round(sh * targetAspect);

  if (sw > sourceWidth * 0.88) {
    sw = Math.round(sourceWidth * 0.88);
    sh = Math.round(sw / targetAspect);
  }

  const sx = Math.max(0, Math.round((sourceWidth - sw) / 2));
  const sy = Math.max(0, Math.round((sourceHeight - sh) / 2));

  return { sx, sy, sw, sh };
}

/**
 * Procesa una captura de vídeo o un archivo de imagen seleccionado en el navegador,
 * recorta la imagen exactamente en relación al encuadre sugerido (formato carnet 3:4)
 * y genera un único Blob en formato JPEG (`image/jpeg`) con la calidad configurada (0.90).
 */
export async function convertSourceToJpegBlob(
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap,
  sourceWidth: number,
  sourceHeight: number,
  options: JpegConversionOptions = {}
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const quality = Math.min(0.98, Math.max(0.7, options.quality ?? 0.9));
  const maxDimension = options.maxDimension ?? 1200;
  const enforceCarnetAspect = options.enforceCarnetAspect ?? true;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Dimensiones de imagen inválidas al capturar la fotografía.', true);
  }

  const crop: CropRect =
    options.cropRect ||
    (enforceCarnetAspect
      ? computeCenteredCarnetCrop(sourceWidth, sourceHeight)
      : { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight });

  let targetWidth = crop.sw;
  let targetHeight = crop.sh;

  if (targetWidth > maxDimension || targetHeight > maxDimension) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
      targetWidth = maxDimension;
    } else {
      targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
      targetHeight = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new AppError('UNKNOWN_ERROR', 'No se pudo inicializar el procesador gráfico del navegador.', false);
  }

  // Fondo blanco institucional por si la imagen origen tuviera transparencias
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    source,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    targetWidth,
    targetHeight
  );

  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new AppError('UNKNOWN_ERROR', 'Error al codificar la fotografía en formato JPEG.', true));
          return;
        }
        resolve(result);
      },
      'image/jpeg',
      quality
    );
  });

  // Validar tamaño máximo de 5 MB
  if (blob.size > 5 * 1024 * 1024) {
    throw new AppError(
      'VALIDATION_ERROR',
      'La fotografía generada supera el límite permitido de 5 MB. Reduzca la resolución e intente nuevamente.',
      false
    );
  }

  return {
    blob,
    dataUrl,
    width: targetWidth,
    height: targetHeight
  };
}

/**
 * Procesa un archivo seleccionado desde el dispositivo (input type="file"),
 * corrige su orientación EXIF automáticamente usando `createImageBitmap` con `imageOrientation: 'from-image'`
 * y lo convierte en una sola pasada a JPEG con calidad 0.90.
 */
export async function processUploadedFileToJpeg(
  file: File,
  options: JpegConversionOptions = {}
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) {
    throw new AppError(
      'VALIDATION_ERROR',
      'El archivo seleccionado no es una imagen válida. Seleccione un archivo JPG, PNG o WebP.',
      false
    );
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new AppError(
      'VALIDATION_ERROR',
      'El archivo de origen es demasiado grande (máximo 15 MB antes de procesar).',
      false
    );
  }

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image'
    });
    try {
      return await convertSourceToJpegBlob(bitmap, bitmap.width, bitmap.height, options);
    } finally {
      bitmap.close();
    }
  }

  // Alternativa compatible si createImageBitmap no está disponible
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new AppError('VALIDATION_ERROR', 'No se pudo leer el archivo de imagen seleccionado.', false));
      element.src = objectUrl;
    });
    return await convertSourceToJpegBlob(img, img.naturalWidth, img.naturalHeight, options);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

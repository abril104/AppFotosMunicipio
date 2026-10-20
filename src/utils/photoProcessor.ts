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

export interface JpegConversionOptions {
  quality?: number; // Entre 0.70 y 0.98, por defecto 0.90
  maxDimension?: number; // Por defecto 1440px para uso institucional nítido sin peso excesivo
}

/**
 * Procesa una captura de vídeo o un archivo de imagen seleccionado en el navegador
 * y genera un único Blob en formato JPEG (`image/jpeg`) con la calidad configurada (0.90),
 * corrigiendo orientación mediante createImageBitmap (cuando está disponible) y evitando
 * reconversiones repetidas que degraden la calidad.
 */
export async function convertSourceToJpegBlob(
  source: HTMLVideoElement | HTMLImageElement | ImageBitmap,
  sourceWidth: number,
  sourceHeight: number,
  options: JpegConversionOptions = {}
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const quality = Math.min(0.98, Math.max(0.7, options.quality ?? 0.9));
  const maxDimension = options.maxDimension ?? 1440;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Dimensiones de imagen inválidas al capturar la fotografía.', true);
  }

  let targetWidth = sourceWidth;
  let targetHeight = sourceHeight;

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
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

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

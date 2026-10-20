import { IS_SUPABASE_CONFIGURED, STORAGE_BUCKET_NAME, supabase } from './supabaseClient.ts';
import type { Profile, Student } from '../types/database.ts';
import { AppError, normalizeError } from '../utils/errorHandler.ts';
import { checkActionPermission } from '../utils/permissions.ts';
import { buildDeterministicPhotoPath } from '../utils/photoProcessor.ts';
import { updateDemoStudentRecord } from './studentService.ts';

// Almacenamiento efímero en RAM para Blobs durante una sesión de demostración local
// (NUNCA utiliza localStorage ni IndexedDB como almacenamiento permanente)
const demoRamPhotoBlobs = new Map<string, Blob>();
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Ejecuta una función asíncrona con reintentos controlados ante fallos transitorios de red.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 2,
  delayMs = 700
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Guarda o reemplaza la fotografía JPEG de una estudiante en el bucket privado de Supabase Storage
 * y actualiza su registro en PostgreSQL.
 *
 * Garantías de integridad:
 * 1. Verifica conexión a Internet y permisos del operador/administrador.
 * 2. Comprueba que la estudiante tenga un DNI válido de 8 dígitos.
 * 3. Construye la ruta determinista `padron/{student.id}/{student.dni}.jpg`.
 * 4. Sube el archivo JPEG al bucket privado `student-photos`.
 * 5. Actualiza en PostgreSQL `photo_path`, `photo_status = 'completada'`, `photo_updated_at` y `photo_updated_by`.
 * 6. Si era un reemplazo y la ruta anterior era distinta, elimina el archivo antiguo únicamente después
 *    de haber confirmado la nueva subida y la actualización en base de datos.
 * 7. NUNCA marca a la estudiante como fotografiada si la subida o la base de datos fallan.
 */
export async function uploadAndRegisterStudentPhoto(
  currentProfile: Profile,
  student: Student,
  jpegBlob: Blob
): Promise<Student> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AppError(
      'NETWORK_OFFLINE',
      'Sin conexión a Internet. No se puede guardar la fotografía en la nube en este momento. Su captura sigue en pantalla para que pueda reintentar al recuperar la conexión.',
      true
    );
  }

  const isReplacement = student.photo_status === 'completada' && Boolean(student.photo_path);
  const perm = checkActionPermission(
    { userId: currentProfile.id, role: currentProfile.role, isActive: currentProfile.is_active },
    isReplacement ? 'REPLACE_PHOTO' : 'CAPTURE_PHOTO'
  );

  if (!perm.allowed) {
    throw new AppError('AUTH_FORBIDDEN_ROLE', perm.reason || 'No autorizado para registrar fotografías.', false);
  }

  if (jpegBlob.type !== 'image/jpeg') {
    throw new AppError(
      'VALIDATION_ERROR',
      'Formato inválido: todas las fotografías deben procesarse y almacenarse exclusivamente en formato JPG (image/jpeg).',
      false
    );
  }

  const targetPhotoPath = buildDeterministicPhotoPath(student.id, student.dni);
  const previousPhotoPath = student.photo_path;
  const nowIso = new Date().toISOString();

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    // Modo demostración en memoria RAM de la sesión actual
    demoRamPhotoBlobs.set(targetPhotoPath, jpegBlob);
    if (previousPhotoPath && previousPhotoPath !== targetPhotoPath) {
      demoRamPhotoBlobs.delete(previousPhotoPath);
    }
    signedUrlCache.delete(targetPhotoPath);

    return updateDemoStudentRecord(student.id, (prev) => ({
      ...prev,
      photo_path: targetPhotoPath,
      photo_status: 'completada',
      photo_updated_at: nowIso,
      photo_updated_by: currentProfile.id,
      updated_at: nowIso
    }));
  }

  // 1. Subir al bucket privado con soporte de reintento automático
  await withRetry(async () => {
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .upload(targetPhotoPath, jpegBlob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      throw new AppError(
        'STORAGE_UPLOAD_FAILED',
        'No se pudo subir la fotografía al almacenamiento privado en la nube. Verifique su conexión e intente nuevamente.',
        true
      );
    }
  });

  // Invalidar caché de URL firmada para esta ruta para forzar refresco inmediato de la nueva foto
  signedUrlCache.delete(targetPhotoPath);

  // 2. Actualizar referencia, estado, fecha y autor en PostgreSQL
  const { data: updatedRow, error: dbError } = await supabase
    .from('students')
    .update({
      photo_path: targetPhotoPath,
      photo_status: 'completada',
      photo_updated_at: nowIso,
      photo_updated_by: currentProfile.id,
      updated_at: nowIso
    })
    .eq('id', student.id)
    .select('*')
    .single();

  if (dbError || !updatedRow) {
    // Si era la primera foto y la BD falló tras subir el archivo, intentar limpiar el archivo huérfano
    if (!isReplacement) {
      await supabase.storage.from(STORAGE_BUCKET_NAME).remove([targetPhotoPath]).catch(() => {});
    }
    throw new AppError(
      'DATABASE_OPERATION_FAILED',
      'La imagen se subió pero no se pudo registrar la confirmación en la base de datos. La estudiante no ha sido marcada como fotografiada; por favor reintente.',
      true
    );
  }

  // 3. Si se reemplazó una foto cuya ruta anterior era distinta, eliminar la anterior de forma segura
  if (previousPhotoPath && previousPhotoPath !== targetPhotoPath) {
    signedUrlCache.delete(previousPhotoPath);
    await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .remove([previousPhotoPath])
      .catch(() => {
        // Ignorar fallo no crítico de limpieza sin afectar la nueva fotografía ya confirmada
      });
  }

  return updatedRow as Student;
}

/**
 * Obtiene una URL firmada temporal (de duración limitada: 5 minutos) desde el bucket privado
 * para mostrar la miniatura o vista previa únicamente a usuarios autenticados y autorizados.
 * NUNCA utiliza `getPublicUrl`.
 */
export async function getAuthorizedPhotoSignedUrl(
  photoPath: string | null | undefined,
  forceRefresh = false
): Promise<string | null> {
  if (!photoPath) return null;

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const blob = demoRamPhotoBlobs.get(photoPath);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  const now = Date.now();
  if (!forceRefresh) {
    const cached = signedUrlCache.get(photoPath);
    if (cached && cached.expiresAt > now + 15_000) {
      return cached.url;
    }
  }

  const expiresInSeconds = 300; // 5 minutos de validez
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET_NAME)
    .createSignedUrl(photoPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  // Añadir marca de tiempo en memoria si se forzó refresco tras reemplazo
  const finalUrl = forceRefresh
    ? `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}v=${now}`
    : data.signedUrl;

  signedUrlCache.set(photoPath, {
    url: finalUrl,
    expiresAt: now + expiresInSeconds * 1000
  });

  return finalUrl;
}

/**
 * Descarga de forma autorizada el archivo binario (Blob) de una fotografía desde el bucket privado
 * para empaquetarlo en la exportación ZIP.
 */
export async function downloadAuthorizedPhotoBlob(photoPath: string): Promise<Blob> {
  if (!photoPath) {
    throw new AppError('EXPORT_ERROR', 'Ruta de fotografía vacía.', false);
  }

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const demoBlob = demoRamPhotoBlobs.get(photoPath);
    if (!demoBlob) {
      throw new AppError(
        'EXPORT_ERROR',
        'La fotografía de demostración no se encuentra en la memoria de la sesión actual.',
        false
      );
    }
    return demoBlob;
  }

  return await withRetry(async () => {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .download(photoPath);

    if (error || !data) {
      throw new AppError(
        'EXPORT_ERROR',
        'No se pudo descargar la fotografía desde el bucket privado.',
        true
      );
    }

    return data;
  });
}

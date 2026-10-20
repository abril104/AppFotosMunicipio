import JSZip from 'jszip';
import type { Profile, Student } from '../types/database.ts';
import type { ExportOptions, ExportProgress } from '../types/domain.ts';
import { AppError } from '../utils/errorHandler.ts';
import { checkActionPermission } from '../utils/permissions.ts';
import { buildZipPhotoEntryPath, sanitizeFolderToken } from '../utils/photoProcessor.ts';
import { downloadAuthorizedPhotoBlob } from './storageService.ts';

/**
 * Filtra las estudiantes objetivo según el alcance de exportación elegido:
 * - 'section': Un grado y una sección específicos
 * - 'grade': Todas las secciones de un grado
 * - 'all': Todo el padrón institucional
 */
export function selectStudentsForExport(
  allStudents: Student[],
  options: ExportOptions
): Student[] {
  return allStudents.filter((s) => {
    if (options.educationLevel && options.educationLevel !== 'ALL') {
      const lvl = (s.education_level || 'Secundaria').trim();
      if (lvl !== options.educationLevel) return false;
    }

    if (options.scope === 'section') {
      return (
        s.grade.trim() === (options.grade || '').trim() &&
        s.section.trim() === (options.section || '').trim()
      );
    }

    if (options.scope === 'grade') {
      return s.grade.trim() === (options.grade || '').trim();
    }

    return true;
  });
}

/**
 * Dispara la descarga en el navegador de un Blob generado (archivo .zip).
 */
function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Ejecuta la exportación de fotografías en formato JPG dentro de un archivo ZIP estructurado:
 *
 * Fotografias_Estudiantes/
 *   Grado_Seccion/
 *     12345678.jpg
 *     23456789.jpg
 *
 * Características:
 * - El nombre del archivo JPG es EXCLUSIVAMENTE el DNI ({dni}.jpg), sin nombres ni otros datos personales.
 * - Descarga cada imagen desde el bucket privado mediante operación autorizada (nunca URLs públicas).
 * - Si el volumen de fotografías supera el tamaño de lote seguro para la memoria del navegador
 *   (por defecto 200 fotos por lote), divide automáticamente la exportación en lotes numerados.
 */
export async function exportStudentPhotosToZip(
  currentProfile: Profile,
  allStudents: Student[],
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void
): Promise<ExportProgress> {
  const perm = checkActionPermission(
    { userId: currentProfile.id, role: currentProfile.role, isActive: currentProfile.is_active },
    'EXPORT_PHOTOS'
  );

  if (!perm.allowed) {
    throw new AppError('AUTH_FORBIDDEN_ROLE', perm.reason || 'No tiene permisos para exportar fotografías.', false);
  }

  const scopedStudents = selectStudentsForExport(allStudents, options);
  if (scopedStudents.length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'No se encontraron estudiantes para los criterios de grado o sección seleccionados.',
      false
    );
  }

  const photographedStudents = scopedStudents.filter(
    (s) => s.photo_status === 'completada' && Boolean(s.photo_path)
  );
  const pendingStudents = scopedStudents.filter(
    (s) => s.photo_status !== 'completada' || !s.photo_path
  );

  if (photographedStudents.length === 0 && !options.includePendingReport) {
    throw new AppError(
      'VALIDATION_ERROR',
      'No hay fotografías completadas en la selección actual para exportar. Fotografie al menos a una estudiante o marque la opción para incluir el informe de pendientes.',
      false
    );
  }

  const batchSize = Math.max(25, options.batchSize ?? 200);
  const totalPhotos = photographedStudents.length;
  const totalBatches = Math.max(1, Math.ceil(totalPhotos / batchSize));

  let exportedCount = 0;
  let failedCount = 0;
  const failedDnis: string[] = [];

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const zip = new JSZip();
    const start = batchIdx * batchSize;
    const end = Math.min(start + batchSize, totalPhotos);
    const batchSlice = photographedStudents.slice(start, end);

    for (let i = 0; i < batchSlice.length; i++) {
      const student = batchSlice[i];
      const globalIndex = start + i + 1;

      onProgress?.({
        phase: 'downloading',
        current: globalIndex,
        total: totalPhotos,
        exportedCount,
        skippedPendingCount: pendingStudents.length,
        failedCount,
        failedDnis: [...failedDnis],
        batchIndex: batchIdx + 1,
        totalBatches,
        message: `Descargando fotografía ${globalIndex} de ${totalPhotos} (Lote ${batchIdx + 1}/${totalBatches})...`
      });

      try {
        if (!student.photo_path) {
          throw new Error('Sin ruta de archivo');
        }
        const blob = await downloadAuthorizedPhotoBlob(student.photo_path);
        const zipEntryPath = buildZipPhotoEntryPath(student);
        zip.file(zipEntryPath, blob, { binary: true });
        exportedCount++;
      } catch {
        failedCount++;
        failedDnis.push(student.dni);
      }
    }

    // Si el usuario solicitó explícitamente el informe de pendientes, incluirlo en el primer lote
    // usando únicamente grado, sección y estado (sin credenciales ni datos sensibles adicionales)
    if (options.includePendingReport && batchIdx === 0) {
      const csvLines = [
        'Grado,Seccion,DNI,Estado_Fotografia',
        ...pendingStudents.map(
          (p) => `${sanitizeFolderToken(p.grade)},${sanitizeFolderToken(p.section)},${p.dni},PENDIENTE`
        )
      ];
      zip.file('Fotografias_Estudiantes/Informe_Pendientes.csv', '\uFEFF' + csvLines.join('\r\n'));
    }

    onProgress?.({
      phase: 'packaging',
      current: end,
      total: totalPhotos,
      exportedCount,
      skippedPendingCount: pendingStudents.length,
      failedCount,
      failedDnis: [...failedDnis],
      batchIndex: batchIdx + 1,
      totalBatches,
      message: `Generando archivo comprimido ZIP (Lote ${batchIdx + 1}/${totalBatches})...`
    });

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    let baseName = `Fotografias_Estudiantes_${dateStamp}`;
    if (options.scope === 'section' && options.grade && options.section) {
      baseName = `Fotografias_${sanitizeFolderToken(options.grade)}_${sanitizeFolderToken(options.section)}_${dateStamp}`;
    } else if (options.scope === 'grade' && options.grade) {
      baseName = `Fotografias_Grado_${sanitizeFolderToken(options.grade)}_${dateStamp}`;
    }

    const batchSuffix = totalBatches > 1 ? `_Parte_${batchIdx + 1}_de_${totalBatches}` : '';
    triggerBrowserDownload(zipBlob, `${baseName}${batchSuffix}.zip`);
  }

  const finalSummary: ExportProgress = {
    phase: 'completed',
    current: totalPhotos,
    total: totalPhotos,
    exportedCount,
    skippedPendingCount: pendingStudents.length,
    failedCount,
    failedDnis,
    batchIndex: totalBatches,
    totalBatches,
    message:
      failedCount === 0
        ? `Exportación completada con éxito: ${exportedCount} fotografía(s) exportada(s).`
        : `Exportación finalizada con observaciones: ${exportedCount} exportada(s), ${failedCount} fallida(s).`
  };

  onProgress?.(finalSummary);
  return finalSummary;
}

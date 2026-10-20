import { IS_SUPABASE_CONFIGURED, supabase } from './supabaseClient.ts';
import type { ImportBatch, Profile, Student } from '../types/database.ts';
import type { ParsedExcelRow } from '../types/domain.ts';
import { INITIAL_DEMO_BATCHES, INITIAL_DEMO_STUDENTS } from '../data/demoStudents.ts';
import { AppError, normalizeError } from '../utils/errorHandler.ts';
import { checkActionPermission } from '../utils/permissions.ts';
import {
  applyControlledRosterUpsert,
  computeImportSummary
} from '../utils/excelValidator.ts';

// Almacenamiento en memoria para modo demostración (nunca usa localStorage ni IndexedDB para fotos)
let demoStudentsStore: Student[] = [...INITIAL_DEMO_STUDENTS];
let demoBatchesStore: ImportBatch[] = [...INITIAL_DEMO_BATCHES];
const demoListeners = new Set<() => void>();

function notifyDemoListeners() {
  for (const listener of demoListeners) {
    listener();
  }
}

export function getDemoStudentById(studentId: string): Student | undefined {
  return demoStudentsStore.find((s) => s.id === studentId);
}

export function updateDemoStudentRecord(studentId: string, updater: (prev: Student) => Student): Student {
  const idx = demoStudentsStore.findIndex((s) => s.id === studentId);
  if (idx === -1) {
    throw new AppError('VALIDATION_ERROR', 'Estudiante no encontrada en el padrón.', false);
  }
  const updated = updater(demoStudentsStore[idx]);
  demoStudentsStore[idx] = updated;
  notifyDemoListeners();
  return updated;
}

/**
 * Obtiene el padrón completo de estudiantes desde Supabase PostgreSQL.
 */
export async function fetchStudents(): Promise<Student[]> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return [...demoStudentsStore].sort((a, b) =>
      a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' })
    );
  }

  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) {
      throw normalizeError(error, 'Error al consultar el padrón de estudiantes en la nube.');
    }

    return (data || []) as Student[];
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Suscribe la aplicación a cambios en tiempo real sobre `public.students`
 * para que si un operador toma una fotografía en una laptop, cualquier otra
 * computadora o celular autorizado vea el avance actualizado de inmediato.
 */
export function subscribeToStudentsChanges(onUpdate: () => void): () => void {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    demoListeners.add(onUpdate);
    return () => {
      demoListeners.delete(onUpdate);
    };
  }

  const channel = supabase
    .channel('students-realtime-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'students' },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Importa y actualiza de forma controlada un lote validado de estudiantes desde Excel.
 * REGLAS ESTRICTAS:
 * 1. Solo los administradores autorizados pueden importar el padrón.
 * 2. Prohibido confirmar si aún existen errores bloqueantes en filas no excluidas.
 * 3. NUNCA borra fotografías existentes (`photo_path` ni `photo_status`) al actualizar una estudiante.
 * 4. NUNCA elimina estudiantes que ya no aparezcan en el nuevo archivo Excel.
 */
export async function importValidatedExcelRows(
  currentProfile: Profile,
  fileName: string,
  rows: ParsedExcelRow[]
): Promise<{
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  batchRecord: ImportBatch;
}> {
  const perm = checkActionPermission(
    { userId: currentProfile.id, role: currentProfile.role, isActive: currentProfile.is_active },
    'IMPORT_PADRON'
  );
  if (!perm.allowed) {
    throw new AppError('AUTH_FORBIDDEN_ROLE', perm.reason || 'Permiso denegado.', false);
  }

  const summary = computeImportSummary(rows);
  if (summary.blockingErrorCount > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      `No se puede confirmar la importación: existen ${summary.blockingErrorCount} fila(s) con errores sin resolver.`,
      false
    );
  }

  const actionableRows = rows.filter((row) => {
    if (row.excluded || !row.isValid) return false;
    if (row.existingInDb && row.existingAction === 'skip') return false;
    return true;
  });

  if (actionableRows.length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'No hay filas seleccionadas para importar o actualizar.',
      false
    );
  }

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    const nowIso = new Date().toISOString();
    const { nextRoster, insertedCount, updatedCount } = applyControlledRosterUpsert(
      demoStudentsStore,
      rows
    );
    demoStudentsStore = nextRoster;

    const batchRecord: ImportBatch = {
      id: crypto.randomUUID(),
      file_name: fileName,
      imported_by: currentProfile.id,
      total_rows: rows.length,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      skipped_count: summary.toSkipCount,
      error_count: summary.invalidOrExcludedCount,
      notes: `Importación completada (${insertedCount} nuevas, ${updatedCount} actualizadas, fotografías existentes preservadas).`,
      created_at: nowIso
    };
    demoBatchesStore = [batchRecord, ...demoBatchesStore];
    notifyDemoListeners();

    return {
      insertedCount,
      updatedCount,
      skippedCount: summary.toSkipCount,
      batchRecord
    };
  }

  // En Supabase PostgreSQL: usar la función RPC segura `upsert_students_preserve_photos`
  // o actualización controlada que preserva estrictamente photo_path y photo_status
  const payload = actionableRows.map((r) => ({
    dni: r.dni,
    full_name: r.full_name,
    education_level: r.education_level || 'Secundaria',
    grade: r.grade,
    section: r.section
  }));

  let insertedCount = summary.validNewCount;
  let updatedCount = summary.toUpdateCount;

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'upsert_students_preserve_photos' as never,
    { p_students: payload } as never
  );

  if (rpcError) {
    // Fallback controlado si el administrador aún no creó la función RPC pero sí las tablas:
    // Insertar nuevas y actualizar solo campos no fotográficos en existentes
    const newRows = actionableRows.filter((r) => !r.existingInDb);
    const updateRows = actionableRows.filter((r) => r.existingInDb && r.existingAction === 'update');

    if (newRows.length > 0) {
      const { error: insertErr } = await supabase.from('students').insert(
        newRows.map((r) => ({
          dni: r.dni,
          full_name: r.full_name,
          education_level: r.education_level || 'Secundaria',
          grade: r.grade,
          section: r.section,
          photo_status: 'pendiente' as const,
          photo_path: null
        }))
      );
      if (insertErr) {
        throw normalizeError(insertErr, 'Error al insertar nuevas estudiantes en la base de datos.');
      }
    }

    for (const row of updateRows) {
      const { error: updErr } = await supabase
        .from('students')
        .update({
          full_name: row.full_name,
          education_level: row.education_level || 'Secundaria',
          grade: row.grade,
          section: row.section,
          updated_at: new Date().toISOString()
        })
        .eq('dni', row.dni);

      if (updErr) {
        throw normalizeError(updErr, 'Error al actualizar datos de estudiante existente.');
      }
    }
  } else if (rpcData && typeof rpcData === 'object') {
    const counts = rpcData as { inserted?: number; updated?: number };
    if (typeof counts.inserted === 'number') insertedCount = counts.inserted;
    if (typeof counts.updated === 'number') updatedCount = counts.updated;
  }

  const batchInsert = {
    file_name: fileName,
    imported_by: currentProfile.id,
    total_rows: rows.length,
    inserted_count: insertedCount,
    updated_count: updatedCount,
    skipped_count: summary.toSkipCount,
    error_count: summary.invalidOrExcludedCount,
    notes: `Importación verificada (${insertedCount} nuevas, ${updatedCount} actualizadas).`
  };

  const { data: batchData, error: batchErr } = await supabase
    .from('import_batches')
    .insert(batchInsert)
    .select('*')
    .single();

  const batchRecord: ImportBatch = (batchData as ImportBatch) || {
    id: crypto.randomUUID(),
    ...batchInsert,
    created_at: new Date().toISOString()
  };

  if (batchErr) {
    // No revertir el padrón si solo la auditoría opcional falló, pero devolver registro consistente
  }

  return {
    insertedCount,
    updatedCount,
    skippedCount: summary.toSkipCount,
    batchRecord
  };
}

/**
 * Elimina un registro de estudiante previa confirmación explícita (exclusivo Administrador).
 */
export async function deleteStudentRecord(
  currentProfile: Profile,
  student: Student
): Promise<void> {
  const perm = checkActionPermission(
    { userId: currentProfile.id, role: currentProfile.role, isActive: currentProfile.is_active },
    'DELETE_STUDENT'
  );
  if (!perm.allowed) {
    throw new AppError('AUTH_FORBIDDEN_ROLE', perm.reason || 'Permiso denegado.', false);
  }

  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    demoStudentsStore = demoStudentsStore.filter((s) => s.id !== student.id);
    notifyDemoListeners();
    return;
  }

  const { error } = await supabase.from('students').delete().eq('id', student.id);
  if (error) {
    throw normalizeError(error, 'No se pudo eliminar el registro de la estudiante.');
  }
}

/**
 * Consulta el historial de lotes de importación de padrón.
 */
export async function fetchImportBatches(): Promise<ImportBatch[]> {
  if (!IS_SUPABASE_CONFIGURED || !supabase) {
    return [...demoBatchesStore];
  }

  const { data, error } = await supabase
    .from('import_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return [];
  }
  return (data || []) as ImportBatch[];
}

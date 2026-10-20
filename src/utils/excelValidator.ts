import type {
  ColumnMapping,
  ExistingStudentAction,
  ImportSummaryCounts,
  ParsedExcelRow,
  RowValidationIssue
} from '../types/domain.ts';
import type { Student } from '../types/database.ts';

/**
 * Normaliza un encabezado de columna para comparación flexible (sin tildes, minúsculas, sin símbolos).
 */
export function normalizeHeaderName(header: string): string {
  return String(header || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_SYNONYMS = {
  dni: [
    'dni',
    'documento de identidad',
    'documento nacional de identidad',
    'nro documento',
    'numero de documento',
    'num documento',
    'doc identidad',
    'documento',
    'cedula'
  ],
  fullName: [
    'nombre completo',
    'nombres y apellidos',
    'apellidos y nombres',
    'estudiante',
    'estudiantes',
    'alumna',
    'alumno',
    'nombres completos',
    'apellido y nombre',
    'nombre y apellido',
    'nombres'
  ],
  grade: [
    'grado',
    'grado academico',
    'ano',
    'anio',
    'grado de estudios',
    'grado escolar'
  ],
  section: [
    'seccion',
    'sec',
    'aula',
    'salon',
    'grupo'
  ],
  educationLevel: [
    'nivel',
    'nivel educativo',
    'modalidad'
  ]
};

/**
 * Detecta automáticamente el mapeo de columnas a partir de los encabezados del archivo Excel.
 */
export function autoDetectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    dni: '',
    fullName: '',
    grade: '',
    section: '',
    educationLevel: ''
  };

  const normalizedMap = headers.map((raw) => ({
    raw,
    norm: normalizeHeaderName(raw)
  }));

  for (const field of ['dni', 'fullName', 'grade', 'section', 'educationLevel'] as const) {
    const candidates = HEADER_SYNONYMS[field];
    // 1. Coincidencia exacta normalizada
    const exactMatch = normalizedMap.find((h) => candidates.includes(h.norm));
    if (exactMatch) {
      mapping[field] = exactMatch.raw;
      continue;
    }
    // 2. Coincidencia parcial segura
    const partialMatch = normalizedMap.find((h) =>
      candidates.some((cand) => h.norm.includes(cand))
    );
    if (partialMatch) {
      mapping[field] = partialMatch.raw;
    }
  }

  return mapping;
}

/**
 * Detecta si un valor de DNI proviene de notación científica (p. ej. "1.23457E+07" o "4,56E+07").
 */
export function isScientificNotation(rawVal: string): boolean {
  const trimmed = String(rawVal ?? '').trim();
  return /^[+-]?\d+([.,]\d+)?e[+-]?\d+$/i.test(trimmed);
}

/**
 * Limpia el valor del DNI tratándolo siempre como texto y preservando ceros iniciales.
 * NUNCA convierte a Number para no perder ceros a la izquierda ni generar notación científica.
 */
export function sanitizeDniText(rawVal: unknown): string {
  if (rawVal === null || rawVal === undefined) return '';
  const str = String(rawVal).trim();
  // Si el usuario o Excel puso comillas simples al inicio ('01234567) para forzar texto, quitarlas
  return str.replace(/^'+/, '').trim();
}

/**
 * Valida que un DNI peruano tenga exactamente 8 dígitos numéricos como texto.
 */
export function isValidPeruvianDni(dni: string): boolean {
  return /^[0-9]{8}$/.test(dni);
}

/**
 * Evalúa y revalida todas las filas importadas del Excel, detectando:
 * - Filas vacías
 * - Grados, secciones o nombres faltantes
 * - DNI en notación científica o formato inválido (!== 8 dígitos)
 * - DNI duplicados dentro del propio archivo Excel
 * - DNI que ya existen en la base de datos (para actualización controlada u omisión)
 */
export function validateAndAnalyzeRows(
  rawRows: Array<{
    rowIndex: number;
    dni: string;
    full_name: string;
    education_level?: string;
    grade: string;
    section: string;
    excluded?: boolean;
    existingAction?: ExistingStudentAction;
  }>,
  existingStudentsByDni: Map<string, Student>
): ParsedExcelRow[] {
  // Contar frecuencia de cada DNI limpio (entre filas no excluidas) para detectar duplicados dentro del archivo
  const dniFrequency = new Map<string, number[]>();

  const cleanedRows = rawRows.map((row) => {
    const dni = sanitizeDniText(row.dni);
    const full_name = String(row.full_name ?? '').replace(/\s+/g, ' ').trim();
    const education_level = String(row.education_level ?? '').replace(/\s+/g, ' ').trim() || 'Secundaria';
    const grade = String(row.grade ?? '').replace(/\s+/g, ' ').trim();
    const section = String(row.section ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
    const excluded = Boolean(row.excluded);

    if (!excluded && dni.length > 0) {
      const list = dniFrequency.get(dni) || [];
      list.push(row.rowIndex);
      dniFrequency.set(dni, list);
    }

    return {
      rowIndex: row.rowIndex,
      dni,
      full_name,
      education_level,
      grade,
      section,
      excluded,
      existingAction: row.existingAction || ('update' as ExistingStudentAction)
    };
  });

  return cleanedRows.map((row) => {
    const issues: RowValidationIssue[] = [];
    const isCompletelyEmpty =
      !row.dni && !row.full_name && !row.grade && !row.section;

    if (isCompletelyEmpty) {
      issues.push({
        type: 'EMPTY_ROW',
        field: 'row',
        message: 'La fila está completamente vacía.',
        isBlocking: true
      });
    } else {
      if (!row.dni) {
        issues.push({
          type: 'INVALID_DNI_FORMAT',
          field: 'dni',
          message: 'El DNI está vacío. Debe contener exactamente 8 dígitos.',
          isBlocking: true
        });
      } else if (isScientificNotation(row.dni)) {
        issues.push({
          type: 'SCIENTIFIC_NOTATION_DNI',
          field: 'dni',
          message: 'El DNI está en notación científica. Formatee la columna como Texto y escriba los 8 dígitos.',
          isBlocking: true
        });
      } else if (!isValidPeruvianDni(row.dni)) {
        issues.push({
          type: 'INVALID_DNI_FORMAT',
          field: 'dni',
          message: `El DNI "${row.dni}" es inválido. El DNI peruano debe tener exactamente 8 dígitos numéricos (incluyendo ceros iniciales).`,
          isBlocking: true
        });
      }

      if (!row.full_name || row.full_name.length < 2) {
        issues.push({
          type: 'MISSING_NAME',
          field: 'full_name',
          message: 'El nombre completo de la estudiante es obligatorio.',
          isBlocking: true
        });
      }

      if (!row.grade) {
        issues.push({
          type: 'MISSING_GRADE',
          field: 'grade',
          message: 'Falta especificar el grado académico.',
          isBlocking: true
        });
      }

      if (!row.section) {
        issues.push({
          type: 'MISSING_SECTION',
          field: 'section',
          message: 'Falta especificar la sección.',
          isBlocking: true
        });
      }

      if (!row.excluded && row.dni) {
        const occurrences = dniFrequency.get(row.dni) || [];
        if (occurrences.length > 1) {
          const otherRows = occurrences.filter((idx) => idx !== row.rowIndex);
          issues.push({
            type: 'DUPLICATE_IN_FILE',
            field: 'dni',
            message: `DNI duplicado dentro del mismo archivo Excel (también en fila${otherRows.length > 1 ? 's' : ''} ${otherRows.join(', ')}).`,
            isBlocking: true
          });
        }
      }
    }

    const existingStudent = row.dni ? existingStudentsByDni.get(row.dni) : undefined;
    const existingInDb = Boolean(existingStudent);
    const existingHasPhoto = Boolean(
      existingStudent && existingStudent.photo_status === 'completada' && existingStudent.photo_path
    );

    if (existingInDb && !isCompletelyEmpty) {
      issues.push({
        type: 'EXISTS_IN_DB',
        field: 'dni',
        message: existingHasPhoto
          ? 'La estudiante ya existe en el padrón con fotografía registrada (su fotografía se conservará intacta).'
          : 'La estudiante ya existe en el padrón institucional.',
        isBlocking: false
      });
    }

    const hasBlockingIssues = issues.some((i) => i.isBlocking);

    return {
      rowIndex: row.rowIndex,
      dni: row.dni,
      full_name: row.full_name,
      education_level: row.education_level,
      grade: row.grade,
      section: row.section,
      excluded: row.excluded,
      existingInDb,
      existingAction: row.existingAction,
      existingHasPhoto,
      issues,
      isValid: !hasBlockingIssues
    };
  });
}

/**
 * Calcula los totales de importación:
 * cuántas estudiantes se importarán (nuevas), cuántas se actualizarán y cuántas se omitirán/excluirán,
 * así como cuántos errores bloqueantes quedan pendientes de resolver.
 */
export function computeImportSummary(rows: ParsedExcelRow[]): ImportSummaryCounts {
  let validNewCount = 0;
  let toUpdateCount = 0;
  let toSkipCount = 0;
  let invalidOrExcludedCount = 0;
  let duplicateInFileCount = 0;
  let blockingErrorCount = 0;

  for (const row of rows) {
    if (row.excluded) {
      invalidOrExcludedCount++;
      toSkipCount++;
      continue;
    }

    const hasDuplicateInFile = row.issues.some((i) => i.type === 'DUPLICATE_IN_FILE');
    if (hasDuplicateInFile) {
      duplicateInFileCount++;
    }

    if (!row.isValid) {
      blockingErrorCount++;
      invalidOrExcludedCount++;
      continue;
    }

    if (row.existingInDb) {
      if (row.existingAction === 'update') {
        toUpdateCount++;
      } else {
        toSkipCount++;
      }
    } else {
      validNewCount++;
    }
  }

  return {
    totalRows: rows.length,
    validNewCount,
    toUpdateCount,
    toSkipCount,
    invalidOrExcludedCount,
    duplicateInFileCount,
    blockingErrorCount
  };
}

/**
 * Determina si el administrador puede confirmar la importación.
 * Regla: No deben existir filas activas con errores bloqueantes y debe haber al menos
 * 1 registro válido para insertar o actualizar.
 */
export function canConfirmImport(summary: ImportSummaryCounts): boolean {
  if (summary.blockingErrorCount > 0) return false;
  return summary.validNewCount + summary.toUpdateCount > 0;
}

/**
 * Aplica de forma controlada la actualización e inserción de estudiantes a partir
 * de filas validadas del Excel:
 * - Preserva intactas las fotografías existentes (`photo_path`, `photo_status`, `photo_updated_at`, `photo_updated_by`).
 * - NUNCA elimina estudiantes que ya no aparezcan en el nuevo archivo Excel.
 */
export function applyControlledRosterUpsert(
  existingRoster: Student[],
  validatedRows: ParsedExcelRow[]
): {
  nextRoster: Student[];
  insertedCount: number;
  updatedCount: number;
} {
  const nextRoster = [...existingRoster];
  let insertedCount = 0;
  let updatedCount = 0;
  const nowIso = new Date().toISOString();

  for (const row of validatedRows) {
    if (row.excluded || !row.isValid) continue;
    if (row.existingInDb && row.existingAction === 'skip') continue;

    const existingIdx = nextRoster.findIndex((s) => s.dni === row.dni);
    if (existingIdx >= 0) {
      const existing = nextRoster[existingIdx];
      nextRoster[existingIdx] = {
        ...existing,
        full_name: row.full_name,
        education_level: row.education_level || existing.education_level || 'Secundaria',
        grade: row.grade,
        section: row.section,
        // Preservar estrictamente photo_path, photo_status, photo_updated_at y photo_updated_by
        updated_at: nowIso
      };
      updatedCount++;
    } else {
      nextRoster.push({
        id: crypto.randomUUID(),
        dni: row.dni,
        full_name: row.full_name,
        education_level: row.education_level || 'Secundaria',
        grade: row.grade,
        section: row.section,
        photo_path: null,
        photo_status: 'pendiente',
        photo_updated_at: null,
        photo_updated_by: null,
        created_at: nowIso,
        updated_at: nowIso
      });
      insertedCount++;
    }
  }

  return { nextRoster, insertedCount, updatedCount };
}


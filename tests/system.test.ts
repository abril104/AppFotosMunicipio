import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyControlledRosterUpsert,
  autoDetectColumns,
  canConfirmImport,
  computeImportSummary,
  isScientificNotation,
  isValidPeruvianDni,
  normalizeGradeLabel,
  sanitizeDniText,
  validateAndAnalyzeRows
} from '../src/utils/excelValidator.ts';
import {
  calculateProgressMetrics,
  computeDashboardStats,
  filterAndSortStudents,
  getAvailableGrades,
  getAvailableSections
} from '../src/utils/academicFilter.ts';
import {
  buildDeterministicPhotoPath,
  buildZipPhotoEntryPath,
  computeCenteredCarnetCrop
} from '../src/utils/photoProcessor.ts';
import {
  checkActionPermission,
  validateSupabaseEnvConfig
} from '../src/utils/permissions.ts';
import { sanitizeLogMessage } from '../src/utils/errorHandler.ts';
import { INITIAL_DEMO_STUDENTS } from '../src/data/demoStudents.ts';
import type { Student } from '../src/types/database.ts';

describe('Fase 3: Importación y Validación del Padrón Excel', () => {
  it('reconoce variaciones razonables de encabezados en español', () => {
    const headers = ['Nivel Educativo', 'Grado Escolar', 'Sección', 'Apellidos y nombres', 'Documento de identidad'];
    const mapping = autoDetectColumns(headers);

    assert.equal(mapping.dni, 'Documento de identidad');
    assert.equal(mapping.fullName, 'Apellidos y nombres');
    assert.equal(mapping.grade, 'Grado Escolar');
    assert.equal(mapping.section, 'Sección');
    assert.equal(mapping.educationLevel, 'Nivel Educativo');
  });

  it('preserva los ceros iniciales del DNI como texto y rechaza notación científica', () => {
    assert.equal(sanitizeDniText("'01234567"), '01234567');
    assert.equal(isValidPeruvianDni('01234567'), true);
    assert.equal(isValidPeruvianDni('1234567'), false); // 7 dígitos
    assert.equal(isValidPeruvianDni('123456789'), false); // 9 dígitos
    assert.equal(isScientificNotation('1.23457E+07'), true);
    assert.equal(isScientificNotation('4,56E+07'), true);
    assert.equal(isScientificNotation('01234567'), false);
  });

  it('detecta filas vacías, DNI inválidos, duplicados en el archivo y registros existentes en BD', () => {
    const existingDbMap = new Map<string, Student>([
      [
        '00000101',
        {
          id: 'uuid-101',
          dni: '00000101',
          full_name: 'ALVAREZ MENDOZA, VALENTINA',
          grade: '1ro',
          section: 'A',
          photo_path: 'padron/uuid-101/00000101.jpg',
          photo_status: 'completada',
          photo_updated_at: '2026-03-10T12:00:00Z',
          photo_updated_by: 'admin-1',
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-10T12:00:00Z'
        }
      ]
    ]);

    const rawRows = [
      // 1. Estudiante nueva válida con cero inicial
      { rowIndex: 2, dni: '09876543', full_name: 'ZAPATA LUNA, MARIA', grade: '2do', section: 'B' },
      // 2. Estudiante existente en BD con foto previa
      { rowIndex: 3, dni: '00000101', full_name: 'ALVAREZ MENDOZA, VALENTINA SOFIA', grade: '1ro', section: 'A' },
      // 3. DNI duplicado dentro del archivo (fila 4 y 5)
      { rowIndex: 4, dni: '71112222', full_name: 'PEREZ SOTO, ANA', grade: '3ro', section: 'A' },
      { rowIndex: 5, dni: '71112222', full_name: 'PEREZ SOTO, ANA DUPLICADA', grade: '3ro', section: 'A' },
      // 4. DNI en notación científica
      { rowIndex: 6, dni: '7.12345E+07', full_name: 'GOMEZ RUIZ, CARLA', grade: '4to', section: 'A' },
      // 5. Fila vacía
      { rowIndex: 7, dni: '', full_name: '', grade: '', section: '' }
    ];

    const analyzed = validateAndAnalyzeRows(rawRows, existingDbMap);
    const summary = computeImportSummary(analyzed);

    assert.equal(summary.totalRows, 6);
    assert.equal(summary.validNewCount, 1); // Solo fila 2
    assert.equal(summary.toUpdateCount, 1); // Fila 3 (existente en BD)
    assert.equal(summary.duplicateInFileCount, 2); // Filas 4 y 5
    assert.equal(summary.blockingErrorCount, 4); // Filas 4, 5, 6 y 7
    assert.equal(canConfirmImport(summary), false); // Bloqueado mientras existan errores

    // Verificar que al excluir las filas con error se habilita la confirmación
    const afterExcludingInvalid = validateAndAnalyzeRows(
      analyzed.map((r) => (!r.isValid ? { ...r, excluded: true } : r)),
      existingDbMap
    );
    const cleanSummary = computeImportSummary(afterExcludingInvalid);
    assert.equal(cleanSummary.blockingErrorCount, 0);
    assert.equal(canConfirmImport(cleanSummary), true);
  });
});

describe('Fase 4: Organización Académica, Filtros y Estadísticas', () => {
  const sampleRoster: Student[] = [
    {
      id: 's1',
      dni: '01111111',
      full_name: 'CACERES, LUCIA',
      education_level: 'Secundaria',
      grade: '1ro',
      section: 'A',
      photo_path: 'padron/s1/01111111.jpg',
      photo_status: 'completada',
      photo_updated_at: '2026-03-10T10:00:00Z',
      photo_updated_by: 'u1',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-10T10:00:00Z'
    },
    {
      id: 's2',
      dni: '02222222',
      full_name: 'ALVAREZ, SOFIA',
      education_level: 'Secundaria',
      grade: '1ro',
      section: 'A',
      photo_path: null,
      photo_status: 'pendiente',
      photo_updated_at: null,
      photo_updated_by: null,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    },
    {
      id: 's3',
      dni: '03333333',
      full_name: 'BENITES, CAMILA',
      education_level: 'Secundaria',
      grade: '2do',
      section: 'B',
      photo_path: null,
      photo_status: 'pendiente',
      photo_updated_at: null,
      photo_updated_by: null,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    }
  ];

  it('genera filtros dependientes de grado (1ro a 5to) y secciones (A-M en 1ro, A-I en 2do-5to) y ordena alfabéticamente', () => {
    const grades = getAvailableGrades(sampleRoster, 'Secundaria');
    assert.deepEqual(grades, ['1ro', '2do', '3ro', '4to', '5to']);

    const sections1ro = getAvailableSections(sampleRoster, '1ro', 'Secundaria');
    assert.deepEqual(sections1ro, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']);

    const sections2do = getAvailableSections(sampleRoster, '2do', 'Secundaria');
    assert.deepEqual(sections2do, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);

    assert.equal(normalizeGradeLabel('Primero'), '1ro');
    assert.equal(normalizeGradeLabel('5°'), '5to');

    const filtered1roA = filterAndSortStudents(sampleRoster, {
      educationLevel: 'Secundaria',
      grade: '1ro',
      section: 'A',
      searchQuery: '',
      statusFilter: 'ALL',
      sortOrder: 'asc'
    });

    assert.equal(filtered1roA.length, 2);
    assert.equal(filtered1roA[0].full_name, 'ALVAREZ, SOFIA');
    assert.equal(filtered1roA[1].full_name, 'CACERES, LUCIA');
  });

  it('calcula métricas exactas de avance general y por sección', () => {
    const metrics = calculateProgressMetrics(sampleRoster);
    assert.equal(metrics.total, 3);
    assert.equal(metrics.photographed, 1);
    assert.equal(metrics.pending, 2);
    assert.equal(metrics.percentage, 33.3);

    const dashboard = computeDashboardStats(sampleRoster);
    assert.equal(dashboard.byGradeSection.length, 2);
    assert.equal(dashboard.recentPhotos.length, 1);
    assert.equal(dashboard.recentPhotos[0].dni, '01111111');

    // Si una estudiante pendiente pasa a condición 'retirada' (trasladada a otra I.E.), se descuenta de pendientes
    const rosterWithRetired: Student[] = sampleRoster.map((s) =>
      s.id === 's3' ? { ...s, photo_status: 'retirada' } : s
    );
    const metricsWithRetired = calculateProgressMetrics(rosterWithRetired);
    assert.equal(metricsWithRetired.total, 3);
    assert.equal(metricsWithRetired.retired, 1);
    assert.equal(metricsWithRetired.photographed, 1);
    assert.equal(metricsWithRetired.pending, 1);
    assert.equal(metricsWithRetired.percentage, 50);
  });
});

describe('Fase 5 y 6: Rutas Deterministas de Almacenamiento, Recorte 3:4 y Estructura ZIP', () => {
  it('calcula el recorte vertical 3:4 centrado en relación al encuadre sugerido', () => {
    const crop = computeCenteredCarnetCrop(1280, 960);
    assert.equal(crop.sh, 806);
    assert.equal(crop.sw, 605); // ~3:4 proporción vertical
    assert.equal(crop.sx > 0, true);
    assert.equal(crop.sy > 0, true);
  });
  it('construye ruta determinista en bucket privado y valida DNI de 8 dígitos', () => {
    const path = buildDeterministicPhotoPath('uuid-est-01', '01234567');
    assert.equal(path, 'padron/uuid-est-01/01234567.jpg');

    assert.throws(() => {
      buildDeterministicPhotoPath('uuid-est-01', '1234'); // DNI inválido
    });
  });

  it('construye la estructura exacta del ZIP con exclusivamente el DNI como nombre de archivo JPG', () => {
    const zipEntry = buildZipPhotoEntryPath({
      dni: '01234567',
      grade: '1ro',
      section: 'A'
    });
    assert.equal(zipEntry, 'Fotografias_Estudiantes/1ro_A/01234567.jpg');
  });
});

describe('Fase 7: Seguridad, Permisos por Rol (RBAC) y Redacción de Datos Sensibles', () => {
  it('separa estrictamente permisos entre Administrador y Operador', () => {
    const adminCtx = { userId: 'u-admin', role: 'admin' as const, isActive: true };
    const operatorCtx = { userId: 'u-op', role: 'operator' as const, isActive: true };
    const suspendedCtx = { userId: 'u-susp', role: 'admin' as const, isActive: false };

    assert.equal(checkActionPermission(adminCtx, 'IMPORT_PADRON').allowed, true);
    assert.equal(checkActionPermission(adminCtx, 'DELETE_STUDENT').allowed, true);
    assert.equal(checkActionPermission(adminCtx, 'MANAGE_USERS').allowed, true);

    // Operador puede capturar, reemplazar y exportar, pero NO importar padrón ni borrar estudiantes ni gestionar usuarios
    assert.equal(checkActionPermission(operatorCtx, 'CAPTURE_PHOTO').allowed, true);
    assert.equal(checkActionPermission(operatorCtx, 'REPLACE_PHOTO').allowed, true);
    assert.equal(checkActionPermission(operatorCtx, 'EXPORT_PHOTOS').allowed, true);
    assert.equal(checkActionPermission(operatorCtx, 'IMPORT_PADRON').allowed, false);
    assert.equal(checkActionPermission(operatorCtx, 'DELETE_STUDENT').allowed, false);
    assert.equal(checkActionPermission(operatorCtx, 'MANAGE_USERS').allowed, false);

    // Usuario desactivado no tiene permiso para ninguna operación
    assert.equal(checkActionPermission(suspendedCtx, 'CAPTURE_PHOTO').allowed, false);
    assert.equal(checkActionPermission(suspendedCtx, 'IMPORT_PADRON').allowed, false);
  });

  it('redacta números de DNI de 8 dígitos y tokens JWT en mensajes técnicos de error', () => {
    const dirtyLog =
      'Fallo al procesar DNI 01234567 con token=abc123secret y JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig123';
    const sanitized = sanitizeLogMessage(dirtyLog);

    assert.equal(sanitized.includes('01234567'), false);
    assert.equal(sanitized.includes('abc123secret'), false);
    assert.equal(sanitized.includes('eyJhbGciOiJIUzI1NiJ9'), false);
    assert.equal(sanitized.includes('[DNI_PROTEGIDO]'), true);
  });

  it('bloquea automáticamente cualquier intento de usar una clave service_role en el frontend', () => {
    // Payload base64url para {"role":"service_role"} -> eyJyb2xlIjoic2VydmljZV9yb2xlIn0
    const fakeServiceRoleJwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature';
    const result = validateSupabaseEnvConfig(
      'https://mi-colegio.supabase.co',
      fakeServiceRoleJwt
    );

    assert.equal(result.isConfigured, false);
    assert.equal(Boolean(result.securityWarning), true);

    const secretPrefixRes = validateSupabaseEnvConfig(
      'https://hfauomdafjwknhxfuoce.supabase.co',
      'sb_secret_1234567890'
    );
    assert.equal(secretPrefixRes.isConfigured, false);
    assert.equal(Boolean(secretPrefixRes.securityWarning), true);

    const publishableRes = validateSupabaseEnvConfig(
      'https://hfauomdafjwknhxfuoce.supabase.co',
      'sb_publishable_32L6HtBqvj6NvLFoHdJovA_o0Mul52L'
    );
    assert.equal(publishableRes.isConfigured, true);
    assert.equal(publishableRes.securityWarning, null);
  });

  it('preserva las fotografías existentes cuando se vuelve a importar un padrón Excel actualizado', () => {
    // 1. Simular que la estudiante 00000101 ya cuenta con su fotografía registrada en la nube
    const initialStudents: Student[] = INITIAL_DEMO_STUDENTS.map((s) =>
      s.dni === '00000101'
        ? {
            ...s,
            photo_status: 'completada',
            photo_path: `padron/${s.id}/00000101.jpg`,
            photo_updated_at: '2026-03-15T10:00:00.000Z',
            photo_updated_by: '00000000-0000-4000-a000-000000000002'
          }
        : s
    );

    const targetStudent = initialStudents.find((s) => s.dni === '00000101')!;
    const existingMap = new Map(initialStudents.map((s) => [s.dni, s]));

    // 2. Reimportar un padrón Excel donde 00000101 cambia de sección ('A' -> 'C') y se añade una nueva estudiante
    const reimportRows = validateAndAnalyzeRows(
      [
        {
          rowIndex: 2,
          dni: '00000101',
          full_name: 'ALVAREZ MENDOZA, VALENTINA SOFIA (ACTUALIZADA)',
          grade: '1ro',
          section: 'C',
          existingAction: 'update'
        },
        {
          rowIndex: 3,
          dni: '09999888',
          full_name: 'NUEVA ESTUDIANTE, LUCIA',
          grade: '5to',
          section: 'B'
        }
      ],
      existingMap
    );

    const { nextRoster, insertedCount, updatedCount } = applyControlledRosterUpsert(
      initialStudents,
      reimportRows
    );
    assert.equal(insertedCount, 1);
    assert.equal(updatedCount, 1);

    // 3. Verificar que 00000101 actualizó su sección a 'C', conservó su fotografía intacta, y que las demás estudiantes no se eliminaron
    const updatedTarget = nextRoster.find((s) => s.dni === '00000101')!;
    assert.equal(updatedTarget.section, 'C');
    assert.equal(updatedTarget.photo_status, 'completada');
    assert.equal(
      updatedTarget.photo_path,
      `padron/${targetStudent.id}/00000101.jpg`
    );
    assert.equal(nextRoster.length, initialStudents.length + 1);
  });
});

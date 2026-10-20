import type { ImportBatch, Profile, Student } from '../types/database.ts';

/**
 * Datos de demostración claramente ficticios.
 * Ninguno de estos DNI (00000101 - 00000501) ni nombres corresponde a estudiantes reales.
 * Se utilizan exclusivamente cuando el desarrollador o evaluador ejecuta la aplicación
 * localmente antes de conectar su proyecto de Supabase.
 */
export const DEMO_PROFILES: Profile[] = [
  {
    id: '00000000-0000-4000-a000-000000000001',
    email: 'admin.demo@institucion.edu.pe',
    full_name: 'Coordinador General (Demo)',
    role: 'admin',
    is_active: true,
    created_at: '2026-03-01T08:00:00.000Z'
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    email: 'operador.demo@institucion.edu.pe',
    full_name: 'Operador Fotográfico 01 (Demo)',
    role: 'operator',
    is_active: true,
    created_at: '2026-03-02T09:30:00.000Z'
  }
];

export const INITIAL_DEMO_STUDENTS: Student[] = [
  {
    id: '10000000-0000-4000-a000-000000000101',
    dni: '00000101',
    full_name: 'ALVAREZ MENDOZA, VALENTINA SOFIA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '1ro',
    section: 'A',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000102',
    dni: '00000102',
    full_name: 'BENITES CASTRO, CAMILA FERNANDA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '1ro',
    section: 'A',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000103',
    dni: '00000103',
    full_name: 'CACERES QUISPE, LUCIA GABRIELA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '1ro',
    section: 'A',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000104',
    dni: '00000104',
    full_name: 'DELGADO ROJAS, MARIANA PAULA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '1ro',
    section: 'B',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000105',
    dni: '00000105',
    full_name: 'ESPINOZA VARGAS, DANIELA ALEJANDRA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '1ro',
    section: 'B',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000201',
    dni: '00000201',
    full_name: 'FLORES HUAMAN, XIMENA VICTORIA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '2do',
    section: 'A',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000202',
    dni: '00000202',
    full_name: 'GARCIA PAREDES, RENATA ISABELLA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '2do',
    section: 'A',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000301',
    dni: '00000301',
    full_name: 'HERRERA SALAZAR, ANTONELLA MIA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '3ro',
    section: 'A',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000401',
    dni: '00000401',
    full_name: 'IBAÑEZ TORRES, VALERIA NICOLE (FICTICIO)',
    education_level: 'Secundaria',
    grade: '4to',
    section: 'A',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  },
  {
    id: '10000000-0000-4000-a000-000000000501',
    dni: '00000501',
    full_name: 'JIMENEZ RAMIREZ, ANDREA CAROLINA (FICTICIO)',
    education_level: 'Secundaria',
    grade: '5to',
    section: 'A',
    photo_path: null,
    photo_status: 'pendiente',
    photo_updated_at: null,
    photo_updated_by: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z'
  }
];

export const INITIAL_DEMO_BATCHES: ImportBatch[] = [
  {
    id: '20000000-0000-4000-a000-000000000001',
    file_name: 'padron_ficticio_inicial_2026.xlsx',
    imported_by: '00000000-0000-4000-a000-000000000001',
    total_rows: 10,
    inserted_count: 10,
    updated_count: 0,
    skipped_count: 0,
    error_count: 0,
    notes: 'Carga inicial de demostración con datos ficticios',
    created_at: '2026-03-01T10:00:00.000Z'
  }
];

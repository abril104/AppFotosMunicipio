import type { Student } from '../types/database.ts';
import type { AcademicFilters, DashboardStats, GradeSectionStats } from '../types/domain.ts';

/**
 * Catálogo oficial institucional para Secundaria:
 * - Grados: 1ro (Primero) a 5to (Quinto)
 * - Secciones de 1er grado (1ro): A hasta M (13 secciones)
 * - Secciones de 2do a 5to grado: A hasta I (9 secciones)
 */
export const SECUNDARIA_GRADES = ['1ro', '2do', '3ro', '4to', '5to'] as const;

export const SECTIONS_1RO = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'
] as const;

export const SECTIONS_2DO_TO_5TO = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'
] as const;

export const GRADE_DISPLAY_NAMES: Record<string, string> = {
  '1ro': '1ro (Primero)',
  '2do': '2do (Segundo)',
  '3ro': '3ro (Tercero)',
  '4to': '4to (Cuarto)',
  '5to': '5to (Quinto)'
};

/**
 * Devuelve las secciones oficiales permitidas según el grado seleccionado.
 * - Para 1ro (o Todos): A hasta M
 * - Para 2do, 3ro, 4to y 5to: A hasta I
 */
export function getStandardSectionsForGrade(grade: string): string[] {
  const clean = grade.trim();
  if (clean === '1ro' || clean === 'ALL' || !clean) {
    return [...SECTIONS_1RO];
  }
  return [...SECTIONS_2DO_TO_5TO];
}

/**
 * Obtiene la lista ordenada de niveles educativos disponibles en el padrón.
 */
export function getAvailableLevels(students: Student[]): string[] {
  const set = new Set<string>(['Secundaria']);
  for (const s of students) {
    const lvl = (s.education_level || 'Secundaria').trim();
    if (lvl) set.add(lvl);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/**
 * Obtiene la lista ordenada de grados (1ro a 5to de Secundaria más cualquier otro importado).
 */
export function getAvailableGrades(students: Student[], educationLevel = 'ALL'): string[] {
  const set = new Set<string>(SECUNDARIA_GRADES);
  for (const s of students) {
    const lvl = (s.education_level || 'Secundaria').trim();
    if (educationLevel !== 'ALL' && lvl !== educationLevel) continue;
    if (s.grade?.trim()) {
      set.add(s.grade.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/**
 * Obtiene la lista ordenada de secciones dependientes del grado seleccionado:
 * - Si el grado es 1ro (o ALL): incluye de la A a la M.
 * - Si el grado es 2do, 3ro, 4to o 5to: incluye de la A a la I (más cualquier sección adicional existente en BD para ese grado).
 */
export function getAvailableSections(
  students: Student[],
  grade = 'ALL',
  educationLevel = 'ALL'
): string[] {
  const standard = getStandardSectionsForGrade(grade);
  const set = new Set<string>(standard);

  for (const s of students) {
    const lvl = (s.education_level || 'Secundaria').trim();
    if (educationLevel !== 'ALL' && lvl !== educationLevel) continue;
    if (grade !== 'ALL' && s.grade.trim() !== grade) continue;
    if (s.section?.trim()) {
      set.add(s.section.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/**
 * Filtra y ordena alfabéticamente el padrón de estudiantes según los criterios activos.
 */
export function filterAndSortStudents(
  students: Student[],
  filters: AcademicFilters
): Student[] {
  const query = filters.searchQuery.trim().toLowerCase();

  const filtered = students.filter((s) => {
    const lvl = (s.education_level || 'Secundaria').trim();
    if (filters.educationLevel !== 'ALL' && lvl !== filters.educationLevel) {
      return false;
    }
    if (filters.grade !== 'ALL' && s.grade.trim() !== filters.grade) {
      return false;
    }
    if (filters.section !== 'ALL' && s.section.trim() !== filters.section) {
      return false;
    }
    if (filters.statusFilter !== 'ALL' && s.photo_status !== filters.statusFilter) {
      return false;
    }
    if (query.length > 0) {
      const matchDni = s.dni.toLowerCase().includes(query);
      const matchName = s.full_name.toLowerCase().includes(query);
      if (!matchDni && !matchName) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    const comparison = a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' });
    return filters.sortOrder === 'desc' ? -comparison : comparison;
  });
}

/**
 * Calcula las estadísticas de avance para un subconjunto o para el padrón completo.
 * Las estudiantes con estado 'retirada' (trasladadas a otra I.E.) se contabilizan por separado
 * y se descuentan del total activo para que la sección pueda alcanzar el 100% de avance real.
 */
export function calculateProgressMetrics(students: Student[]): {
  total: number;
  photographed: number;
  pending: number;
  retired: number;
  percentage: number;
} {
  const total = students.length;
  if (total === 0) {
    return { total: 0, photographed: 0, pending: 0, retired: 0, percentage: 0 };
  }
  const retired = students.filter((s) => s.photo_status === 'retirada').length;
  const photographed = students.filter(
    (s) => s.photo_status === 'completada' && Boolean(s.photo_path)
  ).length;
  const activeTotal = Math.max(0, total - retired);
  const pending = Math.max(0, activeTotal - photographed);
  const percentage =
    activeTotal > 0 ? Math.round((photographed / activeTotal) * 1000) / 10 : 0;

  return { total, photographed, pending, retired, percentage };
}

/**
 * Genera el resumen completo para el Panel Principal (Dashboard):
 * avance general, desglose por grado y sección y últimas fotografías registradas.
 */
export function computeDashboardStats(students: Student[]): DashboardStats {
  const overall = calculateProgressMetrics(students);

  const groupsMap = new Map<
    string,
    {
      educationLevel: string;
      grade: string;
      section: string;
      total: number;
      completed: number;
      retired: number;
    }
  >();

  for (const s of students) {
    const educationLevel = (s.education_level || 'Secundaria').trim();
    const grade = s.grade.trim();
    const section = s.section.trim();
    const key = `${educationLevel}||${grade}||${section}`;

    const group = groupsMap.get(key) || {
      educationLevel,
      grade,
      section,
      total: 0,
      completed: 0,
      retired: 0
    };

    group.total += 1;
    if (s.photo_status === 'retirada') {
      group.retired += 1;
    } else if (s.photo_status === 'completada' && s.photo_path) {
      group.completed += 1;
    }
    groupsMap.set(key, group);
  }

  const byGradeSection: GradeSectionStats[] = Array.from(groupsMap.values())
    .map((g) => {
      const activeTotal = Math.max(0, g.total - g.retired);
      const pending = Math.max(0, activeTotal - g.completed);
      const percentage =
        activeTotal > 0 ? Math.round((g.completed / activeTotal) * 1000) / 10 : 0;
      return {
        educationLevel: g.educationLevel,
        grade: g.grade,
        section: g.section,
        total: g.total,
        completed: g.completed,
        pending,
        retired: g.retired,
        percentage
      };
    })
    .sort((a, b) => {
      const cmpLevel = a.educationLevel.localeCompare(b.educationLevel, 'es', { numeric: true });
      if (cmpLevel !== 0) return cmpLevel;
      const cmpGrade = a.grade.localeCompare(b.grade, 'es', { numeric: true });
      if (cmpGrade !== 0) return cmpGrade;
      return a.section.localeCompare(b.section, 'es', { numeric: true });
    });

  const recentPhotos = students
    .filter((s) => s.photo_status === 'completada' && Boolean(s.photo_path) && Boolean(s.photo_updated_at))
    .sort((a, b) => {
      const dateA = new Date(a.photo_updated_at || 0).getTime();
      const dateB = new Date(b.photo_updated_at || 0).getTime();
      return dateB - dateA;
    })
    .slice(0, 8);

  return {
    totalStudents: overall.total,
    completedPhotos: overall.photographed,
    pendingPhotos: overall.pending,
    retiredStudents: overall.retired,
    overallPercentage: overall.percentage,
    byGradeSection,
    recentPhotos
  };
}

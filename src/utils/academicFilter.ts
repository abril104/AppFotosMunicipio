import type { Student } from '../types/database.ts';
import type { AcademicFilters, DashboardStats, GradeSectionStats } from '../types/domain.ts';

/**
 * Obtiene la lista ordenada de niveles educativos disponibles en el padrón.
 */
export function getAvailableLevels(students: Student[]): string[] {
  const set = new Set<string>();
  for (const s of students) {
    const lvl = (s.education_level || 'Secundaria').trim();
    if (lvl) set.add(lvl);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/**
 * Obtiene la lista ordenada de grados dependientes del nivel educativo seleccionado.
 */
export function getAvailableGrades(students: Student[], educationLevel = 'ALL'): string[] {
  const set = new Set<string>();
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
 * Obtiene la lista ordenada de secciones dependientes del nivel y grado seleccionados.
 */
export function getAvailableSections(
  students: Student[],
  grade = 'ALL',
  educationLevel = 'ALL'
): string[] {
  const set = new Set<string>();
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
 */
export function calculateProgressMetrics(students: Student[]): {
  total: number;
  photographed: number;
  pending: number;
  percentage: number;
} {
  const total = students.length;
  if (total === 0) {
    return { total: 0, photographed: 0, pending: 0, percentage: 0 };
  }
  const photographed = students.filter((s) => s.photo_status === 'completada' && Boolean(s.photo_path)).length;
  const pending = total - photographed;
  const percentage = Math.round((photographed / total) * 1000) / 10; // 1 decimal (ej. 85.4%)

  return { total, photographed, pending, percentage };
}

/**
 * Genera el resumen completo para el Panel Principal (Dashboard):
 * avance general, desglose por grado y sección y últimas fotografías registradas.
 */
export function computeDashboardStats(students: Student[]): DashboardStats {
  const overall = calculateProgressMetrics(students);

  const groupsMap = new Map<string, {
    educationLevel: string;
    grade: string;
    section: string;
    total: number;
    completed: number;
  }>();

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
      completed: 0
    };

    group.total += 1;
    if (s.photo_status === 'completada' && s.photo_path) {
      group.completed += 1;
    }
    groupsMap.set(key, group);
  }

  const byGradeSection: GradeSectionStats[] = Array.from(groupsMap.values())
    .map((g) => {
      const pending = g.total - g.completed;
      const percentage = g.total > 0 ? Math.round((g.completed / g.total) * 1000) / 10 : 0;
      return {
        educationLevel: g.educationLevel,
        grade: g.grade,
        section: g.section,
        total: g.total,
        completed: g.completed,
        pending,
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
    overallPercentage: overall.percentage,
    byGradeSection,
    recentPhotos
  };
}

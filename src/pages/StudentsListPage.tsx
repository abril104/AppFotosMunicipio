import React, { useMemo, useState } from 'react';
import {
  Search,
  Camera,
  Eye,
  RefreshCw,
  Trash2,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Clock,
  Users
} from 'lucide-react';
import type { Profile, Student } from '../types/database.ts';
import type { AcademicFilters } from '../types/domain.ts';
import {
  calculateProgressMetrics,
  filterAndSortStudents,
  getAvailableGrades,
  getAvailableLevels,
  getAvailableSections
} from '../utils/academicFilter.ts';
import { StudentAvatar } from '../components/ui/StudentAvatar.tsx';
import { StatusBadge } from '../components/ui/Badge.tsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx';

interface StudentsListPageProps {
  students: Student[];
  profile: Profile;
  filters: AcademicFilters;
  onChangeFilters: (next: AcademicFilters) => void;
  onOpenCamera: (student: Student, currentFilteredList: Student[]) => void;
  onViewPhoto: (student: Student) => void;
  onDeleteStudent: (student: Student) => Promise<void>;
}

export const StudentsListPage: React.FC<StudentsListPageProps> = ({
  students,
  profile,
  filters,
  onChangeFilters,
  onOpenCamera,
  onViewPhoto,
  onDeleteStudent
}) => {
  const [studentToReplaceConfirm, setStudentToReplaceConfirm] = useState<Student | null>(null);
  const [studentToDeleteConfirm, setStudentToDeleteConfirm] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Filtros dependientes generados a partir del padrón importado
  const levels = useMemo(() => getAvailableLevels(students), [students]);
  const grades = useMemo(
    () => getAvailableGrades(students, filters.educationLevel),
    [students, filters.educationLevel]
  );
  const sections = useMemo(
    () => getAvailableSections(students, filters.grade, filters.educationLevel),
    [students, filters.grade, filters.educationLevel]
  );

  // Estudiantes filtradas por Nivel/Grado/Sección (para métricas de la sección seleccionada)
  const academicScopedStudents = useMemo(() => {
    return filterAndSortStudents(students, {
      ...filters,
      searchQuery: '',
      statusFilter: 'ALL'
    });
  }, [students, filters]);

  const sectionMetrics = useMemo(
    () => calculateProgressMetrics(academicScopedStudents),
    [academicScopedStudents]
  );

  // Lista final aplicando también buscador por nombre/DNI y filtro todas/fotografiadas/pendientes
  const filteredStudents = useMemo(
    () => filterAndSortStudents(students, filters),
    [students, filters]
  );

  const handleLevelChange = (educationLevel: string) => {
    onChangeFilters({
      ...filters,
      educationLevel,
      grade: 'ALL',
      section: 'ALL'
    });
  };

  const handleGradeChange = (grade: string) => {
    onChangeFilters({
      ...filters,
      grade,
      section: 'ALL'
    });
  };

  const handleConfirmDelete = async () => {
    if (!studentToDeleteConfirm) return;
    setDeleting(true);
    try {
      await onDeleteStudent(studentToDeleteConfirm);
    } finally {
      setDeleting(false);
      setStudentToDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Encabezado y botón rápido para iniciar sesión continua de fotografía */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Padrón de Estudiantes y Registro Fotográfico
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Filtre por grado y sección, busque por nombre o DNI y capture fotografías en formato JPG
          </p>
        </div>

        {filteredStudents.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const firstPending =
                filteredStudents.find((s) => s.photo_status === 'pendiente') ||
                filteredStudents[0];
              onOpenCamera(firstPending, filteredStudents);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>
              Iniciar captura en lista actual (
              {filteredStudents.filter((s) => s.photo_status === 'pendiente').length} pendientes)
            </span>
          </button>
        )}
      </div>

      {/* Panel de Filtros Académicos Dependientes y Buscador */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Nivel educativo (si está disponible) */}
          <div>
            <label
              htmlFor="filter-level"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Nivel educativo
            </label>
            <select
              id="filter-level"
              value={filters.educationLevel}
              onChange={(e) => handleLevelChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="ALL">Todos los niveles</option>
              {levels.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          {/* Grado dependiente */}
          <div>
            <label
              htmlFor="filter-grade"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Grado
            </label>
            <select
              id="filter-grade"
              value={filters.grade}
              onChange={(e) => handleGradeChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="ALL">Todos los grados</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Sección dependiente */}
          <div>
            <label
              htmlFor="filter-section"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Sección
            </label>
            <select
              id="filter-section"
              value={filters.section}
              onChange={(e) =>
                onChangeFilters({ ...filters, section: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="ALL">Todas las secciones</option>
              {sections.map((sec) => (
                <option key={sec} value={sec}>
                  Sección "{sec}"
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por estado de fotografía */}
          <div>
            <label
              htmlFor="filter-status"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Estado fotográfico
            </label>
            <div className="relative">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <select
                id="filter-status"
                value={filters.statusFilter}
                onChange={(e) =>
                  onChangeFilters({
                    ...filters,
                    statusFilter: e.target.value as AcademicFilters['statusFilter']
                  })
                }
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="ALL">Ver todas</option>
                <option value="pendiente">Solo pendientes</option>
                <option value="completada">Solo fotografiadas</option>
              </select>
            </div>
          </div>

          {/* Orden alfabético */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Orden por nombre
            </label>
            <button
              type="button"
              onClick={() =>
                onChangeFilters({
                  ...filters,
                  sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc'
                })
              }
              className="w-full flex items-center justify-between px-3 py-2 text-sm border border-slate-300 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-medium cursor-pointer"
            >
              <span>{filters.sortOrder === 'asc' ? 'Alfabético (A → Z)' : 'Alfabético (Z → A)'}</span>
              <ArrowUpDown className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Buscador por nombre completo o DNI */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="search"
            value={filters.searchQuery}
            onChange={(e) =>
              onChangeFilters({ ...filters, searchQuery: e.target.value })
            }
            placeholder="Buscar estudiante por apellidos, nombres o número de DNI (8 dígitos)..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Barra de indicadores de avance del grupo seleccionado */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
              <Users className="w-4 h-4 text-slate-500" />
              Total estudiantes: <strong>{sectionMetrics.total}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Total fotografiado: <strong>{sectionMetrics.photographed}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
              <Clock className="w-4 h-4 text-amber-600" />
              Total pendiente: <strong>{sectionMetrics.pending}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3 min-w-[200px]">
            <span className="text-xs font-bold text-slate-700">
              Avance: {sectionMetrics.percentage}%
            </span>
            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, sectionMetrics.percentage)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Estado vacío si no hay coincidencias */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-base font-semibold text-slate-800">
            No se encontraron estudiantes con los filtros seleccionados
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Pruebe limpiando el buscador o cambiando la selección de grado, sección o estado.
          </p>
        </div>
      ) : (
        <>
          {/* VISTA DE TABLA PARA LAPTOP Y ESCRITORIO */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Fotografía</th>
                  <th className="py-3.5 px-4">Nombre completo</th>
                  <th className="py-3.5 px-4">DNI</th>
                  <th className="py-3.5 px-4">Grado y Sección</th>
                  <th className="py-3.5 px-4">Estado</th>
                  <th className="py-3.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStudents.map((student) => {
                  const isCompleted =
                    student.photo_status === 'completada' && Boolean(student.photo_path);

                  return (
                    <tr
                      key={student.id}
                      className={
                        isCompleted
                          ? 'bg-emerald-50/35 hover:bg-emerald-50/70 transition-colors'
                          : 'bg-white hover:bg-slate-50 transition-colors'
                      }
                    >
                      <td className="py-3 px-4">
                        <StudentAvatar
                          photoPath={student.photo_path}
                          fullName={student.full_name}
                          updatedAt={student.photo_updated_at}
                          size="md"
                          onClick={isCompleted ? () => onViewPhoto(student) : undefined}
                        />
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {student.full_name}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                        {student.dni}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-800">
                          {student.grade} "{student.section}"
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge
                          state={isCompleted ? 'guardada' : 'pendiente'}
                          size="sm"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {!isCompleted ? (
                            <button
                              type="button"
                              onClick={() => onOpenCamera(student, filteredStudents)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-2xs cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Tomar fotografía</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onViewPhoto(student)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver fotografía</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setStudentToReplaceConfirm(student)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold cursor-pointer"
                                title="Repetir o reemplazar fotografía existente"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Reemplazar</span>
                              </button>
                            </>
                          )}

                          {profile.role === 'admin' && (
                            <button
                              type="button"
                              onClick={() => setStudentToDeleteConfirm(student)}
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Eliminar registro del padrón"
                              aria-label={`Eliminar registro de ${student.full_name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* VISTA DE TARJETAS PARA DISPOSITIVOS MÓVILES */}
          <div className="md:hidden space-y-3">
            {filteredStudents.map((student) => {
              const isCompleted =
                student.photo_status === 'completada' && Boolean(student.photo_path);

              return (
                <div
                  key={student.id}
                  className={`p-4 rounded-2xl border shadow-2xs ${
                    isCompleted
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <StudentAvatar
                      photoPath={student.photo_path}
                      fullName={student.full_name}
                      updatedAt={student.photo_updated_at}
                      size="md"
                      onClick={isCompleted ? () => onViewPhoto(student) : undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900 leading-snug">
                          {student.full_name}
                        </p>
                        <StatusBadge
                          state={isCompleted ? 'guardada' : 'pendiente'}
                          size="sm"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-600">
                        <span className="font-mono font-semibold text-slate-800">
                          DNI: {student.dni}
                        </span>
                        <span>•</span>
                        <span>
                          Grado {student.grade} - Sección "{student.section}"
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-slate-200/70 flex items-center gap-2">
                    {!isCompleted ? (
                      <button
                        type="button"
                        onClick={() => onOpenCamera(student, filteredStudents)}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-2xs"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Tomar fotografía</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onViewPhoto(student)}
                          className="flex-1 py-2 px-3 rounded-xl bg-white text-slate-700 border border-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Ver fotografía</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setStudentToReplaceConfirm(student)}
                          className="flex-1 py-2 px-3 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span>Reemplazar</span>
                        </button>
                      </>
                    )}

                    {profile.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => setStudentToDeleteConfirm(student)}
                        className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600"
                        aria-label={`Eliminar registro de ${student.full_name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Diálogo de confirmación antes de repetir/reemplazar una fotografía existente */}
      <ConfirmDialog
        open={Boolean(studentToReplaceConfirm)}
        title="¿Repetir o reemplazar fotografía?"
        description={
          studentToReplaceConfirm
            ? `La estudiante ${studentToReplaceConfirm.full_name} (DNI: ${studentToReplaceConfirm.dni}) ya tiene una fotografía guardada. ¿Desea abrir la cámara para tomar una nueva fotografía de reemplazo?`
            : ''
        }
        confirmLabel="Abrir cámara para reemplazar"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={() => {
          if (studentToReplaceConfirm) {
            const target = studentToReplaceConfirm;
            setStudentToReplaceConfirm(null);
            onOpenCamera(target, filteredStudents);
          }
        }}
        onCancel={() => setStudentToReplaceConfirm(null)}
      />

      {/* Diálogo de confirmación antes de eliminar un registro del padrón */}
      <ConfirmDialog
        open={Boolean(studentToDeleteConfirm)}
        title="¿Eliminar estudiante del padrón?"
        description={
          studentToDeleteConfirm
            ? `Está a punto de eliminar el registro de ${studentToDeleteConfirm.full_name} (DNI: ${studentToDeleteConfirm.dni}). Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Sí, eliminar registro"
        cancelLabel="Cancelar"
        variant="danger"
        isLoading={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setStudentToDeleteConfirm(null)}
      />
    </div>
  );
};

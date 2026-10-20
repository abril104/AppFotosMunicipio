import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  Camera,
  FolderArchive,
  ArrowRight
} from 'lucide-react';
import type { Profile, Student } from '../types/database.ts';
import { computeDashboardStats } from '../utils/academicFilter.ts';
import { StudentAvatar } from '../components/ui/StudentAvatar.tsx';
import { StatusBadge } from '../components/ui/Badge.tsx';

interface DashboardPageProps {
  students: Student[];
  profile: Profile;
  onOpenStudentPhoto: (student: Student) => void;
  onNavigateToSection: (grade: string, section: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  students,
  profile,
  onOpenStudentPhoto,
  onNavigateToSection
}) => {
  const navigate = useNavigate();
  const stats = useMemo(() => computeDashboardStats(students), [students]);

  return (
    <div className="space-y-6">
      {/* Cabecera e indicadores de acción rápida */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Panel Principal de Avance Fotográfico
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Resumen institucional actualizado en tiempo real según el padrón en la nube
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {profile.role === 'admin' && (
            <button
              type="button"
              onClick={() => navigate('/importar')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs sm:text-sm font-semibold shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-600" />
              <span>Importar padrón</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/estudiantes')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>Registrar fotografías</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/exportar')}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
          >
            <FolderArchive className="w-4 h-4" />
            <span>Exportar ZIP</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de métricas generales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Importadas
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              {stats.totalStudents}
            </p>
            <p className="text-xs text-slate-500 mt-1">Estudiantes en el padrón</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-100 text-slate-700">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-2xs flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Fotografías Completadas
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-700 mt-1">
              {stats.completedPhotos}
            </p>
            <p className="text-xs text-emerald-600 mt-1">Almacenadas en bucket privado</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-2xs flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Total Pendientes
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-amber-700 mt-1">
              {stats.pendingPhotos}
            </p>
            <p className="text-xs text-amber-600 mt-1">Por fotografiar</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-sky-200 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                Porcentaje de Avance
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                {stats.overallPercentage}%
              </p>
            </div>
            <div className="p-3 rounded-xl bg-sky-50 text-sky-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-sky-600 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, stats.overallPercentage)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Avance por grado y sección + Últimas fotografías registradas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Avance por Grado y Sección */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Avance por Grado y Sección
              </h3>
              <p className="text-xs text-slate-500">
                Seleccione una sección para abrir directamente su lista de estudiantes
              </p>
            </div>
          </div>

          {stats.byGradeSection.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Aún no se han importado registros en el padrón.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.byGradeSection.map((item) => (
                <div
                  key={`${item.educationLevel}-${item.grade}-${item.section}`}
                  className="px-5 py-3.5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        Grado {item.grade} • Sección "{item.section}"
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        {item.educationLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                      <span>Total: {item.total}</span>
                      <span className="text-emerald-700 font-medium">
                        Fotografiadas: {item.completed}
                      </span>
                      <span className="text-amber-700 font-medium">
                        Pendientes: {item.pending}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:w-56 justify-end">
                    <div className="flex-1 max-w-[120px]">
                      <div className="flex justify-between text-[11px] font-semibold text-slate-700 mb-1">
                        <span>{item.percentage}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            item.percentage === 100 ? 'bg-emerald-600' : 'bg-sky-600'
                          }`}
                          style={{ width: `${Math.min(100, item.percentage)}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigateToSection(item.grade, item.section)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer"
                    >
                      <span>Abrir</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimas fotografías registradas con acceso autorizado */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900">
              Últimas Fotografías Registradas
            </h3>
            <p className="text-xs text-slate-500">
              Vista previa mediante acceso privado autorizado
            </p>
          </div>

          {stats.recentPhotos.length === 0 ? (
            <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
              <Camera className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">
                Aún no se han registrado fotografías en esta jornada
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Diríjase a "Padrón y Cámara" para capturar la primera fotografía individual.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.recentPhotos.map((student) => (
                <div
                  key={student.id}
                  className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StudentAvatar
                      photoPath={student.photo_path}
                      fullName={student.full_name}
                      updatedAt={student.photo_updated_at}
                      size="sm"
                      onClick={() => onOpenStudentPhoto(student)}
                    />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                        {student.full_name}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        DNI: {student.dni} • {student.grade} "{student.section}"
                      </p>
                    </div>
                  </div>
                  <StatusBadge state="guardada" size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

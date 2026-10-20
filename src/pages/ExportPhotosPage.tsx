import React, { useEffect, useMemo, useState } from 'react';
import {
  FolderArchive,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  FolderTree,
  ShieldCheck
} from 'lucide-react';
import type { Profile, Student } from '../types/database.ts';
import type { ExportOptions, ExportProgress, ExportScope } from '../types/domain.ts';
import {
  calculateProgressMetrics,
  getAvailableGrades,
  getAvailableSections
} from '../utils/academicFilter.ts';
import {
  exportStudentPhotosToZip,
  selectStudentsForExport
} from '../services/exportService.ts';
import { sanitizeFolderToken } from '../utils/photoProcessor.ts';
import { normalizeError } from '../utils/errorHandler.ts';
import { useToast } from '../components/ui/ToastProvider.tsx';

interface ExportPhotosPageProps {
  profile: Profile;
  students: Student[];
}

export const ExportPhotosPage: React.FC<ExportPhotosPageProps> = ({
  profile,
  students
}) => {
  const { showToast } = useToast();

  const grades = useMemo(() => getAvailableGrades(students, 'ALL'), [students]);
  const [scope, setScope] = useState<ExportScope>('section');
  const [selectedGrade, setSelectedGrade] = useState<string>(grades[0] || '');
  const sections = useMemo(
    () => getAvailableSections(students, selectedGrade || 'ALL', 'ALL'),
    [students, selectedGrade]
  );
  const [selectedSection, setSelectedSection] = useState<string>(sections[0] || '');
  const [includePendingReport, setIncludePendingReport] = useState<boolean>(false);
  const [batchSize, setBatchSize] = useState<number>(200);

  const [exporting, setExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  useEffect(() => {
    if (!selectedGrade && grades.length > 0) {
      setSelectedGrade(grades[0]);
    }
  }, [grades, selectedGrade]);

  useEffect(() => {
    if (sections.length > 0 && !sections.includes(selectedSection)) {
      setSelectedSection(sections[0]);
    }
  }, [sections, selectedSection]);

  const currentExportOptions: ExportOptions = useMemo(
    () => ({
      scope,
      grade: selectedGrade,
      section: selectedSection,
      includePendingReport,
      batchSize
    }),
    [scope, selectedGrade, selectedSection, includePendingReport, batchSize]
  );

  const targetStudents = useMemo(
    () => selectStudentsForExport(students, currentExportOptions),
    [students, currentExportOptions]
  );

  const targetMetrics = useMemo(
    () => calculateProgressMetrics(targetStudents),
    [targetStudents]
  );

  const handleStartExport = async () => {
    setExporting(true);
    setProgress(null);

    try {
      const result = await exportStudentPhotosToZip(
        profile,
        students,
        currentExportOptions,
        (liveProgress) => {
          setProgress(liveProgress);
        }
      );

      if (result.failedCount === 0) {
        showToast(
          'success',
          'Exportación ZIP completada',
          `Se descargaron ${result.exportedCount} fotografía(s) en formato JPG nombradas por DNI.`
        );
      } else {
        showToast(
          'info',
          'Exportación finalizada con observaciones',
          `Exportadas: ${result.exportedCount} • Fallidas: ${result.failedCount}`
        );
      }
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'No se pudo realizar la exportación', normalized.userMessage);
    } finally {
      setExporting(false);
    }
  };

  const sampleFolder =
    scope === 'section' && selectedGrade && selectedSection
      ? `${sanitizeFolderToken(selectedGrade)}_${sanitizeFolderToken(selectedSection)}`
      : scope === 'grade' && selectedGrade
      ? `${sanitizeFolderToken(selectedGrade)}_${sanitizeFolderToken(sections[0] || 'A')}`
      : '1ro_A';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Exportación de Fotografías en Formato JPG (ZIP)
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Descargue las fotografías por sección, por grado o de todo el padrón con el número de DNI como único nombre de archivo
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Configuración de la exportación */}
        <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              1. Seleccione el alcance de la exportación
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {(
                [
                  {
                    id: 'section',
                    title: 'Una sección',
                    desc: 'Exportar un grado y sección específicos'
                  },
                  {
                    id: 'grade',
                    title: 'Todo un grado',
                    desc: 'Todas las secciones de un grado'
                  },
                  {
                    id: 'all',
                    title: 'Todo el padrón',
                    desc: 'Todos los grados y secciones'
                  }
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setScope(option.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    scope === option.id
                      ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <span className="text-xs sm:text-sm font-bold block">{option.title}</span>
                  <span
                    className={`text-[11px] mt-1 block ${
                      scope === option.id ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {option.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Selectores de grado y sección según alcance */}
          {scope !== 'all' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Grado académico
                </label>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-white text-slate-900"
                >
                  {grades.map((g) => (
                    <option key={g} value={g}>
                      Grado {g}
                    </option>
                  ))}
                </select>
              </div>

              {scope === 'section' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Sección
                  </label>
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-white text-slate-900"
                  >
                    {sections.map((sec) => (
                      <option key={sec} value={sec}>
                        Sección "{sec}"
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Opciones de informe de pendientes y lotes */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h3 className="text-base font-bold text-slate-900">
              2. Opciones de contenido y rendimiento
            </h3>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includePendingReport}
                onChange={(e) => setIncludePendingReport(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <div>
                <span className="text-xs sm:text-sm font-semibold text-slate-900 block">
                  Generar e incluir también informe de estudiantes pendientes (Informe_Pendientes.csv)
                </span>
                <span className="text-xs text-slate-500 mt-0.5 block">
                  Si no se marca, el archivo ZIP contendrá exclusivamente los archivos .jpg de las estudiantes fotografiadas.
                </span>
              </div>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <span className="text-xs sm:text-sm font-semibold text-slate-900 block">
                  Estrategia por lotes para volúmenes grandes
                </span>
                <span className="text-xs text-slate-500">
                  Divide automáticamente en varios archivos ZIP si el padrón supera este límite de fotos por archivo:
                </span>
              </div>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                <option value={100}>100 fotos por ZIP</option>
                <option value={200}>200 fotos por ZIP (Recomendado)</option>
                <option value={350}>350 fotos por ZIP</option>
              </select>
            </div>
          </div>

          {/* Botón de ejecución y barra de progreso */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => void handleStartExport()}
              disabled={
                exporting ||
                (targetMetrics.photographed === 0 && !includePendingReport)
              }
              className="w-full py-3.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-sm sm:text-base shadow-md flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generando exportación ZIP...</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>
                    Descargar ZIP ({targetMetrics.photographed} fotografía
                    {targetMetrics.photographed === 1 ? '' : 's'} JPG)
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Indicador de progreso y resumen post-exportación */}
          {progress && (
            <div
              className={`p-4 rounded-xl border space-y-2.5 ${
                progress.phase === 'completed' && progress.failedCount === 0
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : progress.phase === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-sky-50 border-sky-200 text-sky-900'
              }`}
            >
              <div className="flex items-center justify-between text-xs sm:text-sm font-bold">
                <span className="flex items-center gap-2">
                  {progress.phase === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                  )}
                  {progress.message}
                </span>
                {progress.total > 0 && (
                  <span>
                    {Math.round((progress.current / progress.total) * 100)}%
                  </span>
                )}
              </div>

              {progress.total > 0 && (
                <div className="w-full h-2 bg-white/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-200"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((progress.current / progress.total) * 100)
                      )}%`
                    }}
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-black/10 text-xs">
                <div>
                  <span className="opacity-75 block">Exportadas (JPG):</span>
                  <strong className="text-sm">{progress.exportedCount}</strong>
                </div>
                <div>
                  <span className="opacity-75 block">Pendientes omitidas:</span>
                  <strong className="text-sm">{progress.skippedPendingCount}</strong>
                </div>
                <div>
                  <span className="opacity-75 block">Fallidas:</span>
                  <strong className="text-sm">{progress.failedCount}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Vista previa de la estructura del archivo ZIP y resumen de selección */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <FolderArchive className="w-5 h-5 text-sky-600" />
              <h3 className="text-base font-bold text-slate-900">
                Resumen de la Selección Actual
              </h3>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  Total Selección
                </span>
                <span className="text-xl font-bold text-slate-900">
                  {targetMetrics.total}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[11px] font-semibold text-emerald-800 block">
                  Listas (JPG)
                </span>
                <span className="text-xl font-bold text-emerald-700">
                  {targetMetrics.photographed}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-[11px] font-semibold text-amber-800 block">
                  Pendientes
                </span>
                <span className="text-xl font-bold text-amber-700">
                  {targetMetrics.pending}
                </span>
              </div>
            </div>

            {targetMetrics.photographed === 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Aún no hay estudiantes con fotografía registrada en este grupo. Capture al menos una fotografía en "Padrón y Cámara" para exportar imágenes JPG.
                </span>
              </div>
            )}
          </div>

          <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl border border-slate-800 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-sky-400">
              <FolderTree className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                Estructura garantizada del archivo ZIP
              </h3>
            </div>

            <pre className="text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-300 overflow-x-auto leading-relaxed">
{`Fotografias_Estudiantes/
  └── ${sampleFolder}/
        ├── 01234567.jpg
        ├── 23456789.jpg
        └── ...${
          includePendingReport
            ? `\n  └── Informe_Pendientes.csv`
            : ''
        }`}
            </pre>

            <div className="space-y-1.5 text-[11px] text-slate-400 pt-1">
              <p className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  El nombre de cada imagen es <strong>exclusivamente el DNI</strong> (8 dígitos) + <code>.jpg</code>.
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>
                  No se incluyen nombres personales en los archivos JPG ni credenciales en el ZIP.
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

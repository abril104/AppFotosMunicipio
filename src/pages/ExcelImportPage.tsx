import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Download,
  History,
  Ban,
  RotateCcw,
  ShieldAlert
} from 'lucide-react';
import type { ImportBatch, Profile, Student } from '../types/database.ts';
import type {
  ColumnMapping,
  ExistingStudentAction,
  ParsedExcelRow
} from '../types/domain.ts';
import {
  autoDetectColumns,
  canConfirmImport,
  computeImportSummary,
  validateAndAnalyzeRows
} from '../utils/excelValidator.ts';
import { importValidatedExcelRows } from '../services/studentService.ts';
import { normalizeError } from '../utils/errorHandler.ts';
import { useToast } from '../components/ui/ToastProvider.tsx';

interface ExcelImportPageProps {
  profile: Profile;
  existingStudents: Student[];
  importBatches: ImportBatch[];
  onImportCompleted: () => Promise<void>;
}

export const ExcelImportPage: React.FC<ExcelImportPageProps> = ({
  profile,
  existingStudents,
  importBatches,
  onImportCompleted
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string>('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawSheetRecords, setRawSheetRecords] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    dni: '',
    fullName: '',
    grade: '',
    section: '',
    educationLevel: ''
  });

  const [parsedRows, setParsedRows] = useState<ParsedExcelRow[]>([]);
  const [filterView, setFilterView] = useState<'ALL' | 'ERRORS' | 'EXISTING'>('ALL');
  const [importing, setImporting] = useState<boolean>(false);

  const existingByDni = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of existingStudents) {
      map.set(s.dni, s);
    }
    return map;
  }, [existingStudents]);

  /**
   * Reconstruye y valida las filas utilizando el mapeo de columnas seleccionado.
   */
  const rebuildRowsFromMapping = (
    records: Array<Record<string, string>>,
    activeMapping: ColumnMapping
  ) => {
    const mappedInput = records.map((rec, idx) => ({
      rowIndex: idx + 2, // Considerando encabezado en fila 1
      dni: activeMapping.dni ? rec[activeMapping.dni] ?? '' : '',
      full_name: activeMapping.fullName ? rec[activeMapping.fullName] ?? '' : '',
      education_level: activeMapping.educationLevel
        ? rec[activeMapping.educationLevel] ?? 'Secundaria'
        : 'Secundaria',
      grade: activeMapping.grade ? rec[activeMapping.grade] ?? '' : '',
      section: activeMapping.section ? rec[activeMapping.section] ?? '' : '',
      excluded: false,
      existingAction: 'update' as ExistingStudentAction
    }));

    const validated = validateAndAnalyzeRows(mappedInput, existingByDni);
    setParsedRows(validated);
  };

  /**
   * Lee el archivo .xlsx o .xls en el cliente sin subir el Excel completo a servidores públicos.
   * Fuerza lectura como texto formateado (`raw: false`) para preservar ceros iniciales del DNI.
   */
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellText: true,
        cellDates: false
      });

      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        showToast('error', 'Archivo Excel vacío', 'El archivo no contiene ninguna hoja de cálculo.');
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      // Obtener matriz de filas como texto (`raw: false, defval: ''`) para no perder ceros a la izquierda
      const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, {
        header: 1,
        raw: false,
        defval: ''
      });

      if (!matrix || matrix.length < 2) {
        showToast(
          'error',
          'Sin registros para importar',
          'El archivo debe incluir una fila de encabezados y al menos una fila de datos.'
        );
        return;
      }

      const headerRow = (matrix[0] || []).map((cell, idx) => {
        const clean = String(cell ?? '').trim();
        return clean || `Columna_${idx + 1}`;
      });

      const dataRows: Array<Record<string, string>> = [];
      for (let r = 1; r < matrix.length; r++) {
        const rowCells = matrix[r] || [];
        const obj: Record<string, string> = {};
        headerRow.forEach((colName, cIdx) => {
          obj[colName] = String(rowCells[cIdx] ?? '').trim();
        });
        dataRows.push(obj);
      }

      const detected = autoDetectColumns(headerRow);
      setFileName(file.name);
      setRawHeaders(headerRow);
      setRawSheetRecords(dataRows);
      setMapping(detected);
      rebuildRowsFromMapping(dataRows, detected);
      setFilterView('ALL');
    } catch (err) {
      const normalized = normalizeError(err, 'No se pudo procesar el archivo Excel seleccionado.');
      showToast('error', 'Error al leer el archivo Excel', normalized.userMessage);
    }
  };

  /**
   * Permite editar manualmente el valor de cualquier celda en la vista previa (DNI, nombre, grado, sección)
   * y revalida todo el lote en tiempo real (incluyendo duplicados internos).
   */
  const handleUpdateCell = (
    rowIndex: number,
    field: 'dni' | 'full_name' | 'grade' | 'section' | 'education_level',
    value: string
  ) => {
    const nextInput = parsedRows.map((r) =>
      r.rowIndex === rowIndex ? { ...r, [field]: value } : r
    );
    setParsedRows(validateAndAnalyzeRows(nextInput, existingByDni));
  };

  const handleToggleExcludeRow = (rowIndex: number) => {
    const nextInput = parsedRows.map((r) =>
      r.rowIndex === rowIndex ? { ...r, excluded: !r.excluded } : r
    );
    setParsedRows(validateAndAnalyzeRows(nextInput, existingByDni));
  };

  const handleExcludeAllInvalidRows = () => {
    const nextInput = parsedRows.map((r) =>
      !r.isValid ? { ...r, excluded: true } : r
    );
    setParsedRows(validateAndAnalyzeRows(nextInput, existingByDni));
  };

  const handleChangeExistingAction = (rowIndex: number, action: ExistingStudentAction) => {
    const nextInput = parsedRows.map((r) =>
      r.rowIndex === rowIndex ? { ...r, existingAction: action } : r
    );
    setParsedRows(validateAndAnalyzeRows(nextInput, existingByDni));
  };

  const handleSetAllExistingAction = (action: ExistingStudentAction) => {
    const nextInput = parsedRows.map((r) =>
      r.existingInDb ? { ...r, existingAction: action } : r
    );
    setParsedRows(validateAndAnalyzeRows(nextInput, existingByDni));
  };

  /**
   * Genera una plantilla Excel de demostración con datos claramente ficticios (incluyendo un DNI con cero inicial)
   * para facilitar pruebas o dar formato al padrón escolar.
   */
  const handleDownloadSampleTemplate = () => {
    const sampleData = [
      {
        Nivel: 'Secundaria',
        Grado: '1ro',
        Sección: 'A',
        'Apellidos y nombres': 'QUISPE MAMANI, SOFIA VALENTINA (PLANTILLA FICTICIA)',
        DNI: '01234567'
      },
      {
        Nivel: 'Secundaria',
        Grado: '1ro',
        Sección: 'A',
        'Apellidos y nombres': 'RODRIGUEZ PEREZ, CAMILA LUCIA (PLANTILLA FICTICIA)',
        DNI: '72345678'
      },
      {
        Nivel: 'Secundaria',
        Grado: '2do',
        Sección: 'B',
        'Apellidos y nombres': 'SANCHEZ TORRES, MARIANA FERNANDA (PLANTILLA FICTICIA)',
        DNI: '08765432'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    // Forzar formato de texto '@' en la columna de DNI para preservar ceros iniciales en Excel
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:E4');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const dniCellRef = XLSX.utils.encode_cell({ r: R, c: 4 });
      if (ws[dniCellRef]) {
        ws[dniCellRef].t = 's';
        ws[dniCellRef].z = '@';
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Padron_Estudiantes');
    XLSX.writeFile(wb, 'Plantilla_Padron_Estudiantes_DNI.xlsx');
  };

  const summary = useMemo(() => computeImportSummary(parsedRows), [parsedRows]);
  const isConfirmEnabled = useMemo(() => canConfirmImport(summary), [summary]);

  const visibleRows = useMemo(() => {
    if (filterView === 'ERRORS') {
      return parsedRows.filter((r) => !r.isValid && !r.excluded);
    }
    if (filterView === 'EXISTING') {
      return parsedRows.filter((r) => r.existingInDb);
    }
    return parsedRows;
  }, [parsedRows, filterView]);

  const handleConfirmImport = async () => {
    if (!isConfirmEnabled) return;
    setImporting(true);
    try {
      const result = await importValidatedExcelRows(profile, fileName, parsedRows);
      await onImportCompleted();
      showToast(
        'success',
        'Padrón importado correctamente',
        `Nuevas: ${result.insertedCount} • Actualizadas (conservando fotos): ${result.updatedCount} • Omitidas: ${result.skippedCount}`
      );
      // Limpiar vista previa tras importación exitosa
      setParsedRows([]);
      setRawSheetRecords([]);
      setFileName('');
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'No se pudo completar la importación', normalized.userMessage);
    } finally {
      setImporting(false);
    }
  };

  if (profile.role !== 'admin') {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center max-w-lg mx-auto my-8">
        <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Acceso restringido a Administradores</h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Únicamente los usuarios con rol Administrador están autorizados para importar o actualizar el padrón institucional.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado y descarga de plantilla */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Importación y Validación del Padrón Excel
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Cargue archivos .xlsx o .xls. El sistema valida DNI de 8 dígitos (preservando ceros iniciales), detecta duplicados y protege las fotografías existentes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadSampleTemplate}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs sm:text-sm font-semibold shadow-2xs cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4 text-slate-600" />
          <span>Descargar plantilla Excel</span>
        </button>
      </div>

      {/* Zona de carga de archivo Excel */}
      <div className="bg-white p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-slate-400 transition-colors text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelected}
          className="hidden"
        />
        <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-3">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <h3 className="text-sm sm:text-base font-bold text-slate-900">
          {fileName ? `Archivo cargado: ${fileName}` : 'Seleccione el archivo Excel del padrón escolar'}
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-xl mx-auto">
          Columnas requeridas: <strong>Grado</strong>, <strong>Sección</strong>,{' '}
          <strong>Nombre completo</strong> (o "Apellidos y nombres") y <strong>DNI</strong> (8 dígitos como texto).
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>{fileName ? 'Cambiar archivo Excel (.xlsx / .xls)' : 'Cargar archivo Excel (.xlsx / .xls)'}</span>
          </button>
        </div>
      </div>

      {/* Mapeo manual de columnas + Vista previa interactiva y validación */}
      {rawSheetRecords.length > 0 && (
        <div className="space-y-5">
          {/* Asignación de columnas (reconocimiento automático + ajuste manual) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              1. Asignación de Columnas del Excel
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Verifique o asigne manualmente qué columna de su archivo corresponde a cada dato del padrón:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(
                [
                  { key: 'dni', label: 'Columna DNI (8 dígitos) *' },
                  { key: 'fullName', label: 'Columna Nombre Completo *' },
                  { key: 'grade', label: 'Columna Grado *' },
                  { key: 'section', label: 'Columna Sección *' },
                  { key: 'educationLevel', label: 'Nivel Educativo (Opcional)' }
                ] as const
              ).map((col) => (
                <div key={col.key}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {col.label}
                  </label>
                  <select
                    value={mapping[col.key] || ''}
                    onChange={(e) => {
                      const nextMapping = { ...mapping, [col.key]: e.target.value };
                      setMapping(nextMapping);
                      rebuildRowsFromMapping(rawSheetRecords, nextMapping);
                    }}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl bg-white text-slate-900"
                  >
                    <option value="">-- Seleccionar columna --</option>
                    {rawHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen de conteos antes de confirmar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold uppercase text-slate-500 block">
                Filas Leídas
              </span>
              <span className="text-xl font-bold text-slate-900">{summary.totalRows}</span>
            </div>

            <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-semibold uppercase text-emerald-800 block">
                Nuevas a Importar
              </span>
              <span className="text-xl font-bold text-emerald-700">{summary.validNewCount}</span>
            </div>

            <div className="bg-sky-50 p-3.5 rounded-xl border border-sky-200">
              <span className="text-[11px] font-semibold uppercase text-sky-800 block">
                Existentes a Actualizar
              </span>
              <span className="text-xl font-bold text-sky-700">{summary.toUpdateCount}</span>
            </div>

            <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-semibold uppercase text-slate-600 block">
                Se Omitirán / Excluidas
              </span>
              <span className="text-xl font-bold text-slate-700">{summary.toSkipCount}</span>
            </div>

            <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
              <span className="text-[11px] font-semibold uppercase text-amber-800 block">
                DNI Duplicados (Excel)
              </span>
              <span className="text-xl font-bold text-amber-700">
                {summary.duplicateInFileCount}
              </span>
            </div>

            <div
              className={`p-3.5 rounded-xl border ${
                summary.blockingErrorCount > 0
                  ? 'bg-rose-50 border-rose-300'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <span
                className={`text-[11px] font-semibold uppercase block ${
                  summary.blockingErrorCount > 0 ? 'text-rose-800' : 'text-emerald-800'
                }`}
              >
                Errores Bloqueantes
              </span>
              <span
                className={`text-xl font-bold ${
                  summary.blockingErrorCount > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {summary.blockingErrorCount}
              </span>
            </div>
          </div>

          {/* Barra de herramientas de corrección rápida y confirmación */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterView('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  filterView === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todas las filas ({parsedRows.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterView('ERRORS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  filterView === 'ERRORS'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                Con errores ({summary.blockingErrorCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterView('EXISTING')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  filterView === 'EXISTING'
                    ? 'bg-sky-600 text-white'
                    : 'bg-sky-50 text-sky-800 hover:bg-sky-100'
                }`}
              >
                Ya existen en BD ({parsedRows.filter((r) => r.existingInDb).length})
              </button>

              {summary.blockingErrorCount > 0 && (
                <button
                  type="button"
                  onClick={handleExcludeAllInvalidRows}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Excluir todas las filas con error ({summary.blockingErrorCount})</span>
                </button>
              )}

              {parsedRows.some((r) => r.existingInDb) && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 ml-1">
                  <span>Para estudiantes existentes:</span>
                  <button
                    type="button"
                    onClick={() => handleSetAllExistingAction('update')}
                    className="underline font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    Actualizar todas (sin borrar fotos)
                  </button>
                  <span>/</span>
                  <button
                    type="button"
                    onClick={() => handleSetAllExistingAction('skip')}
                    className="underline font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
                  >
                    Omitir todas
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleConfirmImport()}
              disabled={!isConfirmEnabled || importing}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {importing
                  ? 'Confirmando importación...'
                  : `Confirmar importación (${summary.validNewCount} nuevas, ${summary.toUpdateCount} actualizadas)`}
              </span>
            </button>
          </div>

          {/* Aviso si aún hay errores bloqueantes */}
          {summary.blockingErrorCount > 0 && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  Revise los errores detectados antes de confirmar la importación
                </p>
                <p className="mt-0.5 text-rose-800">
                  Existen {summary.blockingErrorCount} fila(s) con datos incompletos, DNI inválidos o DNI duplicados en el archivo. Puede corregirlos directamente en las celdas de la tabla inferior o marcar la fila como "Excluida" para habilitar la confirmación.
                </p>
              </div>
            </div>
          )}

          {/* Tabla de vista previa y corrección en línea */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[860px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-3">Fila</th>
                  <th className="py-3 px-3">DNI (8 dígitos texto)</th>
                  <th className="py-3 px-3">Nombre completo</th>
                  <th className="py-3 px-3">Grado</th>
                  <th className="py-3 px-3">Sección</th>
                  <th className="py-3 px-3">Diagnóstico / Validación</th>
                  <th className="py-3 px-3 text-right">Acción en fila</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {visibleRows.map((row) => {
                  const hasBlocking = row.issues.some((i) => i.isBlocking);
                  return (
                    <tr
                      key={row.rowIndex}
                      className={
                        row.excluded
                          ? 'bg-slate-100/70 opacity-60'
                          : hasBlocking
                          ? 'bg-rose-50/50'
                          : row.existingInDb
                          ? 'bg-sky-50/40'
                          : 'bg-white'
                      }
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-500">
                        #{row.rowIndex}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.dni}
                          disabled={row.excluded}
                          maxLength={12}
                          onChange={(e) =>
                            handleUpdateCell(row.rowIndex, 'dni', e.target.value)
                          }
                          placeholder="01234567"
                          className={`w-28 px-2.5 py-1.5 font-mono font-bold rounded-lg border ${
                            row.issues.some((i) => i.field === 'dni' && i.isBlocking)
                              ? 'border-rose-400 bg-white text-rose-900'
                              : 'border-slate-300 bg-white text-slate-900'
                          }`}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.full_name}
                          disabled={row.excluded}
                          onChange={(e) =>
                            handleUpdateCell(row.rowIndex, 'full_name', e.target.value)
                          }
                          placeholder="APELLIDOS Y NOMBRES"
                          className={`w-full min-w-[220px] px-2.5 py-1.5 rounded-lg border ${
                            row.issues.some((i) => i.field === 'full_name' && i.isBlocking)
                              ? 'border-rose-400 bg-white text-rose-900'
                              : 'border-slate-300 bg-white text-slate-900'
                          }`}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.grade}
                          disabled={row.excluded}
                          onChange={(e) =>
                            handleUpdateCell(row.rowIndex, 'grade', e.target.value)
                          }
                          placeholder="1ro"
                          className={`w-20 px-2.5 py-1.5 rounded-lg border ${
                            row.issues.some((i) => i.field === 'grade' && i.isBlocking)
                              ? 'border-rose-400 bg-white text-rose-900'
                              : 'border-slate-300 bg-white text-slate-900'
                          }`}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={row.section}
                          disabled={row.excluded}
                          onChange={(e) =>
                            handleUpdateCell(row.rowIndex, 'section', e.target.value)
                          }
                          placeholder="A"
                          className={`w-16 px-2.5 py-1.5 rounded-lg border ${
                            row.issues.some((i) => i.field === 'section' && i.isBlocking)
                              ? 'border-rose-400 bg-white text-rose-900'
                              : 'border-slate-300 bg-white text-slate-900'
                          }`}
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        {row.excluded ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                            Fila excluida de la importación
                          </span>
                        ) : row.issues.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Lista para importar (Nueva)
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {row.issues.map((issue, idx) => (
                              <li
                                key={idx}
                                className={
                                  issue.isBlocking
                                    ? 'text-rose-700 font-semibold'
                                    : 'text-sky-800 font-medium'
                                }
                              >
                                • {issue.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {row.existingInDb && !row.excluded && (
                            <select
                              value={row.existingAction}
                              onChange={(e) =>
                                handleChangeExistingAction(
                                  row.rowIndex,
                                  e.target.value as ExistingStudentAction
                                )
                              }
                              className="px-2 py-1 rounded border border-sky-300 bg-white text-sky-900 font-semibold text-[11px]"
                            >
                              <option value="update">Actualizar datos (Conservar foto)</option>
                              <option value="skip">Omitir registro</option>
                            </select>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleExcludeRow(row.rowIndex)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                              row.excluded
                                ? 'bg-slate-800 text-white hover:bg-slate-700'
                                : 'bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-800'
                            }`}
                          >
                            {row.excluded ? (
                              <>
                                <RotateCcw className="w-3 h-3" />
                                <span>Incluir</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3 h-3" />
                                <span>Excluir</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial de lotes importados */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-900">
            Historial de Importaciones de Padrón
          </h3>
        </div>
        {importBatches.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No se registran importaciones previas.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 text-xs">
            {importBatches.map((batch) => (
              <div
                key={batch.id}
                className="px-5 py-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-semibold text-slate-900">{batch.file_name}</span>
                  <p className="text-slate-500 mt-0.5">{batch.notes}</p>
                </div>
                <div className="flex items-center gap-3 text-slate-600">
                  <span>Nuevas: <strong>{batch.inserted_count}</strong></span>
                  <span>Actualizadas: <strong>{batch.updated_count}</strong></span>
                  <span>Omitidas: <strong>{batch.skipped_count}</strong></span>
                  <span className="text-slate-400">
                    {new Date(batch.created_at).toLocaleString('es-PE')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

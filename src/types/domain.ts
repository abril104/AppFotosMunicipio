import type { PhotoStatus, Student, UserRole } from './database.ts';

export type VisualProcessState = 'pendiente' | 'guardada' | 'procesando' | 'error';

export interface ColumnMapping {
  dni: string;
  fullName: string;
  grade: string;
  section: string;
  educationLevel?: string;
}

export type ValidationIssueType =
  | 'EMPTY_ROW'
  | 'MISSING_GRADE'
  | 'MISSING_SECTION'
  | 'MISSING_NAME'
  | 'INVALID_DNI_FORMAT'
  | 'SCIENTIFIC_NOTATION_DNI'
  | 'DUPLICATE_IN_FILE'
  | 'EXISTS_IN_DB';

export interface RowValidationIssue {
  type: ValidationIssueType;
  field: 'dni' | 'full_name' | 'grade' | 'section' | 'row';
  message: string;
  isBlocking: boolean;
}

export type ExistingStudentAction = 'update' | 'skip';

export interface ParsedExcelRow {
  rowIndex: number; // Número de fila original en Excel (base 1)
  dni: string;
  full_name: string;
  education_level: string;
  grade: string;
  section: string;
  excluded: boolean;
  existingInDb: boolean;
  existingAction: ExistingStudentAction;
  existingHasPhoto: boolean;
  issues: RowValidationIssue[];
  isValid: boolean;
}

export interface ImportSummaryCounts {
  totalRows: number;
  validNewCount: number;
  toUpdateCount: number;
  toSkipCount: number;
  invalidOrExcludedCount: number;
  duplicateInFileCount: number;
  blockingErrorCount: number;
}

export interface AcademicFilters {
  educationLevel: string; // 'ALL' o nivel específico
  grade: string; // 'ALL' o grado específico
  section: string; // 'ALL' o sección específica
  searchQuery: string;
  statusFilter: 'ALL' | PhotoStatus;
  sortOrder: 'asc' | 'desc';
}

export interface GradeSectionStats {
  educationLevel: string;
  grade: string;
  section: string;
  total: number;
  completed: number;
  pending: number;
  percentage: number;
}

export interface DashboardStats {
  totalStudents: number;
  completedPhotos: number;
  pendingPhotos: number;
  overallPercentage: number;
  byGradeSection: GradeSectionStats[];
  recentPhotos: Student[];
}

export type ExportScope = 'section' | 'grade' | 'all';

export interface ExportOptions {
  scope: ExportScope;
  educationLevel?: string;
  grade?: string;
  section?: string;
  includePendingReport: boolean;
  batchSize?: number;
}

export interface ExportProgress {
  phase: 'preparing' | 'downloading' | 'packaging' | 'completed' | 'error';
  current: number;
  total: number;
  exportedCount: number;
  skippedPendingCount: number;
  failedCount: number;
  failedDnis: string[];
  batchIndex: number;
  totalBatches: number;
  message: string;
}

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

export interface UserSessionContext {
  userId: string;
  role: UserRole;
  isActive: boolean;
}

import React, { useCallback, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { ImportBatch, Profile, Student } from './types/database.ts';
import type { AcademicFilters } from './types/domain.ts';
import {
  getCurrentSessionProfile,
  signOutSession
} from './services/authService.ts';
import {
  createSingleStudentRecord,
  deleteStudentRecord,
  fetchImportBatches,
  fetchStudents,
  subscribeToStudentsChanges,
  toggleStudentRetiredStatus
} from './services/studentService.ts';
import {
  filterStudentsByUserScope,
  getUserEffectiveLevelScope
} from './utils/academicFilter.ts';
import { IS_SUPABASE_CONFIGURED, supabase } from './services/supabaseClient.ts';
import { AppLayout } from './components/layout/AppLayout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { StudentsListPage } from './pages/StudentsListPage.tsx';
import { ExcelImportPage } from './pages/ExcelImportPage.tsx';
import { ExportPhotosPage } from './pages/ExportPhotosPage.tsx';
import { UsersManagementPage } from './pages/UsersManagementPage.tsx';
import { CameraCaptureModal } from './components/camera/CameraCaptureModal.tsx';
import { PhotoViewerModal } from './components/camera/PhotoViewerModal.tsx';
import { ToastProvider, useToast } from './components/ui/ToastProvider.tsx';
import { normalizeError } from './utils/errorHandler.ts';

const DEFAULT_FILTERS: AcademicFilters = {
  educationLevel: 'ALL',
  grade: 'ALL',
  section: 'ALL',
  searchQuery: '',
  statusFilter: 'ALL',
  sortOrder: 'asc'
};

const AuthenticatedWorkspace: React.FC<{
  profile: Profile;
  isDemoMode: boolean;
  onSignOut: () => Promise<void>;
}> = ({ profile, isDemoMode, onSignOut }) => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const userLevelScope = getUserEffectiveLevelScope(profile);

  const [students, setStudents] = useState<Student[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [filters, setFilters] = useState<AcademicFilters>(() => ({
    ...DEFAULT_FILTERS,
    educationLevel: userLevelScope !== 'ALL' ? userLevelScope : 'ALL'
  }));

  // Mantener bloqueado el filtro de nivel si el usuario pertenece exclusivamente a Primaria o Secundaria
  useEffect(() => {
    if (userLevelScope !== 'ALL' && filters.educationLevel !== userLevelScope) {
      setFilters((prev) => ({
        ...prev,
        educationLevel: userLevelScope
      }));
    }
  }, [userLevelScope, filters.educationLevel]);

  // Estudiantes visibles según el nivel asignado al usuario (Secundaria solo ve Secundaria, Primaria solo ve Primaria)
  const scopedStudents = React.useMemo(
    () => filterStudentsByUserScope(students, profile),
    [students, profile]
  );

  // Estado del módulo de cámara y visor de fotografía
  const [cameraModalOpen, setCameraModalOpen] = useState<boolean>(false);
  const [activeCameraStudent, setActiveCameraStudent] = useState<Student | null>(null);
  const [activeCameraList, setActiveCameraList] = useState<Student[]>([]);
  const [viewerStudent, setViewerStudent] = useState<Student | null>(null);

  const loadAllData = useCallback(async () => {
    try {
      const [studentsList, batchesList] = await Promise.all([
        fetchStudents(),
        fetchImportBatches()
      ]);
      setStudents(studentsList);
      setImportBatches(batchesList);
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'Error al sincronizar datos', normalized.userMessage);
    } finally {
      setLoadingData(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadAllData();
    // Suscripción en tiempo real para sincronizar cambios entre dispositivos autorizados
    const unsubscribe = subscribeToStudentsChanges(() => {
      void loadAllData();
    });
    return () => {
      unsubscribe();
    };
  }, [loadAllData]);

  // Mantener sincronizada la estudiante activa en el modal de cámara si se actualiza en la lista
  useEffect(() => {
    if (activeCameraStudent) {
      const refreshed = students.find((s) => s.id === activeCameraStudent.id);
      if (refreshed) {
        setActiveCameraStudent(refreshed);
      }
    }
    if (activeCameraList.length > 0) {
      const mapById = new Map(students.map((s) => [s.id, s]));
      setActiveCameraList((prev) =>
        prev.map((item) => mapById.get(item.id) || item)
      );
    }
  }, [students]);

  const handleOpenCamera = (student: Student, listContext: Student[]) => {
    setActiveCameraStudent(student);
    setActiveCameraList(listContext.length > 0 ? listContext : students);
    setCameraModalOpen(true);
  };

  const handlePhotoSaved = (updatedStudent: Student) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s))
    );
    setActiveCameraStudent(updatedStudent);
  };

  const handleDeleteStudent = async (student: Student) => {
    try {
      await deleteStudentRecord(profile, student);
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
      showToast(
        'info',
        'Registro eliminado',
        `Se eliminó a ${student.full_name} del padrón.`
      );
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'Error al eliminar estudiante', normalized.userMessage);
    }
  };

  const handleCreateStudent = async (input: {
    dni: string;
    full_name: string;
    grade: string;
    section: string;
    education_level?: string;
  }) => {
    try {
      const effectiveLevel =
        userLevelScope !== 'ALL'
          ? userLevelScope
          : input.education_level || 'Secundaria';
      const created = await createSingleStudentRecord(profile, {
        ...input,
        education_level: effectiveLevel
      });
      setStudents((prev) =>
        [...prev, created].sort((a, b) =>
          a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' })
        )
      );
      showToast(
        'success',
        'Estudiante registrada',
        `Se agregó a ${created.full_name} en ${created.grade} "${created.section}".`
      );
    } catch (err) {
      const normalized = normalizeError(err);
      showToast('error', 'No se pudo registrar', normalized.userMessage);
      throw err;
    }
  };

  const handleToggleRetiredStudent = async (
    student: Student,
    markRetired: boolean
  ) => {
    try {
      const updated = await toggleStudentRetiredStatus(
        profile,
        student,
        markRetired
      );
      setStudents((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      showToast(
        'info',
        markRetired ? 'Marcada como Retirada' : 'Estudiante reactivada',
        markRetired
          ? `${updated.full_name} fue registrada como trasladada a otra I.E. (Retirada).`
          : `${updated.full_name} fue reactivada en su sección.`
      );
    } catch (err) {
      const normalized = normalizeError(err);
      showToast(
        'error',
        'No se pudo actualizar la condición',
        normalized.userMessage
      );
    }
  };

  const handleNavigateToSection = (grade: string, section: string) => {
    setFilters({
      ...DEFAULT_FILTERS,
      educationLevel: userLevelScope !== 'ALL' ? userLevelScope : 'ALL',
      grade,
      section
    });
    navigate('/estudiantes');
  };

  if (loadingData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
        <p className="text-sm font-medium">
          Sincronizando padrón de estudiantes desde la nube...
        </p>
      </div>
    );
  }

  return (
    <AppLayout
      profile={profile}
      isDemoMode={isDemoMode}
      onSignOut={() => void onSignOut()}
    >
      <Routes>
        <Route
          path="/"
          element={
            <DashboardPage
              students={scopedStudents}
              profile={profile}
              onOpenStudentPhoto={(s) => setViewerStudent(s)}
              onNavigateToSection={handleNavigateToSection}
            />
          }
        />
        <Route
          path="/estudiantes"
          element={
            <StudentsListPage
              students={scopedStudents}
              profile={profile}
              filters={filters}
              onChangeFilters={setFilters}
              onOpenCamera={handleOpenCamera}
              onViewPhoto={(s) => setViewerStudent(s)}
              onToggleRetiredStudent={handleToggleRetiredStudent}
              onCreateStudent={handleCreateStudent}
              onDeleteStudent={handleDeleteStudent}
            />
          }
        />
        <Route
          path="/importar"
          element={
            profile.role === 'admin' ? (
              <ExcelImportPage
                profile={profile}
                existingStudents={students}
                importBatches={importBatches}
                onImportCompleted={loadAllData}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/exportar"
          element={
            <ExportPhotosPage profile={profile} students={scopedStudents} />
          }
        />
        <Route
          path="/usuarios"
          element={
            profile.role === 'admin' ? (
              <UsersManagementPage currentProfile={profile} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Módulo de Cámara para captura, revisión, guardado y avance continuo */}
      <CameraCaptureModal
        open={cameraModalOpen}
        student={activeCameraStudent}
        studentsList={activeCameraList}
        currentProfile={profile}
        onClose={() => setCameraModalOpen(false)}
        onSelectStudent={(nextStudent) => setActiveCameraStudent(nextStudent)}
        onPhotoSaved={handlePhotoSaved}
      />

      {/* Modal para ver fotografía existente con URL firmada temporal */}
      <PhotoViewerModal
        student={viewerStudent}
        onClose={() => setViewerStudent(null)}
        onReplaceRequest={(s) => handleOpenCamera(s, students)}
      />
    </AppLayout>
  );
};

export const App: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    getCurrentSessionProfile()
      .then((res) => {
        if (mounted) {
          setProfile(res.profile);
          setIsDemoMode(res.isDemoMode);
          setCheckingAuth(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setProfile(null);
          setCheckingAuth(false);
        }
      });

    if (IS_SUPABASE_CONFIGURED && supabase) {
      const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          setProfile(null);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          void getCurrentSessionProfile().then((res) => {
            if (mounted) {
              setProfile(res.profile);
              setIsDemoMode(res.isDemoMode);
            }
          });
        }
      });

      return () => {
        mounted = false;
        authSub.subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    await signOutSession();
    setProfile(null);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-600 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
        <p className="text-sm font-medium">Verificando sesión autorizada...</p>
      </div>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        {!profile ? (
          <LoginPage
            onLoginSuccess={(loggedProfile, demoFlag) => {
              setProfile(loggedProfile);
              setIsDemoMode(demoFlag);
            }}
          />
        ) : (
          <AuthenticatedWorkspace
            profile={profile}
            isDemoMode={isDemoMode}
            onSignOut={handleSignOut}
          />
        )}
      </BrowserRouter>
    </ToastProvider>
  );
};

export default App;

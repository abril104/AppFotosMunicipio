-- ============================================================================
-- MIGRACIÓN 001: ESQUEMA INICIAL DEL SISTEMA DE REGISTRO FOTOGRÁFICO ESCOLAR
-- Base de datos: Supabase PostgreSQL
-- Descripción: Tablas profiles, students, import_batches, restricciones,
--              índices y disparadores (triggers) automáticos.
-- ============================================================================

-- Habilitar extensión para generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS Y DOMINIOS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('admin', 'operator');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.photo_status_type AS ENUM ('pendiente', 'completada');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TABLA: profiles (Vinculada a auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
    role public.user_role NOT NULL DEFAULT 'operator',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Perfiles de usuarios autorizados del sistema (administradores y operadores fotográficos).';
COMMENT ON COLUMN public.profiles.role IS 'Rol del usuario: admin (gestión total, importación, usuarios) u operator (captura, consulta y exportación autorizada).';

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- ----------------------------------------------------------------------------
-- 3. TABLA: students (Padrón institucional de estudiantes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dni TEXT NOT NULL,
    full_name TEXT NOT NULL,
    education_level TEXT DEFAULT 'Secundaria',
    grade TEXT NOT NULL,
    section TEXT NOT NULL,
    photo_path TEXT NULL,
    photo_status public.photo_status_type NOT NULL DEFAULT 'pendiente',
    photo_updated_at TIMESTAMPTZ NULL,
    photo_updated_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Restricción única institucional para el DNI (evita duplicados en el padrón)
    CONSTRAINT uq_students_dni UNIQUE (dni),

    -- Validación estricta de DNI peruano: exactamente 8 dígitos numéricos (preserva ceros iniciales)
    CONSTRAINT chk_students_dni_format CHECK (dni ~ '^[0-9]{8}$'),

    -- Validación de campos obligatorios no vacíos
    CONSTRAINT chk_students_full_name_nonempty CHECK (char_length(trim(full_name)) >= 2),
    CONSTRAINT chk_students_grade_nonempty CHECK (char_length(trim(grade)) >= 1),
    CONSTRAINT chk_students_section_nonempty CHECK (char_length(trim(section)) >= 1),

    -- Coherencia entre estado de la fotografía y ruta de archivo
    CONSTRAINT chk_students_photo_consistency CHECK (
        (photo_status = 'pendiente' AND photo_path IS NULL)
        OR
        (photo_status = 'completada' AND photo_path IS NOT NULL AND char_length(trim(photo_path)) > 0)
    )
);

COMMENT ON TABLE public.students IS 'Padrón de estudiantes y metadatos de su registro fotográfico en la nube.';
COMMENT ON COLUMN public.students.dni IS 'Documento Nacional de Identidad (8 dígitos como texto para preservar ceros a la izquierda).';
COMMENT ON COLUMN public.students.photo_path IS 'Ruta determinista dentro del bucket privado student-photos.';

-- Índices para filtros académicos, búsquedas por nombre/DNI y reportes de avance
CREATE INDEX IF NOT EXISTS idx_students_grade_section ON public.students(grade, section);
CREATE INDEX IF NOT EXISTS idx_students_education_level ON public.students(education_level, grade, section);
CREATE INDEX IF NOT EXISTS idx_students_photo_status ON public.students(photo_status);
CREATE INDEX IF NOT EXISTS idx_students_full_name ON public.students(full_name);
CREATE INDEX IF NOT EXISTS idx_students_photo_updated_at ON public.students(photo_updated_at DESC NULLS LAST);

-- ----------------------------------------------------------------------------
-- 4. TABLA: import_batches (Historial y auditoría de importaciones Excel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    imported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    inserted_count INTEGER NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
    updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
    skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
    error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.import_batches IS 'Registro histórico de cargas de padrón Excel (no almacena el archivo Excel ni datos sensibles expuestos).';

CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. FUNCIONES Y TRIGGERS AUTOMÁTICOS (updated_at)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at
    BEFORE UPDATE ON public.students
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 6. TRIGGER PARA SINCRONIZAR NUEVOS USUARIOS DE SUPABASE AUTH A PROFILES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    assigned_role public.user_role;
    assigned_name TEXT;
BEGIN
    -- Por seguridad, cualquier usuario nuevo recibe rol 'operator' salvo que se indique en raw_user_meta_data por un administrador en el servidor
    assigned_role := COALESCE(
        (NEW.raw_user_meta_data->>'role')::public.user_role,
        'operator'::public.user_role
    );
    assigned_name := COALESCE(
        NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
        split_part(NEW.email, '@', 1)
    );

    INSERT INTO public.profiles (id, email, full_name, role, is_active)
    VALUES (NEW.id, NEW.email, assigned_name, assigned_role, TRUE)
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();

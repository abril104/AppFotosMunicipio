-- ============================================================================
-- MIGRACIÓN 002: SEGURIDAD RLS (ROW LEVEL SECURITY) Y BUCKET PRIVADO STORAGE
-- Base de datos: Supabase PostgreSQL & Supabase Storage
-- Descripción: Políticas de acceso mínimo necesario para proteger datos
--              personales de estudiantes (DNI y fotografías).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNCIONES AUXILIARES DE AUTORIZACIÓN
-- ----------------------------------------------------------------------------

-- Verifica si el usuario autenticado tiene un perfil activo en el sistema
CREATE OR REPLACE FUNCTION public.is_authorized_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND is_active = TRUE
    );
$$;

-- Verifica si el usuario autenticado es administrador activo
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid()
          AND role = 'admin'
          AND is_active = TRUE
    );
$$;

-- ----------------------------------------------------------------------------
-- 2. HABILITAR ROW LEVEL SECURITY EN TODAS LAS TABLAS
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. POLÍTICAS RLS PARA TABLA: profiles
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Usuarios autorizados pueden leer perfiles" ON public.profiles;
CREATE POLICY "Usuarios autorizados pueden leer perfiles"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR public.is_authorized_user());

DROP POLICY IF EXISTS "Administradores pueden actualizar perfiles" ON public.profiles;
CREATE POLICY "Administradores pueden actualizar perfiles"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (public.is_admin_user())
    WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Administradores pueden insertar perfiles" ON public.profiles;
CREATE POLICY "Administradores pueden insertar perfiles"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin_user());

-- ----------------------------------------------------------------------------
-- 4. POLÍTICAS RLS PARA TABLA: students
-- ----------------------------------------------------------------------------
-- Lectura: Solo usuarios autenticados y activos en profiles
DROP POLICY IF EXISTS "Usuarios autorizados pueden consultar estudiantes" ON public.students;
CREATE POLICY "Usuarios autorizados pueden consultar estudiantes"
    ON public.students
    FOR SELECT
    TO authenticated
    USING (public.is_authorized_user());

-- Inserción (Importación del padrón): EXCLUSIVO para administradores activos
DROP POLICY IF EXISTS "Solo administradores pueden insertar estudiantes" ON public.students;
CREATE POLICY "Solo administradores pueden insertar estudiantes"
    ON public.students
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin_user());

-- Actualización:
-- Administradores pueden actualizar cualquier campo válido.
-- Operadores autorizados pueden actualizar el registro fotográfico.
DROP POLICY IF EXISTS "Usuarios autorizados pueden actualizar registro fotografico" ON public.students;
CREATE POLICY "Usuarios autorizados pueden actualizar registro fotografico"
    ON public.students
    FOR UPDATE
    TO authenticated
    USING (public.is_authorized_user())
    WITH CHECK (public.is_authorized_user());

-- Eliminación de registros del padrón: EXCLUSIVO para administradores activos
DROP POLICY IF EXISTS "Solo administradores pueden eliminar estudiantes" ON public.students;
CREATE POLICY "Solo administradores pueden eliminar estudiantes"
    ON public.students
    FOR DELETE
    TO authenticated
    USING (public.is_admin_user());

-- ----------------------------------------------------------------------------
-- 5. POLÍTICAS RLS PARA TABLA: import_batches
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Usuarios autorizados pueden consultar historial de importacion" ON public.import_batches;
CREATE POLICY "Usuarios autorizados pueden consultar historial de importacion"
    ON public.import_batches
    FOR SELECT
    TO authenticated
    USING (public.is_authorized_user());

DROP POLICY IF EXISTS "Solo administradores pueden registrar importaciones" ON public.import_batches;
CREATE POLICY "Solo administradores pueden registrar importaciones"
    ON public.import_batches
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin_user() AND imported_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. FUNCIÓN SEGURA PARA IMPORTACIÓN CONTROLADA SIN BORRAR FOTOS EXISTENTES
-- ----------------------------------------------------------------------------
-- Esta función RPC garantiza en servidor que al reimportar o actualizar datos
-- de una estudiante existente NUNCA se borre su photo_path ni su photo_status.
CREATE OR REPLACE FUNCTION public.upsert_students_preserve_photos(
    p_students JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_inserted INT := 0;
    v_updated INT := 0;
    v_exists BOOLEAN;
BEGIN
    IF NOT public.is_admin_user() THEN
        RAISE EXCEPTION 'Permiso denegado: solo los administradores pueden importar o actualizar el padrón.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_students)
    LOOP
        SELECT EXISTS(SELECT 1 FROM public.students WHERE dni = (v_item->>'dni')) INTO v_exists;

        INSERT INTO public.students (
            dni,
            full_name,
            education_level,
            grade,
            section
        )
        VALUES (
            trim(v_item->>'dni'),
            trim(v_item->>'full_name'),
            COALESCE(NULLIF(trim(v_item->>'education_level'), ''), 'Secundaria'),
            trim(v_item->>'grade'),
            trim(v_item->>'section')
        )
        ON CONFLICT (dni) DO UPDATE
        SET
            full_name = EXCLUDED.full_name,
            education_level = EXCLUDED.education_level,
            grade = EXCLUDED.grade,
            section = EXCLUDED.section,
            -- Preservar estrictamente photo_path, photo_status, photo_updated_at y photo_updated_by
            updated_at = NOW();

        IF v_exists THEN
            v_updated := v_updated + 1;
        ELSE
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'inserted', v_inserted,
        'updated', v_updated
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. CONFIGURACIÓN DEL BUCKET PRIVADO EN SUPABASE STORAGE (student-photos)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'student-photos',
    'student-photos',
    FALSE, -- ESTRICTAMENTE PRIVADO: Nunca accesible mediante URLs públicas
    5242880, -- Límite de 5 MB por fotografía JPEG
    ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE
SET
    public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg'];

-- Políticas sobre storage.objects para el bucket 'student-photos'
DROP POLICY IF EXISTS "Lectura privada de fotografias para usuarios autorizados" ON storage.objects;
CREATE POLICY "Lectura privada de fotografias para usuarios autorizados"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'student-photos'
        AND public.is_authorized_user()
    );

DROP POLICY IF EXISTS "Carga privada de fotografias JPG para usuarios autorizados" ON storage.objects;
CREATE POLICY "Carga privada de fotografias JPG para usuarios autorizados"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'student-photos'
        AND public.is_authorized_user()
        AND (storage.extension(name) = 'jpg' OR storage.extension(name) = 'jpeg')
    );

DROP POLICY IF EXISTS "Actualizacion privada de fotografias para usuarios autorizados" ON storage.objects;
CREATE POLICY "Actualizacion privada de fotografias para usuarios autorizados"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'student-photos'
        AND public.is_authorized_user()
    )
    WITH CHECK (
        bucket_id = 'student-photos'
        AND public.is_authorized_user()
    );

DROP POLICY IF EXISTS "Eliminacion controlada de fotografias reemplazadas" ON storage.objects;
CREATE POLICY "Eliminacion controlada de fotografias reemplazadas"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'student-photos'
        AND public.is_authorized_user()
    );

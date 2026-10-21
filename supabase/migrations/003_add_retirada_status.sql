-- ============================================================================
-- MIGRACIÓN 003: SOPORTE PARA ESTADO 'retirada' (ESTUDIANTE TRASLADADA A OTRA IE)
-- Ejecute este script en el SQL Editor de Supabase si ya había ejecutado la 001.
-- ============================================================================

ALTER TYPE public.photo_status_type ADD VALUE IF NOT EXISTS 'retirada';

ALTER TABLE public.students
DROP CONSTRAINT IF EXISTS chk_students_photo_consistency;

ALTER TABLE public.students
ADD CONSTRAINT chk_students_photo_consistency CHECK (
    (photo_status = 'pendiente' AND photo_path IS NULL)
    OR
    (photo_status = 'retirada')
    OR
    (photo_status = 'completada' AND photo_path IS NOT NULL AND char_length(trim(photo_path)) > 0)
);

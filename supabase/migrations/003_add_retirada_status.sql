-- ============================================================================
-- MIGRACIÓN 003: SOPORTE PARA ESTADO 'retirada' (ESTUDIANTE TRASLADADA A OTRA IE)
-- Nota: Se usa photo_status::text en el CHECK para que PostgreSQL permita
-- ejecutar todo en un solo clic ("Run") sin el error 55P04 de transacción enum.
-- ============================================================================

ALTER TYPE public.photo_status_type ADD VALUE IF NOT EXISTS 'retirada';

ALTER TABLE public.students
DROP CONSTRAINT IF EXISTS chk_students_photo_consistency;

ALTER TABLE public.students
ADD CONSTRAINT chk_students_photo_consistency CHECK (
    (photo_status::text = 'pendiente' AND photo_path IS NULL)
    OR
    (photo_status::text = 'retirada')
    OR
    (photo_status::text = 'completada' AND photo_path IS NOT NULL AND char_length(trim(photo_path)) > 0)
);

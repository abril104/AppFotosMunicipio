-- ============================================================================
-- DATOS DE DEMOSTRACIÓN CLARAMENTE FICTICIOS (SOLO PARA ENTORNO DE PRUEBA)
-- Ningún DNI ni nombre corresponde a personas reales.
-- ============================================================================

INSERT INTO public.students (dni, full_name, education_level, grade, section, photo_status)
VALUES
    ('00000101', 'ALVAREZ MENDOZA, VALENTINA SOFIA (DEMO)', 'Secundaria', '1ro', 'A', 'pendiente'),
    ('00000102', 'BENITES CASTRO, CAMILA FERNANDA (DEMO)', 'Secundaria', '1ro', 'A', 'pendiente'),
    ('00000103', 'CACERES QUISPE, LUCIA GABRIELA (DEMO)', 'Secundaria', '1ro', 'A', 'pendiente'),
    ('00000104', 'DELGADO ROJAS, MARIANA PAULA (DEMO)', 'Secundaria', '1ro', 'B', 'pendiente'),
    ('00000105', 'ESPINOZA VARGAS, DANIELA ALEJANDRA (DEMO)', 'Secundaria', '1ro', 'B', 'pendiente'),
    ('00000201', 'FLORES HUAMAN, XIMENA VICTORIA (DEMO)', 'Secundaria', '2do', 'A', 'pendiente'),
    ('00000202', 'GARCIA PAREDES, RENATA ISABELLA (DEMO)', 'Secundaria', '2do', 'A', 'pendiente'),
    ('00000301', 'HERRERA SALAZAR, ANTONELLA MIA (DEMO)', 'Secundaria', '3ro', 'A', 'pendiente'),
    ('00000401', 'IBAÑEZ TORRES, VALERIA NICOLE (DEMO)', 'Secundaria', '4to', 'A', 'pendiente'),
    ('00000501', 'JIMENEZ RAMIREZ, ANDREA CAROLINA (DEMO)', 'Secundaria', '5to', 'A', 'pendiente')
ON CONFLICT (dni) DO NOTHING;

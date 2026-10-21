-- ============================================================================
-- MIGRACIÓN 004: CREACIÓN Y ACTIVACIÓN DE USUARIO PARA NIVEL SECUNDARIA
-- Credenciales:
--   Correo:     secundaria@colegio.edu.pe
--   Contraseña: Secundaria2026!
--   Rol:        admin (permite importar padrón de Secundaria, tomar fotos y exportar ZIP)
-- ============================================================================

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    -- 1. Verificar si el usuario ya existe en auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = 'secundaria@colegio.edu.pe'
    LIMIT 1;

    -- 2. Si no existe aún, crearlo directamente en auth.users con contraseña encriptada (bcrypt)
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            'secundaria@colegio.edu.pe',
            crypt('Secundaria2026!', gen_salt('bf')),
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Coordinación Secundaria","role":"admin"}'::jsonb,
            NOW(),
            NOW(),
            '',
            '',
            '',
            ''
        );

        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', 'secundaria@colegio.edu.pe', 'email_verified', true),
            'email',
            v_user_id::text,
            NOW(),
            NOW(),
            NOW()
        );
    ELSE
        -- Si ya fue creado por API, asegurar que su correo esté confirmado y contraseña sea Secundaria2026!
        UPDATE auth.users
        SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            encrypted_password = crypt('Secundaria2026!', gen_salt('bf')),
            updated_at = NOW()
        WHERE id = v_user_id;
    END IF;

    -- 3. Asegurar su perfil activo en public.profiles
    INSERT INTO public.profiles (id, email, full_name, role, is_active)
    VALUES (v_user_id, 'secundaria@colegio.edu.pe', 'Coordinación Secundaria', 'admin', TRUE)
    ON CONFLICT (id) DO UPDATE
    SET full_name = 'Coordinación Secundaria',
        role = 'admin',
        is_active = TRUE,
        updated_at = NOW();
END $$;

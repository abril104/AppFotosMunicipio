-- ============================================================================
-- MIGRACIÓN 005: NIVEL EDUCATIVO POR USUARIO (Primaria / Secundaria / ALL)
--                Y CREACIÓN DIRECTA DE CUENTAS DESDE LA APLICACIÓN WEB
-- ============================================================================

-- 1. Añadir columna assigned_level a public.profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS assigned_level TEXT NOT NULL DEFAULT 'ALL';

-- Asignar el usuario de secundaria creado anteriormente al nivel 'Secundaria'
UPDATE public.profiles
SET assigned_level = 'Secundaria'
WHERE email = 'secundaria@colegio.edu.pe';

-- 2. Actualizar el trigger handle_new_auth_user para capturar assigned_level desde user_metadata
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role public.user_role;
    v_name TEXT;
    v_level TEXT;
BEGIN
    v_role := COALESCE(
        (NEW.raw_user_meta_data->>'role')::public.user_role,
        'operator'::public.user_role
    );
    v_name := COALESCE(
        NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
        split_part(NEW.email, '@', 1)
    );
    v_level := COALESCE(
        NULLIF(trim(NEW.raw_user_meta_data->>'assigned_level'), ''),
        'ALL'
    );

    INSERT INTO public.profiles (id, email, full_name, role, assigned_level, is_active)
    VALUES (NEW.id, NEW.email, v_name, v_role, v_level, TRUE)
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        assigned_level = EXCLUDED.assigned_level,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

-- 3. Función RPC para que un Administrador cree cuentas nuevas desde la web (con correo ya confirmado)
CREATE OR REPLACE FUNCTION public.admin_create_user_account(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role TEXT DEFAULT 'operator',
    p_assigned_level TEXT DEFAULT 'ALL'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_clean_email TEXT;
    v_role_enum public.user_role;
    v_clean_level TEXT;
BEGIN
    IF NOT public.is_admin_user() THEN
        RAISE EXCEPTION 'Permiso denegado: solo los administradores pueden crear cuentas de usuario.';
    END IF;

    v_clean_email := lower(trim(p_email));
    IF v_clean_email = '' OR position('@' in v_clean_email) = 0 THEN
        RAISE EXCEPTION 'El correo electrónico ingresado no es válido.';
    END IF;

    IF char_length(p_password) < 6 THEN
        RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres.';
    END IF;

    v_role_enum := CASE WHEN p_role = 'admin' THEN 'admin'::public.user_role ELSE 'operator'::public.user_role END;
    v_clean_level := CASE
        WHEN p_assigned_level IN ('Primaria', 'Secundaria', 'ALL') THEN p_assigned_level
        ELSE 'ALL'
    END;

    -- Verificar si ya existe el usuario
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_clean_email LIMIT 1;
    IF v_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'Ya existe una cuenta registrada con el correo %.', v_clean_email;
    END IF;

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
        v_clean_email,
        crypt(p_password, gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
            'full_name', trim(p_full_name),
            'role', v_role_enum::text,
            'assigned_level', v_clean_level
        ),
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
        jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email, 'email_verified', true),
        'email',
        v_user_id::text,
        NOW(),
        NOW(),
        NOW()
    );

    INSERT INTO public.profiles (id, email, full_name, role, assigned_level, is_active)
    VALUES (v_user_id, v_clean_email, trim(p_full_name), v_role_enum, v_clean_level, TRUE)
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        assigned_level = EXCLUDED.assigned_level,
        is_active = TRUE,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'id', v_user_id,
        'email', v_clean_email,
        'full_name', trim(p_full_name),
        'role', v_role_enum::text,
        'assigned_level', v_clean_level,
        'is_active', true
    );
END;
$$;

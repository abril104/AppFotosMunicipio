# Sistema de Registro Fotográfico de Estudiantes (PWA Institucional)

Aplicación web progresiva (PWA) desarrollada con **React, TypeScript, Vite, Tailwind CSS y Supabase** para la gestión integral del registro fotográfico escolar: importación y validación de padrón Excel, captura fotográfica individual con cámara integrada (laptop o celular), almacenamiento seguro en la nube con bucket privado y exportación masiva de imágenes `.jpg` nombradas exclusivamente con el número de DNI de cada estudiante.

---

## 1. Arquitectura y Estructura del Proyecto

```text
c:\Proyectos\AppFotosMunicipio\
├── public/
│   ├── favicon.svg                 # Icono institucional de la aplicación / PWA
│   └── robots.txt                  # Bloqueo de indexación pública en buscadores
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql          # Tablas profiles, students, import_batches, índices y triggers
│   │   └── 002_rls_and_storage_policies.sql# Row Level Security (RLS), funciones RPC y bucket privado
│   └── seed_demo.sql               # Datos de prueba claramente ficticios (opcional para desarrollo)
├── src/
│   ├── components/
│   │   ├── camera/
│   │   │   ├── CameraCaptureModal.tsx      # Captura getUserMedia, vista previa, calidad JPG, reintento y avance
│   │   │   └── PhotoViewerModal.tsx        # Visualización privada con URL firmada temporal
│   │   ├── layout/
│   │   │   └── AppLayout.tsx               # Menú lateral en escritorio y navegación compacta en móviles
│   │   └── ui/
│   │       ├── Badge.tsx                   # Estados visuales: pendiente, guardada, procesando, error
│   │       ├── ConfirmDialog.tsx           # Confirmaciones previas a reemplazar fotos o eliminar registros
│   │       ├── StudentAvatar.tsx           # Miniatura privada con resolución de URL firmada
│   │       └── ToastProvider.tsx           # Sistema de notificaciones de éxito y error
│   ├── data/
│   │   └── demoStudents.ts                 # Datos ficticios para evaluación local sin credenciales
│   ├── pages/
│   │   ├── LoginPage.tsx                   # Inicio de sesión con Supabase Auth (sin registro público)
│   │   ├── DashboardPage.tsx               # Panel principal con métricas y avance por grado/sección
│   │   ├── StudentsListPage.tsx            # Filtros dependientes, tabla/tarjetas y buscador por DNI/nombre
│   │   ├── ExcelImportPage.tsx             # Validación de Excel (.xlsx/.xls) con SheetJS y vista previa editable
│   │   ├── ExportPhotosPage.tsx            # Exportación ZIP por sección, grado o padrón con JSZip
│   │   └── UsersManagementPage.tsx         # Gestión de usuarios autorizados y guía de seguridad
│   ├── services/
│   │   ├── supabaseClient.ts               # Cliente Supabase tipado + bloqueo de clave service_role
│   │   ├── authService.ts                  # Autenticación y gestión de perfiles autorizados
│   │   ├── studentService.ts               # CRUD de padrón, sincronización Realtime e importación segura
│   │   ├── storageService.ts               # Carga JPEG a bucket privado, reintentos y URLs firmadas
│   │   └── exportService.ts                # Descarga autorizada y empaquetado ZIP por lotes
│   ├── types/
│   │   ├── database.ts                     # Tipos del esquema PostgreSQL
│   │   └── domain.ts                       # Tipos de negocio, filtros, validación y exportación
│   └── utils/
│       ├── excelValidator.ts               # Validación de DNI peruano (8 dígitos texto), duplicados y actualización controlada
│       ├── academicFilter.ts               # Filtros dependientes y cálculo de estadísticas de avance
│       ├── photoProcessor.ts               # Conversión a JPEG (calidad 0.90), orientación y rutas deterministas
│       ├── permissions.ts                  # Control de acceso basado en roles (admin vs operator)
│       └── errorHandler.ts                 # Normalización de errores y redacción de DNI/tokens en logs
├── tests/
│   └── system.test.ts              # Suite automatizada de pruebas funcionales y de seguridad
├── .env.example                    # Plantilla de variables de entorno (sin credenciales reales)
├── vercel.json                     # Configuración de rutas SPA y cabeceras de seguridad para Vercel
└── vite.config.ts                  # Configuración de Vite y PWA (vite-plugin-pwa)
```

---

## 2. Requisitos Previos y Ejecución Local

1. **Instalar Node.js (versión 20 LTS o 22 LTS recomendada):**
   Verifique su instalación ejecutando:
   ```bash
   node -v
   npm -v
   ```
2. **Instalar las dependencias del proyecto:**
   ```bash
   npm install
   ```
3. **Configurar las variables de entorno:**
   Copie el archivo `.env.example` como `.env`:
   ```bash
   cp .env.example .env
   ```
   *(En Windows PowerShell: `Copy-Item .env.example .env`)*
4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abra `http://localhost:5173` en su navegador.
   > **Nota:** Si aún no ha colocado sus credenciales de Supabase en `.env`, la aplicación lo indicará de forma transparente en la parte superior y le permitirá probar todo el flujo en **Modo de Demostración Local** utilizando registros claramente ficticios.

5. **Ejecutar las pruebas automatizadas:**
   ```bash
   npm test
   ```

---

## 3. Configuración Paso a Paso de Supabase

1. **Crear un proyecto en Supabase:**
   - Ingrese a [https://supabase.com/dashboard](https://supabase.com/dashboard) y cree un nuevo proyecto.
2. **Ejecutar las migraciones SQL:**
   - En el menú lateral de Supabase, abra **SQL Editor → New query**.
   - Copie y ejecute el contenido completo de [`supabase/migrations/001_initial_schema.sql`](./supabase/migrations/001_initial_schema.sql).
   - A continuación, copie y ejecute el contenido completo de [`supabase/migrations/002_rls_and_storage_policies.sql`](./supabase/migrations/002_rls_and_storage_policies.sql).
   - *( Esto creará automáticamente las tablas `profiles`, `students`, `import_batches`, las restricciones de 8 dígitos para DNI, la función RPC `upsert_students_preserve_photos`, las políticas RLS y el bucket privado `student-photos` con límite de 5 MB y restricción exclusiva a `image/jpeg`).*
3. **Habilitar Realtime para sincronización entre dispositivos:**
   - En **Database → Publications → `supabase_realtime`**, active la tabla `public.students`. Así, cuando un operador guarde una fotografía desde una laptop, cualquier celular o computadora autorizada verá el cambio en tiempo real.
4. **Deshabilitar el registro público de usuarios:**
   - En **Authentication → Providers → Email** (o **User Signups**), desactive la opción **"Allow new users to sign up"** para garantizar que ningún tercero pueda crear cuentas por su cuenta.
5. **Conectar las claves públicas en `.env`:**
   - En **Project Settings → API**, copie:
     - `Project URL` → asígnelo a `VITE_SUPABASE_URL`
     - `Project API keys -> anon public` → asígnelo a `VITE_SUPABASE_ANON_KEY`
   - **IMPORTANTE:** Jamás copie ni utilice la clave `service_role` en `.env` ni en el frontend. El sistema incluye además un detector automático que bloquea la aplicación si detecta por error una clave `service_role`.

---

## 4. Creación Segura del Primer Usuario Administrador

Dado que el registro público está deshabilitado y no se almacenan contraseñas en tablas de la aplicación:

1. Ingrese a **Supabase Dashboard → Authentication → Users**.
2. Haga clic en **"Add user" → "Create new user"**.
3. Ingrese el correo electrónico institucional del administrador, una contraseña robusta y marque **"Auto Confirm User"**.
4. Al crearse el usuario, el trigger `on_auth_user_created` generará automáticamente su fila en `public.profiles`.
5. Para otorgarle el rol de **Administrador (`admin`)**, abra **SQL Editor** en Supabase y ejecute:
   ```sql
   UPDATE public.profiles
   SET role = 'admin',
       full_name = 'Nombre del Administrador Institucional',
       is_active = TRUE
   WHERE email = 'su-correo-admin@institucion.edu.pe';
   ```
6. A partir de ese momento, el administrador podrá iniciar sesión en la aplicación web y gestionar los roles y el estado activo de los demás operadores desde el módulo **"Usuarios y Seguridad"**.

---

## 5. Seguridad y Protección de Datos Personales de Menores

El sistema ha sido diseñado aplicando privacidad por diseño para proteger los DNI y fotografías de las estudiantes:

- **Bucket Privado (`student-photos`):** Configurado con `public = FALSE`. Ninguna fotografía posee una URL pública permanente.
- **URLs Firmadas Temporales:** La visualización de miniaturas y fotografías dentro de la aplicación emplea `createSignedUrl` con caducidad de 5 minutos (300 segundos) únicamente para sesiones autenticadas y autorizadas.
- **Row Level Security (RLS) y Separación de Roles:**
  - `admin`: Puede importar y actualizar el padrón Excel, eliminar registros con confirmación, gestionar usuarios autorizados, capturar/reemplazar fotografías y exportar archivos ZIP.
  - `operator`: Puede consultar el padrón, capturar o reemplazar fotografías y exportar archivos ZIP autorizados, pero **no puede** importar padrones Excel, eliminar estudiantes ni modificar usuarios.
- **Redacción en Registros Técnicos:** El manejador centralizado de errores (`src/utils/errorHandler.ts`) redacta automáticamente cualquier secuencia de 8 dígitos (`[DNI_PROTEGIDO]`) y tokens JWT (`[TOKEN_REDACTADO]`) para evitar filtraciones en registros de diagnóstico.
- **Procesamiento Local en el Navegador:** Tanto la lectura del Excel como la captura y conversión a JPEG (calidad `0.90`) se ejecutan localmente en el navegador del dispositivo autorizado, sin enviar imágenes a servicios externos ni motores de reconocimiento facial o IA.
- **Protección de Fotografías Existentes:** Al reimportar un padrón Excel actualizado, la función `upsert_students_preserve_photos` actualiza el grado, sección o nombre sin sobrescribir ni borrar jamás las fotografías ya registradas ni eliminar estudiantes ausentes en el nuevo archivo.

---

## 6. Instrucciones para Desplegar en Vercel

1. Suba este repositorio a una cuenta institucional de GitHub, GitLab o Bitbucket (verificando que `.env` esté excluido por `.gitignore`).
2. Ingrese a [https://vercel.com](https://vercel.com) y seleccione **"Add New... → Project"**.
3. Importe el repositorio del proyecto:
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. En la sección **Environment Variables** de Vercel, agregue únicamente:
   - `VITE_SUPABASE_URL` = `https://su-proyecto-id.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `su_clave_anon_publica`
   - `VITE_SUPABASE_STORAGE_BUCKET` = `student-photos`
   - `VITE_DEFAULT_JPEG_QUALITY` = `0.90`
5. Haga clic en **Deploy**. El archivo `vercel.json` incluido configurará automáticamente las reglas de enrutamiento SPA y las cabeceras de seguridad HTTP (`Permissions-Policy: camera=(self)`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`).

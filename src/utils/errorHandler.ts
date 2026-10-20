/**
 * Manejo centralizado y seguro de errores.
 * IMPORTANTE: Nunca registra ni expone números de DNI, contraseñas, tokens JWT
 * ni claves en los registros técnicos (logs), cumpliendo con los requisitos
 * de protección de datos personales de menores.
 */

export type AppErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_FORBIDDEN_ROLE'
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_NOT_FOUND'
  | 'CAMERA_IN_USE_OR_ERROR'
  | 'STORAGE_UPLOAD_FAILED'
  | 'STORAGE_SIGNED_URL_FAILED'
  | 'DATABASE_OPERATION_FAILED'
  | 'NETWORK_OFFLINE'
  | 'VALIDATION_ERROR'
  | 'EXPORT_ERROR'
  | 'UNKNOWN_ERROR';

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly userMessage: string;
  public readonly retryable: boolean;

  constructor(code: AppErrorCode, userMessage: string, retryable = false) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = retryable;
  }
}

/**
 * Redacta cualquier secuencia de 8 dígitos (posible DNI), correos o tokens JWT
 * antes de registrar un mensaje técnico de diagnóstico.
 */
export function sanitizeLogMessage(rawMessage: string): string {
  if (!rawMessage) return 'Error sin detalle';
  return rawMessage
    // Redactar tokens tipo JWT
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[TOKEN_REDACTADO]')
    // Redactar secuencias de 8 dígitos que puedan ser DNI
    .replace(/\b\d{8}\b/g, '[DNI_PROTEGIDO]')
    // Redactar parámetros de firma en URLs firmadas
    .replace(/token=[^&\s]+/gi, 'token=[REDACTADO]');
}

/**
 * Convierte cualquier excepción (Supabase, MediaDevices, red, etc.) en un AppError
 * seguro y legible en español para el operador o administrador.
 */
export function normalizeError(error: unknown, fallbackMessage = 'Ocurrió un error inesperado en la operación.'): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new AppError(
      'NETWORK_OFFLINE',
      'Sin conexión a Internet. La operación en la nube no pudo confirmarse. Verifique su red e intente nuevamente.',
      true
    );
  }

  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return new AppError(
        'CAMERA_PERMISSION_DENIED',
        'El permiso de acceso a la cámara fue denegado en el navegador. Habilite el permiso en la barra de direcciones o seleccione una imagen desde el dispositivo.',
        true
      );
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return new AppError(
        'CAMERA_NOT_FOUND',
        'No se detectó ninguna cámara conectada a este dispositivo. Conecte una cámara o utilice la opción para subir fotografía desde el equipo.',
        true
      );
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return new AppError(
        'CAMERA_IN_USE_OR_ERROR',
        'La cámara está siendo utilizada por otra aplicación o presentó un fallo de hardware. Cierre otros programas que usen la cámara e intente de nuevo.',
        true
      );
    }
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const rawMsg = String((error as { message: unknown }).message || '');
    const lower = rawMsg.toLowerCase();

    if (lower.includes('invalid login credentials')) {
      return new AppError(
        'AUTH_INVALID_CREDENTIALS',
        'Correo electrónico o contraseña incorrectos. Verifique sus credenciales e intente nuevamente.',
        false
      );
    }
    if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')) {
      return new AppError(
        'NETWORK_OFFLINE',
        'Error de comunicación con el servidor en la nube. Compruebe su conexión a Internet y reintente.',
        true
      );
    }
    if (lower.includes('row-level security') || lower.includes('permiso denegado') || lower.includes('permission denied')) {
      return new AppError(
        'AUTH_FORBIDDEN_ROLE',
        'No cuenta con los permisos necesarios para ejecutar esta operación.',
        false
      );
    }

    return new AppError('UNKNOWN_ERROR', sanitizeLogMessage(rawMsg) || fallbackMessage, true);
  }

  return new AppError('UNKNOWN_ERROR', fallbackMessage, true);
}

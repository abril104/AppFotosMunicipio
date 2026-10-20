export type UserRole = 'admin' | 'operator';

export type PhotoStatus = 'pendiente' | 'completada';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Student {
  id: string;
  dni: string; // Texto de 8 dígitos (preserva ceros iniciales)
  full_name: string;
  education_level?: string;
  grade: string;
  section: string;
  photo_path: string | null;
  photo_status: PhotoStatus;
  photo_updated_at: string | null;
  photo_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportBatch {
  id: string;
  file_name: string;
  imported_by: string;
  total_rows: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  notes: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      students: {
        Row: Student;
        Insert: Omit<Student, 'id' | 'created_at' | 'updated_at' | 'photo_path' | 'photo_status' | 'photo_updated_at' | 'photo_updated_by'> & {
          id?: string;
          photo_path?: string | null;
          photo_status?: PhotoStatus;
          photo_updated_at?: string | null;
          photo_updated_by?: string | null;
        };
        Update: Partial<Omit<Student, 'id' | 'created_at'>>;
      };
      import_batches: {
        Row: ImportBatch;
        Insert: Omit<ImportBatch, 'id' | 'created_at'>;
        Update: Partial<Omit<ImportBatch, 'id' | 'created_at'>>;
      };
    };
  };
}

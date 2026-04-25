import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Users table
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Email uniqueness is enforced at the API layer (case-insensitive).
  email: text('email').notNull(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['instructor', 'student'] }).notNull(),
  // Students have an instrument; instructors should be NULL.
  instrument: text('instrument'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Classrooms table
export const classrooms = sqliteTable('classrooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  instructorId: integer('instructor_id').references(() => users.id).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Student-Classroom join table
export const studentClassrooms = sqliteTable('student_classrooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  studentId: integer('student_id').references(() => users.id).notNull(),
  classroomId: integer('classroom_id').references(() => classrooms.id).notNull(),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Music sheets with REAL extracted notes
export const musicSheets = sqliteTable('music_sheets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  uploadedBy: integer('uploaded_by').references(() => users.id).notNull(),
  audioPath: text('audio_path').notNull(), // File path instead of base64
  duration: real('duration').notNull(),
  tempo: real('tempo'), // Detected BPM
  key: text('key'), // Detected key signature
  timeSignature: text('time_signature'),
  difficulty: text('difficulty', { enum: ['easy', 'medium', 'hard'] }).default('medium'),
  // REAL notes extracted by Basic Pitch - stored as JSON
  notesJson: text('notes_json').notNull(),
  // Optional: store raw Klangio multi-part score JSON for per-instrument views.
  klangioJobId: text('klangio_job_id'),
  klangioModel: text('klangio_model'),
  klangioJson: text('klangio_json'),
  // Optional: downloadable artifacts produced by Klangio jobs (stored on disk, served from /uploads).
  klangioJsonPath: text('klangio_json_path'),
  klangioMxmlPath: text('klangio_mxml_path'),
  klangioMidiQuantPath: text('klangio_midi_quant_path'),
  klangioPdfPath: text('klangio_pdf_path'),
  klangioGp5Path: text('klangio_gp5_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Assignments
export const assignments = sqliteTable('assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  musicSheetId: integer('music_sheet_id').references(() => musicSheets.id).notNull(),
  studentId: integer('student_id').references(() => users.id),
  classroomId: integer('classroom_id').references(() => classrooms.id),
  // For classroom-wide assignments, we create a template assignment (student_id NULL).
  // When a member starts practicing, we create a per-student copy pointing back to the template id.
  templateAssignmentId: integer('template_assignment_id'),
  assignedBy: integer('assigned_by').references(() => users.id).notNull(),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  status: text('status', { enum: ['assigned', 'in_progress', 'completed'] }).default('assigned'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Practice sessions with REAL scores
export const practiceSessions = sqliteTable('practice_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assignmentId: integer('assignment_id').references(() => assignments.id).notNull(),
  studentId: integer('student_id').references(() => users.id).notNull(),
  // Real metrics from actual pitch detection
  accuracyScore: real('accuracy_score').notNull(), // 0-100
  timingScore: real('timing_score').notNull(), // 0-100
  totalNotes: integer('total_notes').notNull(),
  correctNotes: integer('correct_notes').notNull(),
  wrongNotes: integer('wrong_notes').notNull(),
  missedNotes: integer('missed_notes').notNull(),
  // Detailed performance data as JSON
  performanceJson: text('performance_json'), // Note-by-note breakdown
  duration: real('duration').notNull(), // Practice duration in seconds
  // Optional: the inferred/recorded wall-clock start time for this session (UTC).
  startedAt: integer('started_at', { mode: 'timestamp' }),
  // Human-editable completion datetime (ISO 8601 UTC recommended).
  completedAt: text('completed_at').notNull(),
});

// Feedback submissions
export const feedback = sqliteTable('feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  role: text('role', { enum: ['instructor', 'student'] }).notNull(),
  category: text('category').notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  rating: integer('rating'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Notifications (student-only for now)
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id).notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  assignmentId: integer('assignment_id').references(() => assignments.id),
  musicSheetId: integer('music_sheet_id').references(() => musicSheets.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  readAt: integer('read_at', { mode: 'timestamp' }),
});

// TypeScript types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Classroom = typeof classrooms.$inferSelect;
export type NewClassroom = typeof classrooms.$inferInsert;
export type MusicSheet = typeof musicSheets.$inferSelect;
export type NewMusicSheet = typeof musicSheets.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type PracticeSession = typeof practiceSessions.$inferSelect;
export type NewPracticeSession = typeof practiceSessions.$inferInsert;
export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// Note type for extracted music data
export interface ExtractedNote {
  pitch: string;        // e.g., "C4", "F#5"
  frequency: number;    // Hz
  startTime: number;    // seconds from start
  duration: number;     // note length in seconds
  velocity: number;     // 0-1 intensity
  confidence: number;   // 0-1 detection confidence
}

// Performance record for each note during practice
export interface NotePerformance {
  expectedNote: ExtractedNote;
  playedPitch: string | null;
  playedFrequency: number | null;
  timingOffset: number; // ms early/late
  isCorrect: boolean;
  timestamp: number;
}

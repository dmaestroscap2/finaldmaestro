/**
 * API Client for DMAESTRO Backend
 * Handles authentication, requests, and error handling
 */

// Prefer configuring the API base in Vercel/production via Vite env vars:
// - VITE_API_BASE (e.g. "https://your-backend.example.com/api" or "/api")
export const API_BASE: string =
  (import.meta as any)?.env?.VITE_API_BASE?.toString?.() || "http://localhost:3001/api";

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
    }));
    throw new Error(error.error || "API request failed");
  }

  return response.json();
}

// Auth endpoints
export const authAPI = {
  login: (email: string, password: string, role?: "instructor" | "student") =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, role }),
    }),

  signup: (
    email: string,
    password: string,
    name: string,
    role: "instructor" | "student",
    instrument?: string
  ) =>
    apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        name,
        role,
        instrument,
      }),
    }),

  logout: () =>
    apiRequest("/auth/logout", {
      method: "POST",
    }),

  me: () => apiRequest("/auth/me"),
};

// Music endpoints
export const musicAPI = {
  list: () => apiRequest("/music"),

  remove: (id: number) =>
    apiRequest(`/music/${id}`, {
      method: "DELETE",
    }),

  get: (
    id: number,
    opts?: {
      instrument?: string | null;
      source?: "klang_json" | "midi_quant" | "stored";
    }
  ) => {
    const params = new URLSearchParams();
    if (opts?.instrument) params.set("instrument", opts.instrument);
    if (opts?.source) params.set("source", opts.source);
    const q = params.toString() ? `?${params.toString()}` : "";
    return apiRequest(`/music/${id}${q}`);
  },

  uploadAndTranscribe: (file: File, title: string, artist: string) => {
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("title", title);
    formData.append("artist", artist);

    return fetch(`${API_BASE}/music/transcribe-klangio`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Upload failed");
      }
      return res.json();
    });
  },
};

// ML Server status
export const mlAPI = {
  status: () => apiRequest("/ml/status"),
};

// Classrooms
export const classroomAPI = {
  list: () => apiRequest("/classrooms"),

  rosterProgress: () => apiRequest("/classrooms/roster-progress"),

  create: (name: string) =>
    apiRequest("/classrooms", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  update: (id: number, name: string) =>
    apiRequest(`/classrooms/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),

  remove: (id: number) =>
    apiRequest(`/classrooms/${id}`, {
      method: "DELETE",
    }),

  join: (code: string) =>
    apiRequest("/classrooms/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  removeMember: (classroomId: number, studentId: number) =>
    apiRequest(`/classrooms/${classroomId}/members/${studentId}`, {
      method: "DELETE",
    }),
};

// Assignments
export const assignmentAPI = {
  list: () => apiRequest("/assignments"),

  create: (musicSheetId: number, studentId?: number | null, classroomId?: number | null) =>
    apiRequest("/assignments", {
      method: "POST",
      body: JSON.stringify({
        musicSheetId,
        studentId: studentId ?? null,
        classroomId: classroomId ?? null,
      }),
    }),

  start: (assignmentId: number) =>
    apiRequest(`/assignments/${assignmentId}/start`, {
      method: "POST",
    }),
};

// Practice sessions
export const sessionAPI = {
  list: () => apiRequest("/sessions"),

  listForInstructor: () => apiRequest("/sessions/instructor"),

  create: (
    assignmentId: number,
    accuracyScore: number,
    timingScore: number,
    totalNotes: number,
    correctNotes: number,
    wrongNotes: number,
    missedNotes: number,
    opts?: {
      performanceData?: unknown;
      duration?: number;
      passed?: boolean;
      // Unix epoch seconds (UTC). Optional; server will infer if missing.
      startedAt?: number;
      completedAt?: number;
    }
  ) =>
    apiRequest("/sessions", {
      method: "POST",
      body: JSON.stringify({
        assignmentId,
        accuracyScore,
        timingScore,
        totalNotes,
        correctNotes,
        wrongNotes,
        missedNotes,
        performanceData: opts?.performanceData,
        duration: opts?.duration,
        passed: opts?.passed,
        startedAt: opts?.startedAt,
        completedAt: opts?.completedAt,
      }),
    }),
};

export const studentsAPI = {
  list: () => apiRequest("/students"),
};

export const feedbackAPI = {
  submit: (payload: { category: string; subject: string; message: string; rating?: number | null }) =>
    apiRequest("/feedback", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const notificationsAPI = {
  list: () => apiRequest("/notifications"),
  markRead: (id: number) =>
    apiRequest(`/notifications/${id}/read`, {
      method: "POST",
    }),
  markAllRead: () =>
    apiRequest("/notifications/read-all", {
      method: "POST",
    }),
};

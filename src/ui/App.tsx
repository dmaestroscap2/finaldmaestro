import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthLayout } from "./layouts/AuthLayout";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { StudentLoginPage } from "./pages/auth/StudentLoginPage";
import { StudentSignupPage } from "./pages/auth/StudentSignupPage";
import { WelcomePage } from "./pages/auth/WelcomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { ClassroomsPage } from "./pages/ClassroomsPage";
import { MusicLibraryPage } from "./pages/MusicLibraryPage";
import { StudentsPage } from "./pages/StudentsPage";
import { SessionAnalyticsPage } from "./pages/SessionAnalyticsPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { StudentNotificationsPage } from "./pages/student/StudentNotificationsPage";
import { MusicXmlDebugPage } from "./pages/MusicXmlDebugPage";
import { StudentLayout } from "./layouts/StudentLayout";
import { StudentDashboardPage } from "./pages/student/StudentDashboardPage";
import { StudentTrainerPage } from "./pages/student/StudentTrainerPage";
import { StudentPracticePage } from "./pages/student/StudentPracticePage";
import { StudentAssignmentsPage } from "./pages/student/StudentAssignmentsPage";
import { StudentAnalyticsPage } from "./pages/student/StudentAnalyticsPage";
import { StudentFeedbackPage } from "./pages/student/StudentFeedbackPage";
import { StudentPracticePlayerPage } from "./pages/student/StudentPracticePlayerPage";

export function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/student/login" element={<StudentLoginPage />} />
        <Route path="/student/signup" element={<StudentSignupPage />} />
      </Route>

      <Route element={<AppLayout />}>
        <Route path="/instructor/dashboard" element={<DashboardPage />} />
        <Route path="/instructor/classrooms" element={<ClassroomsPage />} />
        <Route path="/instructor/library" element={<MusicLibraryPage />} />
        <Route path="/instructor/debug/musicxml" element={<MusicXmlDebugPage />} />
        <Route path="/instructor/students" element={<StudentsPage />} />
        <Route
          path="/instructor/session-analytics"
          element={<SessionAnalyticsPage />}
        />
        <Route path="/instructor/feedback" element={<FeedbackPage />} />
        {/* No instructor notifications */}
      </Route>

      <Route element={<StudentLayout />}>
        <Route path="/student/dashboard" element={<StudentDashboardPage />} />
        <Route path="/student/trainer" element={<StudentTrainerPage />} />
        <Route path="/student/practice" element={<StudentPracticePage />} />
        <Route path="/student/practice/session" element={<StudentPracticePlayerPage />} />
        <Route path="/student/assignments" element={<StudentAssignmentsPage />} />
        <Route path="/student/analytics" element={<StudentAnalyticsPage />} />
        <Route path="/student/feedback" element={<StudentFeedbackPage />} />
        <Route path="/student/notifications" element={<StudentNotificationsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}


import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TopAdventureNavbar, WorldBackgroundDecor } from './components/ui/WorldDecorations';
import { LandingPage } from './pages/LandingPage';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { TeacherGameHostPage } from './pages/TeacherGameHostPage';
import { StudentGamePlayPage } from './pages/StudentGamePlayPage';
import { StudentDashboard } from './pages/StudentDashboard';
import { soundEngine } from './lib/soundEngine';

export const App: React.FC = () => {
  useEffect(() => {
    const handleGlobalButtonClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button')) {
        soundEngine.playClickSound();
      }
    };
    window.addEventListener('click', handleGlobalButtonClick);
    return () => window.removeEventListener('click', handleGlobalButtonClick);
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col relative">
          <WorldBackgroundDecor />
          <TopAdventureNavbar />
          <main className="flex-1">
            <Routes>
              {/* Student Portal Routes (Zero Teacher UI) */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/play/:roomId" element={<StudentGamePlayPage />} />

              {/* Dedicated Teacher Portal Routes */}
              <Route path="/teacher" element={<TeacherDashboard />} />
              <Route path="/teacher/room/:roomId" element={<TeacherGameHostPage />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;

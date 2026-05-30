import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '@/app/pages/LoginPage';
import { WordsPage } from '@/app/pages/WordsPage';
import { RegisterPage } from '@/app/pages/RegisterPage';
import { MyPage } from '@/app/pages/MyPage';
import { HomePage } from '@/app/pages/HomePage';
import { UploadPage } from '@/app/pages/UploadPage';
import { TranslatePage } from '@/app/pages/TranslatePage';
import { StudyPage } from '@/app/pages/StudyPage';
import { ProcessingPage } from '@/app/pages/ProcessingPage';
import { DashboardPage } from '@/app/pages/DashboardPage';
import { ForgotPasswordPage } from '@/app/pages/ForgotPasswordPage';

export const router = createBrowserRouter([
  { path: '/',                  element: <HomePage /> },
  { path: '/login',             element: <LoginPage /> },
  { path: '/forgot-password',   element: <ForgotPasswordPage /> },
  { path: '/join',              element: <RegisterPage /> },
  { path: '/dashboard',         element: <DashboardPage /> },
  { path: '/upload',            element: <UploadPage /> },
  { path: '/mypage',            element: <MyPage /> },
  { path: '/words',             element: <WordsPage /> },
  { path: '/study',             element: <StudyPage /> },
  { path: '/processing',        element: <ProcessingPage /> },
  { path: '/translate/:projectId', element: <TranslatePage /> },
  { path: '*',                  element: <Navigate to="/" replace /> },
]);
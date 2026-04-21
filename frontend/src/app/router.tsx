import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout';
import { LoginPage } from '@/app/pages/LoginPage';
import { WordsPage } from '@/app/pages/WordsPage';
import { RegisterPage } from '@/app/pages/RegisterPage';
import { MyPage } from '@/app/pages/MyPage';
import { HomePage } from '@/app/pages/HomePage';
import { UploadPage } from '@/app/pages/UploadPage';
import { TranslatePage } from '@/app/pages/TranslatePage';
import { StudyPage } from '@/app/pages/StudyPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },

  {
    path: '/login',
    element: <LoginPage />,
  },

  {
    path: '/upload',
    element: <UploadPage />,
  },

  {
    path: '/join',
    element: <RegisterPage />, 
  },

  {
    path: '/words',
    element: (
      <Layout>
        <WordsPage />
      </Layout>
    )
  },

  {
    path: '/mypage',
    element: (
      <Layout>
        <MyPage />
      </Layout>
    )
  },
  
  {
    path: '/translate',
    element: <TranslatePage />,
  },
  {
    path: '/study',
    element: <StudyPage />,
  },

  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
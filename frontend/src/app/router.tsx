import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '../App';
import { LoginPage } from '@/app/pages/LoginPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

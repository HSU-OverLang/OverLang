import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { setAuthTokenGetter } from '@/api/client';
import { registerWithFirebase } from '@/api/auth';

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
};

type AuthContextValue = AuthState & {
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getIdToken = useCallback(
    async (forceRefresh = false) => (user ? user.getIdToken(forceRefresh) : null),
    [user]
  );

  useEffect(() => {
    setAuthTokenGetter(getIdToken);
  }, [getIdToken]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const callRegisterApi = useCallback(async (idToken: string) => {
    const res = await registerWithFirebase(idToken);
    if (!res.ok) {
      throw new Error('회원가입/로그인 처리에 실패했습니다.');
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const { user: u } = await signInWithPopup(auth, provider);
      setUser(u);
      const token = await u.getIdToken();
      await callRegisterApi(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '로그인에 실패했습니다.';
      setError(msg);
      throw e;
    }
  }, [callRegisterApi]);

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const { user: u } = await signInWithEmailAndPassword(auth, email, password);
        setUser(u);
        const token = await u.getIdToken();
        await callRegisterApi(token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '로그인에 실패했습니다.';
        setError(msg);
        throw e;
      }
    },
    [callRegisterApi]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const { user: u } = await createUserWithEmailAndPassword(auth, email, password);
        setUser(u);
        const token = await u.getIdToken();
        await callRegisterApi(token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '회원가입에 실패했습니다.';
        setError(msg);
        throw e;
      }
    },
    [callRegisterApi]
  );

  const logout = useCallback(async () => {
    setError(null);
    await firebaseSignOut(auth);
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      loginWithGoogle,
      loginWithEmail,
      signUpWithEmail,
      logout,
      getIdToken,
      clearError,
    }),
    [
      user,
      loading,
      error,
      loginWithGoogle,
      loginWithEmail,
      signUpWithEmail,
      logout,
      getIdToken,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

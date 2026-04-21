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
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { setAuthTokenGetter } from '@/api/client';
import { registerWithFirebase } from '@/api/auth';
import { updateProfile } from 'firebase/auth';

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
};

type AuthContextValue = AuthState & {
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  clearError: () => void;
  changePassword: (currentPw: string, newPw: string) => Promise<void>;
  deleteAccount: (currentPw: string) => Promise<void>;
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
    async (email: string, password: string, name?: string) => {
      setError(null);
      try {
        const { user: u } = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          await updateProfile(u, { displayName: name });
        }
        setUser(auth.currentUser);
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

  const changePassword = useCallback(
    async (currentPw: string, newPw: string) => {
      setError(null);
      if (!user || !user.email) throw new Error('로그인이 필요합니다.');
      try {
        const credential = EmailAuthProvider.credential(user.email, currentPw);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPw);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.';
        setError(msg);
        throw e;
      }
    },
    [user]
  );
  
  const deleteAccount = useCallback(
    async (currentPw: string) => {
      setError(null);
      if (!user || !user.email) throw new Error('로그인이 필요합니다.');
      try {
        const credential = EmailAuthProvider.credential(user.email, currentPw);
        await reauthenticateWithCredential(user, credential);
        await deleteUser(user);
        setUser(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '회원 탈퇴에 실패했습니다.';
        setError(msg);
        throw e;
      }
    },
    [user]
  );

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
      changePassword,   
      deleteAccount,    
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
      changePassword,
      deleteAccount,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

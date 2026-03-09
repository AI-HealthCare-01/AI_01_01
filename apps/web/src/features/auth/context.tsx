"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  verifyBeforeUpdateEmail,
  deleteUser,
  type User
} from "firebase/auth";

import {
  ApiError,
  bootstrapSession,
  completeBaselineAssessment,
  saveOnboardingProfile,
  signupBootstrap
} from "./api-client";
import { getFirebaseAuthClient, isFirebaseConfigured } from "./firebase";
import { clearSessionCookies, setSessionCookies } from "./session-cookie";
import type {
  BaselineAssessmentRequest,
  OnboardingProfileRequest,
  SessionContract,
  SignupBootstrapRequest
} from "./types";

export type SessionPhase = "loading" | "signed_out" | "signed_in";

interface AuthContextValue {
  phase: SessionPhase;
  firebaseUser: User | null;
  session: SessionContract | null;
  isBootstrapping: boolean;
  errorCode: string | null;
  signUpWithEmail: (email: string, password: string, request: SignupBootstrapRequest) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<SessionContract | null>;
  changeEmailWithReauth: (newEmail: string, currentPassword: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  saveOnboardingProfile: (request: OnboardingProfileRequest) => Promise<SessionContract>;
  completeBaselineAssessment: (request: BaselineAssessmentRequest) => Promise<SessionContract>;
  refreshSession: () => Promise<SessionContract | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isContinueUrlError(error: unknown): boolean {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return false;
  }

  const code = String(error.code ?? "");
  return (
    code.includes("auth/invalid-continue-uri") ||
    code.includes("auth/unauthorized-continue-uri") ||
    code.includes("auth/missing-continue-uri") ||
    code.includes("auth/invalid-dynamic-link-domain")
  );
}

async function sendVerificationWithContinueFallback(
  user: User,
  continueUrl: string | undefined
): Promise<void> {
  if (!continueUrl) {
    await sendEmailVerification(user);
    return;
  }

  try {
    await sendEmailVerification(user, { url: continueUrl });
  } catch (error) {
    if (!isContinueUrlError(error)) {
      throw error;
    }
    await sendEmailVerification(user);
  }
}

async function sendPasswordResetWithContinueFallback(
  auth: ReturnType<typeof getFirebaseAuthClient>,
  email: string,
  continueUrl: string | undefined
): Promise<void> {
  if (!continueUrl) {
    await sendPasswordResetEmail(auth, email);
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email, { url: continueUrl });
  } catch (error) {
    if (!isContinueUrlError(error)) {
      throw error;
    }
    await sendPasswordResetEmail(auth, email);
  }
}

function mapErrorCode(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown_error";
}

function isLikelyInvalidCredentialError(code: string): boolean {
  return code.includes("auth/invalid-credential") || code.includes("auth/invalid-login-credentials");
}

async function classifySignInErrorCode(
  auth: ReturnType<typeof getFirebaseAuthClient>,
  email: string,
  rawCode: string
): Promise<string> {
  if (!isLikelyInvalidCredentialError(rawCode)) {
    return rawCode;
  }

  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    const normalizedMethods = methods.map((method) => method.toLowerCase());

    if (normalizedMethods.includes("password")) {
      return "auth/wrong-password";
    }

    if (normalizedMethods.length > 0) {
      return "auth/account-exists-with-different-credential";
    }

    return "auth/user-not-found";
  } catch (lookupError) {
    const lookupCode = mapErrorCode(lookupError);
    if (lookupCode.includes("auth/too-many-requests")) {
      return "auth/too-many-requests";
    }
    if (lookupCode.includes("auth/network-request-failed")) {
      return "auth/network-request-failed";
    }
    return rawCode;
  }
}

function resolveContinueUrl(pathname: string): string | undefined {
  const baseFromEnv = process.env.NEXT_PUBLIC_AUTH_CONTINUE_BASE_URL?.trim();
  if (baseFromEnv) {
    return new URL(pathname, baseFromEnv).toString();
  }

  if (typeof window !== "undefined") {
    return new URL(pathname, window.location.origin).toString();
  }

  return undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionContract | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const bootstrapForUser = useCallback(async (user: User): Promise<SessionContract | null> => {
    try {
      setIsBootstrapping(true);
      const nextSession = await bootstrapSession(user);
      setSession(nextSession);
      setSessionCookies(nextSession.account.account_status, nextSession.onboarding.onboarding_status);
      setErrorCode(null);
      return nextSession;
    } catch (error) {
      setErrorCode(mapErrorCode(error));
      return null;
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<SessionContract | null> => {
    if (!firebaseUser) {
      setSession(null);
      clearSessionCookies();
      return null;
    }

    return bootstrapForUser(firebaseUser);
  }, [bootstrapForUser, firebaseUser]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setPhase("signed_out");
      setErrorCode("firebase_config_missing");
      return;
    }

    const auth = getFirebaseAuthClient();
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setFirebaseUser(nextUser);

      if (!nextUser) {
        setPhase("signed_out");
        setSession(null);
        setErrorCode(null);
        clearSessionCookies();
        return;
      }

      setPhase("signed_in");
      await bootstrapForUser(nextUser);
    });

    return () => unsubscribe();
  }, [bootstrapForUser]);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, request: SignupBootstrapRequest) => {
      const auth = getFirebaseAuthClient();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      const continueUrl = resolveContinueUrl("/auth/verify-email?source=email-action");
      let signupShellSaved = false;

      try {
        await updateProfile(user, { displayName: request.nickname });
        await signupBootstrap({
          ...request,
          firebase_uid: user.uid,
          email: user.email ?? request.email
        });
        signupShellSaved = true;
        await sendVerificationWithContinueFallback(user, continueUrl);
        await bootstrapForUser(user);
      } catch (error) {
        if (!signupShellSaved) {
          try {
            await deleteUser(user);
          } catch {
            // no-op: signup retry guidance is handled at UI layer
          }
        }
        throw error;
      }
    },
    [bootstrapForUser]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<SessionContract | null> => {
      const auth = getFirebaseAuthClient();
      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        return bootstrapForUser(credential.user);
      } catch (error) {
        const rawCode = mapErrorCode(error);
        const classifiedCode = await classifySignInErrorCode(auth, email, rawCode);
        throw new Error(classifiedCode);
      }
    },
    [bootstrapForUser]
  );

  const changeEmailWithReauth = useCallback(
    async (newEmail: string, currentPassword: string) => {
      if (!firebaseUser || !firebaseUser.email) {
        throw new Error("auth/no-current-user");
      }

      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);

      const continueUrl = resolveContinueUrl("/auth/verify-email?source=email-action");
      if (!continueUrl) {
        await verifyBeforeUpdateEmail(firebaseUser, newEmail);
        return;
      }

      try {
        await verifyBeforeUpdateEmail(firebaseUser, newEmail, { url: continueUrl });
      } catch (error) {
        if (!isContinueUrlError(error)) {
          throw error;
        }
        await verifyBeforeUpdateEmail(firebaseUser, newEmail);
      }
    },
    [firebaseUser]
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!firebaseUser) {
      throw new Error("auth/no-current-user");
    }
    const continueUrl = resolveContinueUrl("/auth/verify-email?source=email-action");
    await sendVerificationWithContinueFallback(firebaseUser, continueUrl);
  }, [firebaseUser]);

  const sendPasswordReset = useCallback(async (email: string) => {
    const auth = getFirebaseAuthClient();
    const continueUrl = resolveContinueUrl("/auth/login?source=password-reset");
    await sendPasswordResetWithContinueFallback(auth, email, continueUrl);
  }, []);

  const saveProfile = useCallback(
    async (request: OnboardingProfileRequest): Promise<SessionContract> => {
      if (!firebaseUser) {
        throw new Error("auth/no-current-user");
      }

      const nextSession = await saveOnboardingProfile(firebaseUser, request);
      setSession(nextSession);
      setSessionCookies(nextSession.account.account_status, nextSession.onboarding.onboarding_status);
      return nextSession;
    },
    [firebaseUser]
  );

  const completeBaseline = useCallback(
    async (request: BaselineAssessmentRequest): Promise<SessionContract> => {
      if (!firebaseUser) {
        throw new Error("auth/no-current-user");
      }

      const nextSession = await completeBaselineAssessment(firebaseUser, request);
      setSession(nextSession);
      setSessionCookies(nextSession.account.account_status, nextSession.onboarding.onboarding_status);
      return nextSession;
    },
    [firebaseUser]
  );

  const logout = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      return;
    }

    const auth = getFirebaseAuthClient();
    await signOut(auth);
    setSession(null);
    clearSessionCookies();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      phase,
      firebaseUser,
      session,
      isBootstrapping,
      errorCode,
      signUpWithEmail,
      signInWithEmail,
      changeEmailWithReauth,
      resendVerificationEmail,
      sendPasswordReset,
      saveOnboardingProfile: saveProfile,
      completeBaselineAssessment: completeBaseline,
      refreshSession,
      logout
    }),
    [
      completeBaseline,
      errorCode,
      firebaseUser,
      isBootstrapping,
      logout,
      phase,
      refreshSession,
      changeEmailWithReauth,
      resendVerificationEmail,
      saveProfile,
      sendPasswordReset,
      session,
      signInWithEmail,
      signUpWithEmail
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return context;
}

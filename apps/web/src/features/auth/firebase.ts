import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

interface FirebaseRuntimeConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
}

let emulatorConnected = false;

function isTrue(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "on";
}

function shouldUseAuthEmulator(): boolean {
  return isTrue(process.env.NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR);
}

function getFirebaseConfig(): FirebaseRuntimeConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "";
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "";
  const emulatorHost = (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "").trim();
  const useAuthEmulator = shouldUseAuthEmulator();

  if (!apiKey || !authDomain || !projectId || !appId || !messagingSenderId) {
    // Allow local auth emulator usage even when explicit Firebase web config is missing.
    if (useAuthEmulator && emulatorHost) {
      const fallbackProjectId = projectId || "demo-mindsight";
      return {
        apiKey: apiKey || "demo-api-key",
        authDomain: authDomain || `${fallbackProjectId}.firebaseapp.com`,
        projectId: fallbackProjectId,
        appId: appId || "1:000000000000:web:0000000000000000000000",
        messagingSenderId: messagingSenderId || "000000000000"
      };
    }
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId
  };
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

export function getFirebaseApp(): FirebaseApp {
  const config = getFirebaseConfig();
  if (!config) {
    throw new Error("firebase_config_missing");
  }

  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp(config);
}

export function getFirebaseAuthClient(): Auth {
  const app = getFirebaseApp();
  const auth = getAuth(app);
  const languageCode = (process.env.NEXT_PUBLIC_FIREBASE_AUTH_LANGUAGE_CODE ?? "ko").trim();
  if (languageCode) {
    auth.languageCode = languageCode;
  }

  const emulatorHost = shouldUseAuthEmulator()
    ? (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "").trim()
    : "";
  if (emulatorHost && !emulatorConnected) {
    connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
    emulatorConnected = true;
  }

  return auth;
}

export function isAuthEmulatorEnabled(): boolean {
  return shouldUseAuthEmulator() && Boolean((process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "").trim());
}

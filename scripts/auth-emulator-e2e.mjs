#!/usr/bin/env node

import { randomUUID } from "node:crypto";

import { initializeApp } from "firebase/app";
import {
  applyActionCode,
  confirmPasswordReset,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode,
} from "firebase/auth";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-mindsight";
const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const emulatorBaseUrl = `http://${emulatorHost}`;
const continueBaseUrl = process.env.AUTH_CONTINUE_BASE_URL ?? "http://127.0.0.1:3001";
const continueVerifyUrl = `${continueBaseUrl}/auth/verify-email?source=email-action`;
const continueResetUrl = `${continueBaseUrl}/auth/login?source=password-reset`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(path, options = undefined) {
  const response = await fetch(`${emulatorBaseUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`request_failed ${path} status=${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function getLatestOobCodes(email) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const payload = await fetchJson(`/emulator/v1/projects/${projectId}/oobCodes`);
    const rows = Array.isArray(payload?.oobCodes)
      ? payload.oobCodes.filter((code) => code.email === email)
      : [];
    if (rows.length >= 2) {
      return rows;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return [];
}

function parseContinueUrl(link) {
  const parsed = new URL(link);
  return parsed.searchParams.get("continueUrl");
}

function normalizePath(urlText) {
  const parsed = new URL(urlText);
  return `${parsed.pathname}${parsed.search}`;
}

async function main() {
  await fetchJson(`/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });

  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-api-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    appId:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
      "1:000000000000:web:0000000000000000000000",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "000000000000",
    projectId,
  });

  const auth = getAuth(app);
  connectAuthEmulator(auth, emulatorBaseUrl, { disableWarnings: true });

  const seed = randomUUID().slice(0, 8);
  const email = `e2e-${seed}@example.com`;
  const oldPassword = "Temp1234!";
  const newPassword = "Temp5678!";

  const credential = await createUserWithEmailAndPassword(auth, email, oldPassword);
  await sendEmailVerification(credential.user, { url: continueVerifyUrl });
  await sendPasswordResetEmail(auth, email, { url: continueResetUrl });

  const oobCodes = await getLatestOobCodes(email);
  const verifyCode = oobCodes.find((row) => row.requestType === "VERIFY_EMAIL");
  const resetCode = oobCodes.find((row) => row.requestType === "PASSWORD_RESET");

  assert(verifyCode?.oobLink, "verify_email_oob_link_missing");
  assert(resetCode?.oobLink, "password_reset_oob_link_missing");
  assert(verifyCode?.oobCode, "verify_email_oob_code_missing");
  assert(resetCode?.oobCode, "password_reset_oob_code_missing");

  const verifyContinueUrl = parseContinueUrl(verifyCode.oobLink);
  const resetContinueUrl = parseContinueUrl(resetCode.oobLink);

  assert(verifyContinueUrl, "verify_continue_url_missing");
  assert(resetContinueUrl, "reset_continue_url_missing");
  assert(
    normalizePath(verifyContinueUrl) === normalizePath(continueVerifyUrl),
    "verify_continue_url_mismatch",
  );
  assert(
    normalizePath(resetContinueUrl) === normalizePath(continueResetUrl),
    "reset_continue_url_mismatch",
  );

  await applyActionCode(auth, verifyCode.oobCode);
  await credential.user.reload();
  assert(credential.user.emailVerified, "email_not_verified_after_action_code");

  const resetEmail = await verifyPasswordResetCode(auth, resetCode.oobCode);
  assert(resetEmail === email, "password_reset_code_email_mismatch");
  await confirmPasswordReset(auth, resetCode.oobCode, newPassword);

  await signOut(auth);
  await signInWithEmailAndPassword(auth, email, newPassword);

  console.log("PASS auth_emulator_e2e");
  console.log(`VERIFY_EMAIL_LINK=${verifyCode.oobLink}`);
  console.log(`PASSWORD_RESET_LINK=${resetCode.oobLink}`);
  console.log(`VERIFY_CONTINUE_URL=${verifyContinueUrl}`);
  console.log(`RESET_CONTINUE_URL=${resetContinueUrl}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL auth_emulator_e2e: ${message}`);
  process.exitCode = 1;
});

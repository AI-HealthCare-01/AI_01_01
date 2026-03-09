export interface LoginErrorMessageOptions {
  includeRawCode?: boolean;
}

export function mapLoginErrorMessage(code: string, options: LoginErrorMessageOptions = {}): string {
  const { includeRawCode = false } = options;

  if (code.includes("auth/user-not-found")) {
    return "등록되지 않은 이메일 계정입니다. 회원가입 여부를 확인해주세요.";
  }
  if (code.includes("auth/wrong-password")) {
    return "비밀번호가 올바르지 않습니다. 다시 입력해주세요.";
  }
  if (code.includes("auth/account-exists-with-different-credential")) {
    return "계정은 존재하지만 비밀번호 로그인 방식이 설정되어 있지 않습니다.";
  }
  if (code.includes("auth/user-disabled")) {
    return "해당 계정은 비활성화 상태입니다. 고객지원으로 문의해주세요.";
  }
  if (code.includes("auth/too-many-requests")) {
    return "로그인 시도가 많아 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("auth/network-request-failed")) {
    return "네트워크 연결을 확인한 뒤 다시 시도해주세요.";
  }
  if (code.includes("auth/invalid-api-key")) {
    return "인증 설정이 올바르지 않습니다. 관리자에게 문의해주세요.";
  }
  if (code.includes("auth/operation-not-allowed")) {
    return "현재 이메일/비밀번호 로그인이 비활성화되어 있습니다. Firebase 설정을 확인해주세요.";
  }
  if (code.includes("auth/invalid-credential") || code.includes("auth/invalid-login-credentials")) {
    return "입력한 이메일 또는 비밀번호를 확인해주세요.";
  }
  if (code.includes("firebase_token_invalid")) {
    return "로그인은 되었지만 서버 세션 확인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("missing_firebase_auth")) {
    return "인증 토큰이 누락되었습니다. 페이지를 새로고침 후 다시 시도해주세요.";
  }
  if (code.includes("account_not_found")) {
    return "계정 동기화가 완료되지 않았습니다. 잠시 후 다시 시도해주세요.";
  }
  if (code.includes("session_bootstrap_failed")) {
    return "로그인 후 계정 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  const fallback = "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.";
  if (!includeRawCode) {
    return fallback;
  }
  return `${fallback} (${code})`;
}

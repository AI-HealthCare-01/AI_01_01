import { expect, test, type Page } from "@playwright/test";

const AUTH_EMULATOR_BASE = "http://127.0.0.1:9099";
const API_BASE = "http://127.0.0.1:8000";
const API_KEY = "demo-api-key";

const PHQ9_ITEMS = Array.from({ length: 9 }, (_, index) => `PHQ9_${index + 1}`);
const GAD7_ITEMS = Array.from({ length: 7 }, (_, index) => `GAD7_${index + 1}`);
const ISI_ITEMS = Array.from({ length: 7 }, (_, index) => `ISI_${index + 1}`);

type SeededUser = {
  email: string;
  password: string;
  uid: string;
};

type ChallengeCase = {
  challengeId: string;
  challengeName: string;
  run: (page: Page) => Promise<void>;
};

function toAsciiSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "challenge";
}

function authHeaders(uid: string, email: string, verified = true): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Firebase-Uid": uid,
    "X-Firebase-Email": email,
    "X-Firebase-Email-Verified": String(verified),
  };
}

async function postJson(url: string, body: unknown, headers?: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: headers ?? { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedActiveUser(testId: string): Promise<SeededUser> {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const email = `challenge-${testId}-${stamp}@example.com`;
  const password = "Temp1234!";

  const signupAuth = await postJson(
    `${AUTH_EMULATOR_BASE}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    { email, password, returnSecureToken: true },
  );
  expect(signupAuth.ok).toBeTruthy();
  const authUser = (await signupAuth.json()) as { localId: string; idToken: string };

  const verifyAuth = await postJson(
    `${AUTH_EMULATOR_BASE}/identitytoolkit.googleapis.com/v1/accounts:update?key=${API_KEY}`,
    {
      idToken: authUser.idToken,
      localId: authUser.localId,
      emailVerified: true,
      returnSecureToken: true,
    },
  );
  expect(verifyAuth.ok).toBeTruthy();

  const bootstrapSignup = await postJson(`${API_BASE}/v1/auth/signup`, {
    firebase_uid: authUser.localId,
    email,
    nickname: `user-${stamp}`.slice(0, 16),
    terms_required: true,
    privacy_required: true,
    age_required: true,
  });
  expect(bootstrapSignup.ok).toBeTruthy();

  const bootstrapSession = await postJson(
    `${API_BASE}/v1/auth/session/bootstrap`,
    { firebase_uid: authUser.localId },
    authHeaders(authUser.localId, email, true),
  );
  expect(bootstrapSession.ok).toBeTruthy();

  const saveProfile = await postJson(
    `${API_BASE}/v1/onboarding/profile`,
    {
      birth_year: 1998,
      gender: "female",
      consents: {
        sensitive_data_required: true,
        personalization_optional: true,
        model_improvement_optional: false,
        marketing_optional: false,
      },
    },
    authHeaders(authUser.localId, email, true),
  );
  expect(saveProfile.ok).toBeTruthy();

  const assessmentStart = await postJson(
    `${API_BASE}/v1/assessments/start`,
    { source: "onboarding" },
    authHeaders(authUser.localId, email, true),
  );
  expect(assessmentStart.ok).toBeTruthy();
  const started = (await assessmentStart.json()) as { assessment_id: string };

  for (const itemCode of PHQ9_ITEMS) {
    const response = await postJson(
      `${API_BASE}/v1/assessments/${started.assessment_id}/answer`,
      { instrument: "phq9", item_code: itemCode, response_score: 1 },
      authHeaders(authUser.localId, email, true),
    );
    expect(response.ok).toBeTruthy();
  }

  for (const itemCode of GAD7_ITEMS) {
    const response = await postJson(
      `${API_BASE}/v1/assessments/${started.assessment_id}/answer`,
      { instrument: "gad7", item_code: itemCode, response_score: 1 },
      authHeaders(authUser.localId, email, true),
    );
    expect(response.ok).toBeTruthy();
  }

  for (const itemCode of ISI_ITEMS) {
    const response = await postJson(
      `${API_BASE}/v1/assessments/${started.assessment_id}/answer`,
      { instrument: "isi", item_code: itemCode, response_score: 1 },
      authHeaders(authUser.localId, email, true),
    );
    expect(response.ok).toBeTruthy();
  }

  const assessmentComplete = await fetch(`${API_BASE}/v1/assessments/${started.assessment_id}/complete`, {
    method: "POST",
    headers: authHeaders(authUser.localId, email, true),
  });
  expect(assessmentComplete.ok).toBeTruthy();

  const baselineComplete = await postJson(
    `${API_BASE}/v1/onboarding/baseline-assessment/complete`,
    { assessment_id: started.assessment_id },
    authHeaders(authUser.localId, email, true),
  );
  expect(baselineComplete.ok).toBeTruthy();

  return { email, password, uid: authUser.localId };
}

async function login(page: Page, user: SeededUser): Promise<void> {
  await page.goto("/auth/login?force=1");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByPlaceholder("비밀번호 입력").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/$/);
}

async function startChallenge(page: Page, challengeId: string): Promise<void> {
  await page.goto(`/challenge/${challengeId}/enroll`);
  await expect(page.getByText("챌린지 시작 설정")).toBeVisible();
  await page.getByRole("button", { name: "프로그램 시작" }).click();
  await page.waitForURL(/\/challenge\/session\/.+\/progress/);
  await expect(page.getByText("오늘의 활동")).toBeVisible();
}

async function saveToday(page: Page): Promise<void> {
  const saveButton = page.getByRole("button", { name: "오늘 수행 저장" });
  await expect(saveButton).toBeVisible();
  await saveButton.click();
}

async function expectSaved(page: Page, challengeName: string): Promise<void> {
  await expect(
    page.getByText(new RegExp(`오늘의 ${challengeName} 완료|챌린지 실행과 회고를 저장했습니다|목표 일수를 모두 채웠습니다`)),
  ).toBeVisible();
}

const challengeCases: ChallengeCase[] = [
  {
    challengeId: "CH_ACT_001",
    challengeName: "모닝 패턴 만들기",
    run: async (page) => {
      for (const item of [
        "기상 후 물 한 잔 마시기",
        "5분 스트레칭",
        "오늘 할 일 3가지 적기",
        "햇빛 10분 쬐기",
        "건강한 아침 식사",
      ]) {
        await page.getByText(item).click();
      }
      await saveToday(page);
    },
  },
  {
    challengeId: "CH_SLEEP_001",
    challengeName: "수면 패턴 만들기",
    run: async (page) => {
      for (const item of [
        "취침 1시간 전 휴대폰 내려놓기",
        "조명 어둡게 조절",
        "5분 스트레칭 또는 명상",
        "내일 준비물 챙기기",
        "감사한 일 1가지 떠올리기",
      ]) {
        await page.getByText(item).click();
      }
      await saveToday(page);
    },
  },
  {
    challengeId: "CH_ACT_002",
    challengeName: "햇빛 10분",
    run: async (page) => {
      await page.getByRole("button", { name: /시작하기/ }).click();
      await page.getByRole("button", { name: "🙂" }).click();
      await page.getByRole("button", { name: /☀️ 맑음/ }).click();
      await page.getByRole("button", { name: /다음 단계/ }).click();
      await page.getByRole("button", { name: "건너뛰기" }).click();
      await page.getByRole("button", { name: /다음 단계/ }).click();
      await page.getByRole("button", { name: "🙂 기분이 조금 나아졌어요" }).click();
      await page.getByRole("button", { name: "내일 같은 시간 햇빛 보기" }).click();
      await page.getByRole("button", { name: /햇빛 챌린지 완료/ }).click();
      await saveToday(page);
    },
  },
  {
    challengeId: "CH_ACT_003",
    challengeName: "산책 10분",
    run: async (page) => {
      await page.getByRole("button", { name: /오늘 산책 완료/ }).click();
    },
  },
  {
    challengeId: "CH_ACT_005",
    challengeName: "5분 명상",
    run: async (page) => {
      await page.clock.install();
      await page.getByRole("button", { name: /시작/ }).click();
      await page.clock.fastForward(301_000);
      await saveToday(page);
    },
  },
  {
    challengeId: "CH_REG_002",
    challengeName: "감각 탐험 5-4-3-2-1",
    run: async (page) => {
      await page.getByRole("button", { name: /탐험 시작/ }).click();
      for (const chip of ["🪟 창문", "🌿 식물", "💡 불빛", "📱 화면", "🪑 가구"]) {
        await page.getByRole("button", { name: chip }).click();
      }
      await page.getByRole("button", { name: /다음 감각으로/ }).click();
      for (const chip of ["🧴 부드러움", "🪨 거칠음", "🌡 따뜻함", "❄️ 차가움"]) {
        await page.getByRole("button", { name: chip }).click();
      }
      await page.getByRole("button", { name: /다음 감각으로/ }).click();
      await expect(page.getByText("선택 시작!")).toBeVisible();
      for (const chip of ["🚗 차 소리", "🌬 바람", "🎵 음악"]) {
        await page.getByRole("button", { name: chip }).click();
      }
      await page.getByRole("button", { name: /다음 감각으로/ }).click();
      await page.getByRole("button", { name: "건너뛰기" }).click();
      for (const chip of ["☕ 커피", "🌸 꽃향기"]) {
        await page.getByRole("button", { name: chip }).click();
      }
      await page.getByRole("button", { name: /다음 감각으로/ }).click();
      await page.getByRole("button", { name: "💧 물맛" }).click();
      await page.getByRole("button", { name: /감각 지도 완성/ }).click();
      await page.getByRole("button", { name: "😌 좀 나아졌어요" }).click();
      await page.getByRole("button", { name: /오늘의 감각 저장/ }).click();
      await saveToday(page);
    },
  },
  {
    challengeId: "CH_SOC_001",
    challengeName: "대인관계 지도",
    run: async (page) => {
      await page.getByRole("button", { name: "시작하기" }).click();
      await page.getByRole("button", { name: "🙂" }).click();
      await page.getByPlaceholder("이름 입력 후 Enter 또는 추가").fill("민수");
      await page.getByRole("button", { name: "추가" }).click();
      await page.locator(".imw-person-row select").nth(0).selectOption("가족");
      await page.locator(".imw-person-row select").nth(1).selectOption("가까움");
      await page.getByRole("button", { name: "다음 단계" }).click();
      await page.getByLabel("민수").check();
      await page.getByRole("button", { name: "다음 단계" }).click();
      await page.getByRole("button", { name: "관계 강화" }).click();
      await page.getByPlaceholder("어떤 행동을 해볼까요?").fill("안부 메시지 보내기");
      await page.locator('input[type="date"]').fill("2026-03-12");
      await page.getByRole("button", { name: "다음 단계" }).click();
      await page.getByRole("button", { name: "😊" }).click();
      await page.getByRole("button", { name: "챌린지 완료" }).click();
      await saveToday(page);
    },
  },
  {
    challengeId: "CH_WELL_001",
    challengeName: "자신감 리스트",
    run: async (page) => {
      await page.getByRole("button", { name: /시작하기/ }).click();
      await page.getByRole("button", { name: /누군가를 도왔다/ }).click();
      await page.getByRole("button", { name: /다음 단계/ }).click();
      await page.getByRole("button", { name: "👍" }).first().click();
      await page.getByRole("button", { name: /다음 단계/ }).click();
      await page.locator(".cf-suggest").first().click();
      await page.getByRole("button", { name: /다음 단계/ }).click();
      await page.getByRole("button", { name: /가까운 사람에게 먼저 연락해보기/ }).click();
      await page.getByRole("button", { name: /자신감 리스트 완료/ }).click();
      await saveToday(page);
    },
  },
  {
    challengeId: "water-intake",
    challengeName: "내 물고기를 살려줘",
    run: async (page) => {
      await page.getByRole("button", { name: /물고기 입양하기/ }).click();
      await page.getByRole("button", { name: "6잔" }).click();
      await page.getByRole("button", { name: /물고기 입양 완료/ }).click();
      for (let count = 0; count < 6; count += 1) {
        await page.getByRole("button", { name: /물 한 잔 마셨어요/ }).click();
      }
      await page.getByRole("button", { name: /오늘 마무리하기/ }).click();
      await page.getByRole("button", { name: /마무리 저장/ }).click();
      await saveToday(page);
    },
  },
];

test.describe("challenge content smoke", () => {
  for (const challengeCase of challengeCases) {
    test(`${challengeCase.challengeId} ${challengeCase.challengeName}`, async ({ page }, testInfo) => {
      const user = await seedActiveUser(toAsciiSlug(testInfo.title));
      await login(page, user);
      await startChallenge(page, challengeCase.challengeId);
      await challengeCase.run(page);
      await expectSaved(page, challengeCase.challengeName);
    });
  }
});

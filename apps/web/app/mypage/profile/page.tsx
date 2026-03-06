"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Input,
  PageContainer,
  SectionContainer,
  Select,
} from "../../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { MyPageTabShell } from "../../../src/features/mypage/tab-shell";
import {
  CommunityApiError,
  getMyPageHome,
  patchMyPageProfile,
} from "../../../src/features/community";

function parseError(error: unknown): string {
  if (error instanceof CommunityApiError) {
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "알 수 없는 오류가 발생했습니다.";
}

const genderOptions = [
  { label: "선택 안 함", value: "" },
  { label: "여성", value: "female" },
  { label: "남성", value: "male" },
  { label: "논바이너리", value: "nonbinary" },
  { label: "응답 안 함", value: "prefer_not_to_say" },
];

export default function MyPageProfilePage() {
  const { firebaseUser } = useAuthContext();

  const [nickname, setNickname] = useState("");
  const [coachName, setCoachName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      const home = await getMyPageHome(firebaseUser);
      setNickname(home.profile.nickname);
      setCoachName(home.profile.coach_name);
      setBirthYear(home.profile.birth_year ? String(home.profile.birth_year) : "");
      setGender(home.profile.gender ?? "");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async () => {
    if (!firebaseUser) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      setErrorMessage(null);
      await patchMyPageProfile(firebaseUser, {
        nickname,
        coach_name: coachName,
        birth_year: birthYear ? Number(birthYear) : undefined,
        gender: gender || undefined,
      });
      setMessage("회원정보가 저장되었습니다.");
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">회원정보</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="마이페이지" description="왼쪽 탭을 선택하면 해당 항목 내용을 오른쪽에서 확인할 수 있습니다.">
            <MyPageTabShell>
              {message ? <Banner variant="success" title="완료" description={message} /> : null}
              {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

              {loading ? (
                <Card title="불러오는 중" description="회원정보를 불러오고 있습니다." />
              ) : (
                <Card title="기본 정보">
                  <div className="ms-grid ms-grid--two">
                    <Input
                      label="닉네임"
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      required
                    />
                    <Input
                      label="마음코치 이름"
                      value={coachName}
                      onChange={(event) => setCoachName(event.target.value)}
                      required
                    />
                  </div>
                  <div className="ms-grid ms-grid--two">
                    <Input
                      label="출생년도(YYYY)"
                      value={birthYear}
                      onChange={(event) => setBirthYear(event.target.value)}
                      placeholder="예: 1994"
                    />
                  </div>
                  <Select
                    label="성별"
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    options={genderOptions}
                  />
                  <div className="ms-row">
                    <Button onClick={handleSubmit} loading={saving}>
                      저장
                    </Button>
                  </div>
                </Card>
              )}
            </MyPageTabShell>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}

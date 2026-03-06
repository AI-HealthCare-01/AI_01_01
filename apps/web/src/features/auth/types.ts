export type AccountStatus =
  | "pending_email_verification"
  | "active_onboarding_required"
  | "active"
  | "restricted"
  | "suspended"
  | "deleted";

export type OnboardingStatus = "not_started" | "profile_pending" | "baseline_pending" | "complete";

export type Gender = "female" | "male" | "nonbinary" | "prefer_not_to_say";

export interface SessionContract {
  account: {
    user_id: string;
    firebase_uid: string;
    nickname: string;
    coach_name: string;
    email: string;
    email_verified: boolean;
    account_status: AccountStatus;
    ml_subject_id: string;
  };
  profile: {
    birth_year: number | null;
    gender: Gender | null;
    age_years_derived: number | null;
    profile_completed_at: string | null;
  };
  consents: {
    terms_required: boolean;
    privacy_required: boolean;
    sensitive_data_required: boolean;
    personalization_optional: boolean;
    model_improvement_optional: boolean;
    marketing_optional: boolean;
  };
  onboarding: {
    onboarding_status: OnboardingStatus;
    baseline_assessment_completed: boolean;
    dashboard_bootstrapped: boolean;
    model_bootstrapped: boolean;
  };
}

export interface SignupBootstrapRequest {
  firebase_uid: string;
  email: string;
  nickname: string;
  coach_name?: string;
  terms_required: boolean;
  privacy_required: boolean;
  age_required: boolean;
}

export interface OnboardingProfileRequest {
  birth_year: number;
  gender: Gender | null;
  consents: {
    sensitive_data_required: boolean;
    personalization_optional: boolean;
    model_improvement_optional: boolean;
    marketing_optional: boolean;
  };
}

export interface BaselineAssessmentRequest {
  assessment_id: string;
}

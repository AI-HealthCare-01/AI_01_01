"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

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
  Textarea,
} from "../../../src/components/ui";
import { AdminApiError, getAdminMe } from "../../../src/features/admin-console";
import { AuthRouteGuard, useAuthContext } from "../../../src/features/auth";
import { CommunityApiError, createBoardPost } from "../../../src/features/community";
import { ANALYTICS_EVENTS, trackEvent } from "../../../src/features/monitoring";
import { useEffect } from "react";

const MAX_IMAGE_COUNT = 4;
const MAX_LOCAL_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_POST_BODY_BYTES = 4500;
const MAX_IMAGE_DIMENSION = 1600;
const TARGET_IMAGE_BYTES = 1.5 * 1024 * 1024;

function parseError(error: unknown): string {
  if (error instanceof CommunityApiError) {
    if (error.message === "notice_admin_required") {
      return "공지 작성은 관리자(support/admin/owner) 권한에서만 가능합니다.";
    }
    if (error.message === "invalid_post_body_bytes") {
      return `본문은 UTF-8 기준 ${MAX_POST_BODY_BYTES.toLocaleString()}bytes 이내로 입력해주세요.`;
    }
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

function parseCommaList(value: string, limit: number): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isLikelyImageUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^https?:\/\/\S+/i.test(trimmed) || /^data:image\/[a-zA-Z+.-]+;base64,/i.test(trimmed);
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = url;
  });
}

async function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });

  if (!blob) {
    throw new Error("image_encode_failed");
  }

  return toDataUrl(new File([blob], "resized-image", { type: blob.type }));
}

async function resizeLocalImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("invalid_image_type");
  }

  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    if (file.size > MAX_LOCAL_IMAGE_BYTES) {
      throw new Error("image_too_large_after_resize");
    }
    return toDataUrl(file);
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImageFromUrl(objectUrl);
    const longestSide = Math.max(image.width, image.height, 1);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / longestSide);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("image_context_unavailable");
    }

    context.drawImage(image, 0, 0, width, height);

    const outputMimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const qualitySteps = outputMimeType === "image/png" ? [undefined] : [0.9, 0.8, 0.72, 0.6, 0.5];

    for (const quality of qualitySteps) {
      const dataUrl = await canvasToDataUrl(canvas, outputMimeType, quality);
      const estimatedBytes = Math.ceil((dataUrl.length * 3) / 4);
      if (estimatedBytes <= TARGET_IMAGE_BYTES || quality === qualitySteps[qualitySteps.length - 1]) {
        if (estimatedBytes > MAX_LOCAL_IMAGE_BYTES) {
          throw new Error("image_too_large_after_resize");
        }
        return dataUrl;
      }
    }

    throw new Error("image_resize_failed");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function BoardFeedWritePage() {
  const router = useRouter();
  const { firebaseUser } = useAuthContext();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [imageInput, setImageInput] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [canChooseNoticeType, setCanChooseNoticeType] = useState(false);
  const [postType, setPostType] = useState<"normal" | "notice">("normal");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const bodyBytes = utf8ByteLength(body);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!firebaseUser) {
        if (!cancelled) {
          setCanChooseNoticeType(false);
          setPostType("normal");
        }
        return;
      }

      try {
        const me = await getAdminMe(firebaseUser);
        const canWriteNotice = ["support", "admin", "owner"].includes(me.actor.base_role);
        if (cancelled) {
          return;
        }
        setCanChooseNoticeType(canWriteNotice);
        if (!canWriteNotice) {
          setPostType("normal");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof AdminApiError && [401, 403, 404].includes(error.status)) {
          setCanChooseNoticeType(false);
          setPostType("normal");
          return;
        }
        setCanChooseNoticeType(false);
        setPostType("normal");
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  const handleAddImageUrl = () => {
    const next = imageInput.trim();
    if (!next) {
      return;
    }
    if (!isLikelyImageUrl(next)) {
      setErrorMessage("유효한 이미지 URL(https://) 또는 이미지 data URL을 입력해주세요.");
      return;
    }

    setImageUrls((previous) => {
      if (previous.includes(next)) {
        return previous;
      }
      if (previous.length >= MAX_IMAGE_COUNT) {
        setErrorMessage(`이미지는 최대 ${MAX_IMAGE_COUNT}개까지 첨부할 수 있습니다.`);
        return previous;
      }
      return [...previous, next];
    });
    setImageInput("");
  };

  const handlePickLocalImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }

    try {
      const remaining = Math.max(0, MAX_IMAGE_COUNT - imageUrls.length);
      if (remaining === 0) {
        setErrorMessage(`이미지는 최대 ${MAX_IMAGE_COUNT}개까지 첨부할 수 있습니다.`);
        return;
      }

      const limited = files.slice(0, remaining);
      for (const file of limited) {
        if (!file.type.startsWith("image/")) {
          setErrorMessage("이미지 파일만 업로드할 수 있습니다.");
          return;
        }
      }

      const localDataUrls = await Promise.all(limited.map((file) => resizeLocalImage(file)));
      setImageUrls((previous) => [...previous, ...localDataUrls].slice(0, MAX_IMAGE_COUNT));
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof Error && error.message === "image_too_large_after_resize") {
        setErrorMessage("이미지를 자동으로 줄인 뒤에도 5MB를 초과했습니다. 더 작은 이미지로 다시 시도해주세요.");
      } else {
        setErrorMessage("이미지 파일을 처리하는 중 오류가 발생했습니다.");
      }
    } finally {
      event.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!firebaseUser) {
      return;
    }

    if (!body.trim()) {
      setErrorMessage("본문을 입력해주세요.");
      return;
    }
    if (bodyBytes > MAX_POST_BODY_BYTES) {
      setErrorMessage(`본문은 UTF-8 기준 ${MAX_POST_BODY_BYTES.toLocaleString()}bytes 이내로 입력해주세요.`);
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);

      const created = await createBoardPost(firebaseUser, {
        title: title.trim() || null,
        body_text: body.trim(),
        is_anonymous: anonymous,
        is_notice: canChooseNoticeType && postType === "notice",
        tag_ids: parseCommaList(tagInput, 5),
        image_urls: imageUrls,
      });

      trackEvent(ANALYTICS_EVENTS.boardPostCreated, {
        post_type: postType,
        anonymous,
        image_count: imageUrls.length,
        has_title: Boolean(title.trim())
      });

      const query = new URLSearchParams({
        posted: "1",
        q: created.post.feed_public_id,
      });
      router.push(`/board-feed?${query.toString()}`);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">Board Feed</Badge>
          </div>
        }
      >
        <PageContainer size="md">
          <SectionContainer
            title="게시글 작성"
            description="제목(선택), 본문(필수), 태그/이미지(선택), 익명 설정 후 등록합니다."
            action={
              <Link href="/board-feed" className="ms-inline-link">
                피드로 돌아가기
              </Link>
            }
          >
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            <Card>
              {canChooseNoticeType ? (
                <Select
                  label="게시 유형"
                  value={postType}
                  onChange={(event) => setPostType(event.target.value as "normal" | "notice")}
                  options={[
                    { label: "일반 글", value: "normal" },
                    { label: "공지", value: "notice" },
                  ]}
                  helperText="관리자(support/admin/owner) 권한으로 공지 등록이 가능합니다."
                />
              ) : null}

              <Input
                label="제목(선택)"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={60}
                helperText={`${title.length}/60`}
              />

              <Textarea
                label="본문"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={1500}
                maxLengthHint={`${body.length}/1500자 · ${bodyBytes}/${MAX_POST_BODY_BYTES}bytes`}
                required
              />

              <Input
                label="태그(선택)"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                placeholder="예: 수면, 체크인"
                helperText="쉼표(,)로 구분해 최대 5개까지 입력"
              />

              <Card title="이미지 첨부(선택)" description="URL 또는 로컬 파일 업로드 중 원하는 방식으로 추가할 수 있습니다.">
                <div className="ms-stack">
                  <div className="ms-row">
                    <Input
                      label="이미지 URL"
                      value={imageInput}
                      onChange={(event) => setImageInput(event.target.value)}
                      placeholder="https://..."
                      helperText={`최대 ${MAX_IMAGE_COUNT}개`}
                    />
                    <Button type="button" variant="secondary" onClick={handleAddImageUrl}>
                      URL 추가
                    </Button>
                  </div>

                  <div className="ms-stack">
                    <label className="ms-field__label" htmlFor="board-image-local-upload">
                      <span>로컬 이미지 업로드</span>
                    </label>
                    <input
                      id="board-image-local-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => void handlePickLocalImages(event)}
                    />
                    <p className="ms-field__helper">
                      최대 {MAX_IMAGE_COUNT}개까지 첨부할 수 있으며, 로컬 이미지는 업로드 전에 자동으로 리사이즈/압축됩니다.
                    </p>
                  </div>

                  {imageUrls.length > 0 ? (
                    <div className="ms-board-image-upload-list">
                      {imageUrls.map((url, index) => (
                        <div key={`${url.slice(0, 40)}-${index}`} className="ms-board-image-upload-item">
                          <img src={url} alt={`첨부 이미지 ${index + 1}`} />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setImageUrls((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
                            }
                          >
                            제거
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Card>

              <div className="ms-row">
                <Button
                  variant={anonymous ? "secondary" : "ghost"}
                  onClick={() => setAnonymous((previous) => !previous)}
                >
                  익명 작성 {anonymous ? "ON" : "OFF"}
                </Button>
                <Button onClick={handleSubmit} loading={submitting}>
                  등록
                </Button>
              </div>
            </Card>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}

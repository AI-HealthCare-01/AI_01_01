"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

import { useAuthContext } from "../../features/auth";
import { AdminApiError, getAdminMe } from "../../features/admin-console/api-client";
import {
  ShadBadge,
  ShadButton,
  ShadCard,
  ShadIconButton,
  ShadInput,
  ShadSelect,
  ShadTextarea,
} from "../shadcn";

type SemanticVariant = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
type FeedbackVariant = "success" | "warning" | "danger" | "info";
type ButtonVariant = "primary" | "secondary" | "soft" | "tertiary" | "danger" | "ghost";
type ControlSize = "sm" | "md" | "lg";
type IconButtonVariant = "neutral" | "primary" | "danger";
type StatDeltaVariant = "up" | "down" | "neutral";
type AppNavItem = { href: string; label: string };

export function cx(...parts: Array<string | undefined | null | false>): string {
  return parts.filter(Boolean).join(" ");
}

function resolveVariant<T extends string>(
  variant: T | undefined,
  legacyVariant: T | undefined,
  fallback: T
): T {
  return variant ?? legacyVariant ?? fallback;
}

function mergeDescribedBy(ids: Array<string | undefined>): string | undefined {
  const resolved = ids.filter((value): value is string => Boolean(value));
  return resolved.length > 0 ? resolved.join(" ") : undefined;
}

function getHorizontalNextIndex(
  key: string,
  currentIndex: number,
  totalCount: number
): number | null {
  if (totalCount <= 0) {
    return null;
  }

  if (key === "ArrowRight" || key === "ArrowDown") {
    return (currentIndex + 1) % totalCount;
  }

  if (key === "ArrowLeft" || key === "ArrowUp") {
    return (currentIndex - 1 + totalCount) % totalCount;
  }

  if (key === "Home") {
    return 0;
  }

  if (key === "End") {
    return totalCount - 1;
  }

  return null;
}

interface AppShellProps {
  brand?: ReactNode;
  headerAction?: ReactNode;
  navItems?: AppNavItem[];
  children: ReactNode;
}

const ADMIN_NAV_CACHE_PREFIX = "ms_admin_nav_access:";

const PUBLIC_NAV_ITEMS: AppNavItem[] = [
  { href: "/", label: "랜딩" },
  { href: "/auth/login", label: "로그인" },
  { href: "/auth/signup", label: "회원가입" },
];

const AUTH_NAV_ITEMS: AppNavItem[] = [
  { href: "/cbt", label: "CBT" },
  { href: "/challenge", label: "챌린지" },
  { href: "/journal", label: "한줄일기" },
  { href: "/dashboard", label: "대시보드" },
  { href: "/board-feed", label: "커뮤니티" },
  { href: "/report/summary", label: "리포트" },
  { href: "/assessments", label: "심리검사" },
];

function getAdminAccessCache(uid: string): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(`${ADMIN_NAV_CACHE_PREFIX}${uid}`);
  if (raw === "1") {
    return true;
  }
  if (raw === "0") {
    return false;
  }
  return null;
}

function setAdminAccessCache(uid: string, allowed: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(`${ADMIN_NAV_CACHE_PREFIX}${uid}`, allowed ? "1" : "0");
}

function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) {
    return false;
  }
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ brand = "MindSight", headerAction, navItems, children }: AppShellProps) {
  const { phase, firebaseUser, session, logout } = useAuthContext();
  const pathname = usePathname();
  const [canSeeAdminEntry, setCanSeeAdminEntry] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (navItems) {
      return;
    }

    if (phase !== "signed_in" || !firebaseUser) {
      setCanSeeAdminEntry(false);
      return;
    }

    const cached = getAdminAccessCache(firebaseUser.uid);
    if (cached !== null) {
      setCanSeeAdminEntry(cached);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await getAdminMe(firebaseUser);
        if (cancelled) {
          return;
        }
        setCanSeeAdminEntry(true);
        setAdminAccessCache(firebaseUser.uid, true);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setCanSeeAdminEntry(false);

        if (error instanceof AdminApiError && [401, 403, 404].includes(error.status)) {
          setAdminAccessCache(firebaseUser.uid, false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, navItems, pathname, phase]);

  const defaultNavItems = useMemo(() => {
    if (phase !== "signed_in") {
      return PUBLIC_NAV_ITEMS;
    }
    return AUTH_NAV_ITEMS;
  }, [phase]);

  const nickname = session?.account.nickname || firebaseUser?.displayName || firebaseUser?.email || "사용자";

  const onLogout = async () => {
    if (typeof window !== "undefined") {
      const accepted = window.confirm("로그아웃 하시겠습니까?");
      if (!accepted) {
        return;
      }
    }

    try {
      await logout();
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch {
      if (typeof window !== "undefined") {
        window.alert("로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setUserMenuOpen(false);
    }
  };

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    const onDocumentPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current) {
        return;
      }
      if (userMenuRef.current.contains(event.target as Node)) {
        return;
      }
      setUserMenuOpen(false);
    };

    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, [userMenuOpen]);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  const resolvedNavItems = navItems ?? defaultNavItems;

  return (
    <div className="ms-app-shell">
      <div className="ms-app-shell__background" aria-hidden="true" />
      <header className={cx("ms-app-shell__header", phase === "signed_in" && "ms-app-shell__header--auth")}>
        <div className={cx("ms-app-shell__header-frame", phase === "signed_in" && "ms-app-shell__header-frame--auth")}>
          <div className="ms-app-shell__header-inner">
            <Link href="/" className="ms-app-shell__brand">
              {brand}
            </Link>
            <div className="ms-app-shell__header-tools">
              {headerAction}
              {phase === "signed_in" ? (
                <div className="ms-user-menu-wrap" ref={userMenuRef}>
                  <button
                    type="button"
                    className="ms-user-menu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                    onClick={() => setUserMenuOpen((previous) => !previous)}
                  >
                    <span className="ms-user-menu-trigger__dot" aria-hidden="true" />
                    <span className="ms-user-menu-trigger__name">{nickname}</span>
                  </button>
                  {userMenuOpen ? (
                    <div className="ms-user-menu" role="menu" aria-label="사용자 메뉴">
                      <Link href="/mypage" className="ms-user-menu__item" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                        마이페이지
                      </Link>
                      {canSeeAdminEntry ? (
                        <Link href="/admin" className="ms-user-menu__item" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                          관리자페이지
                        </Link>
                      ) : null}
                      <button type="button" className="ms-user-menu__item ms-user-menu__item--danger" role="menuitem" onClick={() => void onLogout()}>
                        로그아웃
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="ms-app-shell__nav-wrap">
            <nav className="ms-app-shell__nav" aria-label="서비스 메뉴">
              {resolvedNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "ms-app-shell__nav-link",
                    isNavActive(pathname, item.href) && "ms-app-shell__nav-link--active"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

        </div>
      </header>
      <main className="ms-app-shell__main">
        <div className="ms-app-shell__surface">{children}</div>
      </main>
    </div>
  );
}

interface PageContainerProps {
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function PageContainer({ size = "md", children }: PageContainerProps) {
  return <div className={cx("ms-page-container", `ms-page-container--${size}`)}>{children}</div>;
}

interface FeedContainerProps {
  children: ReactNode;
}

export function FeedContainer({ children }: FeedContainerProps) {
  return <div className="ms-page-container ms-page-container--md ms-feed-container">{children}</div>;
}

interface CenteredFormContainerProps {
  children: ReactNode;
}

export function CenteredFormContainer({ children }: CenteredFormContainerProps) {
  return <div className="ms-page-container ms-page-container--sm ms-centered-form">{children}</div>;
}

interface SectionContainerProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function SectionContainer({ title, description, action, children }: SectionContainerProps) {
  return (
    <section className="ms-section">
      {(title || description || action) && (
        <header className="ms-section__header">
          {title ? <h2 className="ms-section__title">{title}</h2> : null}
          {description ? <p className="ms-section__desc">{description}</p> : null}
          {action ? <div className="ms-section__action">{action}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <ShadButton
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      className={className}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? <span aria-hidden>◌</span> : leftIcon}
      <span>{children}</span>
      {rightIcon}
    </ShadButton>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: ReactNode;
  label: string;
  variant?: IconButtonVariant;
  tone?: IconButtonVariant;
  size?: ControlSize;
}

export function IconButton({
  icon,
  label,
  variant,
  tone,
  size = "md",
  className,
  ...props
}: IconButtonProps) {
  const resolvedVariant = resolveVariant(variant, tone, "neutral");

  return (
    <ShadIconButton
      aria-label={label}
      variant={resolvedVariant}
      size={size}
      className={className}
      {...props}
    >
      {icon}
    </ShadIconButton>
  );
}

interface BaseFieldProps {
  label: string;
  helperText?: string;
  errorText?: string;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    BaseFieldProps {}

export function Input({
  label,
  helperText,
  errorText,
  id,
  className,
  required,
  ...props
}: InputProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helperId = helperText ? `${fieldId}-helper` : undefined;
  const errorId = errorText ? `${fieldId}-error` : undefined;
  const describedBy = mergeDescribedBy([helperId, errorId]);

  return (
    <div className={cx("ms-field", errorText && "ms-field--error")}>
      <label htmlFor={fieldId} className="ms-field__label">
        {label}
        {required ? " *" : ""}
      </label>
      <ShadInput
        id={fieldId}
        className={className}
        aria-invalid={Boolean(errorText)}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
      {helperText ? (
        <p id={helperId} className="ms-field__meta">
          {helperText}
        </p>
      ) : null}
      {errorText ? (
        <p id={errorId} className="ms-field__meta ms-field__meta--error" role="alert" aria-live="polite">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

export interface PasswordInputProps extends Omit<InputProps, "type"> {}

export function PasswordInput({
  label,
  helperText,
  errorText,
  id,
  className,
  required,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helperId = helperText ? `${fieldId}-helper` : undefined;
  const errorId = errorText ? `${fieldId}-error` : undefined;
  const describedBy = mergeDescribedBy([helperId, errorId]);

  return (
    <div className={cx("ms-field", errorText && "ms-field--error")}>
      <label htmlFor={fieldId} className="ms-field__label">
        {label}
        {required ? " *" : ""}
      </label>
      <div className="ms-input-wrap">
        <ShadInput
          id={fieldId}
          type={visible ? "text" : "password"}
          className={className}
          aria-invalid={Boolean(errorText)}
          aria-describedby={describedBy}
          required={required}
          {...props}
        />
        <button
          type="button"
          className="ms-input-toggle"
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 표시"}
          onClick={() => setVisible((prev) => !prev)}
        >
          {visible ? "숨김" : "표시"}
        </button>
      </div>
      {helperText ? (
        <p id={helperId} className="ms-field__meta">
          {helperText}
        </p>
      ) : null}
      {errorText ? (
        <p id={errorId} className="ms-field__meta ms-field__meta--error" role="alert" aria-live="polite">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    BaseFieldProps {
  maxLengthHint?: string;
}

export function Textarea({
  label,
  helperText,
  errorText,
  maxLengthHint,
  id,
  className,
  required,
  ...props
}: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helperId = helperText ? `${fieldId}-helper` : undefined;
  const errorId = errorText ? `${fieldId}-error` : undefined;
  const maxLengthId = maxLengthHint ? `${fieldId}-length` : undefined;
  const describedBy = mergeDescribedBy([helperId, errorId, maxLengthId]);

  return (
    <div className={cx("ms-field", errorText && "ms-field--error")}>
      <label htmlFor={fieldId} className="ms-field__label">
        {label}
        {required ? " *" : ""}
      </label>
      <ShadTextarea
        id={fieldId}
        className={className}
        aria-invalid={Boolean(errorText)}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
      {helperText ? (
        <p id={helperId} className="ms-field__meta">
          {helperText}
        </p>
      ) : null}
      {maxLengthHint ? (
        <p id={maxLengthId} className="ms-field__meta">
          {maxLengthHint}
        </p>
      ) : null}
      {errorText ? (
        <p id={errorId} className="ms-field__meta ms-field__meta--error" role="alert" aria-live="polite">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement>,
    BaseFieldProps {
  options: SelectOption[];
}

export function Select({
  label,
  helperText,
  errorText,
  options,
  id,
  className,
  required,
  ...props
}: SelectProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const helperId = helperText ? `${fieldId}-helper` : undefined;
  const errorId = errorText ? `${fieldId}-error` : undefined;
  const describedBy = mergeDescribedBy([helperId, errorId]);

  return (
    <div className={cx("ms-field", errorText && "ms-field--error")}>
      <label htmlFor={fieldId} className="ms-field__label">
        {label}
        {required ? " *" : ""}
      </label>
      <ShadSelect
        id={fieldId}
        className={className}
        aria-invalid={Boolean(errorText)}
        aria-describedby={describedBy}
        required={required}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </ShadSelect>
      {helperText ? (
        <p id={helperId} className="ms-field__meta">
          {helperText}
        </p>
      ) : null}
      {errorText ? (
        <p id={errorId} className="ms-field__meta ms-field__meta--error" role="alert" aria-live="polite">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (nextValue: T) => void;
  fullWidth?: boolean;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fullWidth = false,
  ariaLabel = "Segmented control"
}: SegmentedControlProps<T>) {
  if (options.length === 0) {
    return null;
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = getHorizontalNextIndex(event.key, index, options.length);
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    onChange(options[nextIndex].value);
  };

  return (
    <div
      className={cx("ms-segmented", fullWidth && "ms-segmented--full")}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={cx("ms-segmented__option", selected && "ms-segmented__option--selected")}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabItem<T extends string> {
  label: string;
  value: T;
  content: ReactNode;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (nextValue: T) => void;
  ariaLabel?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel = "Tabs"
}: TabsProps<T>) {
  const tabsId = useId();
  const active = useMemo(() => {
    if (items.length === 0) {
      return null;
    }
    return items.find((item) => item.value === value) ?? items[0];
  }, [items, value]);
  if (!active) {
    return null;
  }
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.value === active.value)
  );
  const panelId = `${tabsId}-panel`;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = getHorizontalNextIndex(event.key, index, items.length);
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    onChange(items[nextIndex].value);
  };

  return (
    <div className="ms-tabs">
      <div className="ms-tabs__list" role="tablist" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const selected = item.value === active.value;
          const tabId = `${tabsId}-tab-${index}`;

          return (
            <button
              key={item.value}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={cx("ms-tabs__tab", selected && "ms-tabs__tab--active")}
              onClick={() => onChange(item.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={`${tabsId}-tab-${activeIndex}`}>
        {active.content}
      </div>
    </div>
  );
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function Card({ title, description, action, children, className, ...props }: CardProps) {
  return (
    <ShadCard as="article" className={className} {...props}>
      {(title || description || action) && (
        <header className="ms-card__header">
          <div>
            {title ? <h3 className="ms-card__title">{title}</h3> : null}
            {description ? <p className="ms-card__desc">{description}</p> : null}
          </div>
          {action}
        </header>
      )}
      {children}
    </ShadCard>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaVariant?: StatDeltaVariant;
  deltaTone?: StatDeltaVariant;
  helperText?: string;
  icon?: ReactNode;
}

export function StatCard({
  label,
  value,
  delta,
  deltaVariant,
  deltaTone,
  helperText,
  icon
}: StatCardProps) {
  const resolvedDeltaVariant = resolveVariant(deltaVariant, deltaTone, "neutral");

  return (
    <article className="ms-stat-card">
      <div className="ms-stat-card__row">
        <span className="ms-stat-card__label">{label}</span>
        {icon}
      </div>
      <p className="ms-stat-card__value">{value}</p>
      {delta ? (
        <span
          className={cx(
            "ms-stat-card__delta",
            resolvedDeltaVariant !== "neutral" && `ms-stat-card__delta--${resolvedDeltaVariant}`
          )}
        >
          {delta}
        </span>
      ) : null}
      {helperText ? <span className="ms-stat-card__label">{helperText}</span> : null}
    </article>
  );
}

interface PillProps {
  variant?: SemanticVariant;
  tone?: SemanticVariant;
  className?: string;
  children: ReactNode;
}

export function Badge({ variant, tone, className, children }: PillProps) {
  const resolvedVariant = resolveVariant(variant, tone, "neutral");
  return (
    <ShadBadge variant={resolvedVariant} className={className}>
      {children}
    </ShadBadge>
  );
}

export function Tag(props: PillProps) {
  return <Badge {...props} />;
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export function Chip({ selected = false, className, children, ...props }: ChipProps) {
  return (
    <button type="button" className={cx("ms-chip", selected && "ms-chip--selected", className)} {...props}>
      {children}
    </button>
  );
}

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, description, onClose, children, footer }: ModalProps) {
  const headingId = useId();
  const descriptionId = description ? `${headingId}-description` : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="ms-overlay" role="presentation" onClick={onClose}>
      <section
        className="ms-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ms-modal__header">
          <div>
            <h3 id={headingId} className="ms-card__title">
              {title}
            </h3>
            {description ? (
              <p id={descriptionId} className="ms-card__desc">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="모달 닫기" icon="✕" variant="neutral" size="sm" onClick={onClose} />
        </header>
        <div className="ms-modal__body">{children}</div>
        {footer ? <footer className="ms-modal__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

interface BottomSheetProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function BottomSheet({ open, title, description, onClose, children, footer }: BottomSheetProps) {
  const headingId = useId();
  const descriptionId = description ? `${headingId}-description` : undefined;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="ms-overlay ms-sheet-wrap" role="presentation" onClick={onClose}>
      <section
        className="ms-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ms-sheet__handle" aria-hidden />
        <header className="ms-sheet__header">
          <h3 id={headingId} className="ms-card__title">
            {title}
          </h3>
          {description ? (
            <p id={descriptionId} className="ms-card__desc">
              {description}
            </p>
          ) : null}
        </header>
        <div className="ms-sheet__body">{children}</div>
        {footer ? <footer className="ms-sheet__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

interface ToastProps {
  open: boolean;
  title?: string;
  message: string;
  variant?: FeedbackVariant;
  tone?: FeedbackVariant;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}

export function Toast({
  open,
  title,
  message,
  variant,
  tone,
  actionLabel,
  onAction,
  onClose
}: ToastProps) {
  const resolvedVariant = resolveVariant(variant, tone, "info");

  if (!open) {
    return null;
  }

  return (
    <div className="ms-toast-wrap" role="status" aria-live="polite">
      <div className={cx("ms-toast", `ms-toast--${resolvedVariant}`)}>
        <div>
          {title ? <p className="ms-toast__title">{title}</p> : null}
          <p className="ms-toast__message">{message}</p>
        </div>
        <div className="ms-row">
          {actionLabel && onAction ? (
            <Button size="sm" variant="ghost" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {onClose ? <IconButton label="토스트 닫기" icon="✕" size="sm" onClick={onClose} /> : null}
        </div>
      </div>
    </div>
  );
}

interface BannerProps {
  title: string;
  description: string;
  variant?: FeedbackVariant;
  tone?: FeedbackVariant;
}

export function Banner({ title, description, variant, tone }: BannerProps) {
  const resolvedVariant = resolveVariant(variant, tone, "info");

  return (
    <div className={cx("ms-banner", `ms-banner--${resolvedVariant}`)} role="alert">
      <span aria-hidden>●</span>
      <div>
        <p className="ms-banner__title">{title}</p>
        <p className="ms-banner__desc">{description}</p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="ms-state" role="status" aria-live="polite">
      <p className="ms-state__title">{title}</p>
      <p className="ms-state__desc">{description}</p>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  description: string;
  retryAction?: ReactNode;
}

export function ErrorState({ title, description, retryAction }: ErrorStateProps) {
  return (
    <div className="ms-state" role="alert">
      <p className="ms-state__title">{title}</p>
      <p className="ms-state__desc">{description}</p>
      {retryAction}
    </div>
  );
}

interface LoadingSkeletonProps {
  lines?: number;
}

export function LoadingSkeleton({ lines = 4 }: LoadingSkeletonProps) {
  return (
    <div className="ms-skeleton" role="status" aria-live="polite" aria-label="로딩 중">
      {Array.from({ length: lines }).map((_, index) => (
        <span key={index} className="ms-skeleton__line" />
      ))}
    </div>
  );
}

interface ChartLegendItem {
  label: string;
  color: string;
  value?: string;
}

interface ChartCardProps {
  title: string;
  subtitle?: string;
  summary?: string;
  legend?: ChartLegendItem[];
  children: ReactNode;
  footer?: ReactNode;
}

export function ChartCard({ title, subtitle, summary, legend, children, footer }: ChartCardProps) {
  return (
    <article className="ms-chart-card">
      <header className="ms-chart-card__header">
        <h3 className="ms-card__title">{title}</h3>
        {subtitle ? <p className="ms-card__desc">{subtitle}</p> : null}
        {summary ? <p className="ms-chart-card__summary">{summary}</p> : null}
        {legend && legend.length > 0 ? (
          <div className="ms-chart-card__legend">
            {legend.map((item) => (
              <span key={item.label} className="ms-chart-card__legend-item">
                <span className="ms-chart-card__legend-dot" style={{ background: item.color }} aria-hidden />
                <span>{item.label}</span>
                {item.value ? <strong>{item.value}</strong> : null}
              </span>
            ))}
          </div>
        ) : null}
      </header>
      {children}
      {footer}
    </article>
  );
}

interface ChartBarsProps {
  bars: number[];
  color: string;
  axisLabels: string[];
  ariaLabel?: string;
}

export function ChartBars({ bars, color, axisLabels, ariaLabel = "데이터 차트" }: ChartBarsProps) {
  return (
    <div className="ms-stack">
      <div className="ms-chart-area" role="img" aria-label={ariaLabel}>
        <div className="ms-chart-area__grid" aria-hidden />
        <div className="ms-chart-area__bars" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
          {bars.map((bar, index) => (
            <div
              key={`${bar}-${index}`}
              className="ms-chart-area__bar"
              style={{
                height: `${Math.max(8, Math.min(96, bar))}%`,
                background: color
              }}
              aria-hidden
            />
          ))}
        </div>
      </div>
      <div className="ms-chart-axis" aria-hidden>
        {axisLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

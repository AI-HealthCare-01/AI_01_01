"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "../../components/ui/index";

type MyPageTabItem = {
  href: string;
  label: string;
};

const MY_PAGE_TAB_ITEMS: MyPageTabItem[] = [
  { href: "/mypage/activity-log", label: "활동로그" },
  { href: "/mypage/profile", label: "회원정보수정" },
  { href: "/mypage/security", label: "비밀번호수정" },
  { href: "/mypage/withdrawal", label: "회원탈퇴" },
  { href: "/mypage/bookmarks", label: "북마크" },
  { href: "/mypage/my-posts", label: "내 글" },
  { href: "/mypage/my-comments", label: "내 댓글" },
  { href: "/mypage/support-tickets", label: "내 문의" },
  { href: "/mypage/report-vault", label: "리포트 보관함" },
  { href: "/mypage/consents", label: "동의 설정" },
];

function isTabActive(pathname: string | null, itemHref: string): boolean {
  if (!pathname) {
    return false;
  }
  if (pathname === "/mypage" && itemHref === "/mypage/activity-log") {
    return true;
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

export function MyPageTabShell({
  children,
  surfaceClassName,
  contentClassName,
}: {
  children: ReactNode;
  surfaceClassName?: string;
  contentClassName?: string;
}) {
  const pathname = usePathname();
  const activeTab = MY_PAGE_TAB_ITEMS.find((item) => isTabActive(pathname, item.href));
  const panelTitle = activeTab?.label ?? "마이페이지";

  return (
    <div className="ms-mypage-layout">
      <aside className="ms-mypage-tabs" aria-label="마이페이지 메뉴">
        {MY_PAGE_TAB_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            className={`ms-mypage-tabs__button${isTabActive(pathname, item.href) ? " ms-mypage-tabs__button--active" : ""}`}
            aria-current={isTabActive(pathname, item.href) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </aside>
      <section className={cx("ms-mypage-panel-surface", surfaceClassName)}>
        <h2 className="ms-mypage-panel-surface__title">{panelTitle}</h2>
        <div className={cx("ms-mypage-panel-surface__content", contentClassName)}>{children}</div>
      </section>
    </div>
  );
}

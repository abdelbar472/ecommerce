"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearSession, getEmail, getToken, getRole, healthApi, roleLabel, type Health, type Role } from "@/lib/api";

const baseLinks = [
  { href: "/notifications", label: "Notifications" },
];

const clientLinks = [
  { href: "/client/dashboard", label: "Dashboard" },
  { href: "/client/products", label: "Shop" },
  { href: "/client/orders", label: "My Orders" },
];

const merchantLinks = [
  { href: "/merchant/dashboard", label: "Dashboard" },
  { href: "/merchant/products", label: "My Products" },
  { href: "/merchant/orders", label: "My Orders" },
  { href: "/merchant/categories", label: "Categories" },
];

const adminLinks = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/admin/users", label: "Users & Categories" },
  { href: "/admin/audit", label: "Audit" },
];

type ServiceName = "auth" | "order" | "notification" | "analytics" | "client" | "merchant" | "admin";
type ServiceState = "ok" | "down" | "loading";
type Status = Record<ServiceName, ServiceState>;

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<{ email: string | null; role: Role | null; authed: boolean }>({
    email: null,
    role: null,
    authed: false,
  });
  const [status, setStatus] = useState<Status>({
    auth: "loading",
    order: "loading",
    notification: "loading",
    analytics: "loading",
    client: "loading",
    merchant: "loading",
    admin: "loading",
  });

  useEffect(() => {
    setSession({ email: getEmail(), role: getRole(), authed: !!getToken() });
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const services: ServiceName[] = ["auth", "order", "notification", "analytics", "client", "merchant", "admin"];
      const results: Status = { ...status };
      await Promise.all(
        services.map(async (s) => {
          try {
            const h: Health = await (healthApi as any)[s]();
            results[s] = h.status === "ok" ? "ok" : "down";
          } catch {
            results[s] = "down";
          }
        })
      );
      if (!cancelled) setStatus(results);
    };
    check();
    const id = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    clearSession();
    setSession({ email: null, role: null, authed: false });
    router.push("/login");
  };

  const authed = session.authed && pathname !== "/login";
  const role = session.role;
  const roleLinks =
    role === "client"
      ? clientLinks
      : role === "merchant"
        ? merchantLinks
        : role === "admin"
          ? adminLinks
          : [];
  const navLinks = [...roleLinks, ...baseLinks];

  return (
    <nav className="nav">
      <div className="nav-inner">
        <span className="brand">Kafka Demo Console</span>
        {authed && (
          <div className="nav-links">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={pathname === l.href ? "active" : ""}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
        <div className="nav-right">
          <span title="auth · order · notification · analytics · client · merchant · admin">
            <span className={`status-dot ${status.auth}`} />a
            <span className={`status-dot ${status.order}`} style={{ marginLeft: 8 }} />o
            <span
              className={`status-dot ${status.notification}`}
              style={{ marginLeft: 8 }}
            />
            n
            <span
              className={`status-dot ${status.analytics}`}
              style={{ marginLeft: 8 }}
            />
            an
            <span className={`status-dot ${status.client}`} style={{ marginLeft: 8 }} />c
            <span className={`status-dot ${status.merchant}`} style={{ marginLeft: 8 }} />m
            <span className={`status-dot ${status.admin}`} style={{ marginLeft: 8 }} />ad
          </span>
          {session.email && <span className="muted">{session.email}</span>}
          {role && <span className="pill">{roleLabel(role)}</span>}
          {authed && (
            <button className="ghost small" onClick={logout}>
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken, getRole, dashboardPath } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    router.replace(dashboardPath(getRole()));
  }, [router]);

  return (
    <div className="center">
      <p className="muted">Loading…</p>
    </div>
  );
}

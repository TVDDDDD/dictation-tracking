"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import BrandLogo from "@/app/components/BrandLogo";

export default function VerifyLoadingPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = next;
    }, 1200);
    return () => clearTimeout(timer);
  }, [next]);

  return (
    <main className="auth-shell">
      <aside className="auth-aside">
        <BrandLogo href="/" />
        <div className="auth-aside-copy">
          <span className="eyebrow">Xác thực email</span>
          <h1>Đang xác thực...</h1>
          <p>Vui lòng chờ giây lát, bạn sẽ được chuyển hướng tự động.</p>
        </div>
        <p className="auth-aside-foot">DICTATION STUDIO &middot; LEARNING SPACE</p>
      </aside>

      <section className="auth-main">
        <div className="auth-form-wrap">
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent" />
            <div className="text-center">
              <p className="text-lg font-medium text-gray-900">Đang xác thực email</p>
              <p className="text-sm text-gray-500 mt-1">Vui lòng không đóng tab này</p>
            </div>
            <p className="text-xs text-gray-400">
              Nếu không chuyển hướng tự động,
              <Link href={next} className="text-blue-600 hover:underline ml-1">
                bấm vào đây
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
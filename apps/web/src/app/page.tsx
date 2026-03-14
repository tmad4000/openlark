"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check if user has a session token
    const hasToken = document.cookie.includes("session_token=");
    router.push(hasToken ? "/app" : "/login");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400">Redirecting...</p>
    </main>
  );
}

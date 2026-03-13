"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to profile page which contains all user settings
    router.replace("/app/profile");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-500">Redirecting to profile settings...</div>
    </div>
  );
}

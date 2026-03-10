"use client";

import { useAuth } from "@/hooks/use-auth";

export default function MessengerPage() {
  const { user, organization } = useAuth();

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Welcome to {organization?.name}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Signed in as {user?.displayName} ({user?.email})
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
          Select a conversation from the sidebar to get started
        </p>
      </div>
    </div>
  );
}

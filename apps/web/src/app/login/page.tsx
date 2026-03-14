"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


const DEMO_ACCOUNTS = [
  { email: "jacob@openlark.dev", name: "Jacob", role: "Admin" },
  { email: "alice@openlark.dev", name: "Alice", role: "Engineer" },
  { email: "bob@openlark.dev", name: "Bob", role: "Designer" },
  { email: "carol@openlark.dev", name: "Carol", role: "PM" },
  { email: "david@openlark.dev", name: "David", role: "Sales" },
  { email: "emma@openlark.dev", name: "Emma", role: "Support" },
];
const DEMO_PASSWORD = "demo1234";

interface ValidationErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (!email) {
      newErrors.email = "Email is required";
    } else if (!EMAIL_REGEX.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setApiError(data.error || "Login failed. Please try again.");
        return;
      }

      // Store session token in cookie
      document.cookie = `session_token=${data.token}; path=/; max-age=${30 * 24 * 60 * 60}; samesite=strict`;

      router.push("/app");
    } catch {
      setApiError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">OpenLark</h1>
          <p className="mt-2 text-gray-600">Sign in to your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-sm rounded-lg border border-gray-200 px-8 py-10 space-y-6"
        >
          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {apiError}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.email ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.password ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center text-sm text-gray-600">
            Don&apos;t have an account?{" "}
            <a
              href="/register"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Create one
            </a>
          </p>
        </form>
      </div>
    
      {/* Quick Login - Demo Accounts */}
      <div className="fixed bottom-4 left-4 group">
        <button className="text-xs text-gray-400 hover:text-gray-600 transition-colors opacity-60 hover:opacity-100">
          Demo accounts
        </button>
        <div className="hidden group-hover:block absolute bottom-6 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[200px] z-50">
          <p className="text-[10px] text-gray-400 px-2 py-1 uppercase tracking-wider">Quick Login</p>
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              onClick={() => {
                setEmail(account.email);
                setPassword(DEMO_PASSWORD);
                // Auto-submit after a tick
                setTimeout(() => {
                  const form = document.querySelector("form");
                  if (form) form.requestSubmit();
                }, 50);
              }}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 rounded flex items-center gap-2 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">
                {account.name[0]}
              </span>
              <div>
                <div className="text-gray-700 text-xs font-medium">{account.name}</div>
                <div className="text-gray-400 text-[10px]">{account.role}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

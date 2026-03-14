"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";


const DEMO_ACCOUNTS = [
  { email: "jacob@openlark.dev", name: "Jacob", role: "Admin" },
  { email: "alice@openlark.dev", name: "Alice", role: "Engineer" },
  { email: "bob@openlark.dev", name: "Bob", role: "Designer" },
  { email: "carol@openlark.dev", name: "Carol", role: "PM" },
  { email: "david@openlark.dev", name: "David", role: "Sales" },
  { email: "emma@openlark.dev", name: "Emma", role: "Support" },
];
const DEMO_PASSWORD = "demo1234";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      router.push("/messenger");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center">Sign in to OpenLark</CardTitle>
          <CardDescription className="text-center">
            Enter your email and password to continue
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div
                className="p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md"
                role="alert"
              >
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Create one
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    
      {/* Quick Login - Demo Accounts */}
      <div className="fixed bottom-4 left-4 group">
        <button className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors opacity-60 hover:opacity-100">
          Demo accounts
        </button>
        <div className="hidden group-hover:block absolute bottom-6 left-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 min-w-[200px] z-50">
          <p className="text-[10px] text-gray-400 px-2 py-1 uppercase tracking-wider">Quick Login</p>
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(DEMO_PASSWORD);
                setTimeout(() => {
                  const form = document.querySelector("form");
                  if (form) form.requestSubmit();
                }, 50);
              }}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded flex items-center gap-2 transition-colors"
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center text-xs font-medium">
                {account.name[0]}
              </span>
              <div>
                <div className="text-gray-700 dark:text-gray-200 text-xs font-medium">{account.name}</div>
                <div className="text-gray-400 text-[10px]">{account.role}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

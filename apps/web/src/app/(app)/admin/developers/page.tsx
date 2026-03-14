"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { api, type PlatformApp } from "@/lib/api";
import {
  Shield,
  Plus,
  Loader2,
  Trash2,
  Copy,
  RefreshCw,
  Code2,
  Eye,
  EyeOff,
  ShieldAlert,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function DeveloperConsolePage() {
  const { user } = useAuth();
  const [apps, setApps] = useState<PlatformApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdApp, setCreatedApp] = useState<PlatformApp | null>(null);
  const [form, setForm] = useState({ name: "", description: "", redirectUri: "", webhookUrl: "" });
  const [creating, setCreating] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const loadApps = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getPlatformApps();
      setApps(result.apps);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  if (!user || user.role === "member") {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col items-center justify-center">
          <ShieldAlert className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Admin access required</p>
        </div>
      </AppShell>
    );
  }

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const result = await api.createPlatformApp({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        redirectUris: form.redirectUri.trim()
          ? form.redirectUri.split(/[,\n]/).map((u) => u.trim()).filter(Boolean)
          : [],
        webhookUrl: form.webhookUrl.trim() || undefined,
      });
      setCreatedApp(result.app);
      setCreateOpen(false);
      setForm({ name: "", description: "", redirectUri: "", webhookUrl: "" });
      loadApps();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deletePlatformApp(id);
      loadApps();
    } catch {
      // ignore
    }
  };

  const handleRegenerate = async (id: string) => {
    try {
      const result = await api.regenerateAppSecret(id);
      setCreatedApp({ appSecret: result.appSecret, appId: apps.find((a) => a.id === id)?.appId || "" } as PlatformApp);
    } catch {
      // ignore
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const inputClass =
    "w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <AppShell>
      <div className="flex-1 flex flex-col overflow-auto">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/admin"
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </Link>
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-blue-600" />
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Developer Console
              </h1>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 ml-8">
            Register apps and manage OAuth credentials for OpenLark APIs.
          </p>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Registered Apps ({apps.length})
            </h2>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Create App
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl">
              <Code2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No apps registered yet</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Create your first app
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="border border-gray-200 dark:border-gray-800 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {app.name}
                      </h3>
                      {app.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {app.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRegenerate(app.id)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                        title="Regenerate secret"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(app.id)}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600"
                        title="Delete app"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">
                        App ID
                      </label>
                      <div className="flex items-center gap-1 mt-0.5">
                        <code className="text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono">
                          {app.appId}
                        </code>
                        <button
                          onClick={() => copyToClipboard(app.appId)}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <Copy className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">
                        Redirect URIs
                      </label>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        {(app.redirectUris as string[]).length > 0
                          ? (app.redirectUris as string[]).join(", ")
                          : "None"}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">
                        Bot Enabled
                      </label>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        {app.botEnabled ? "Yes" : "No"}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase">
                        Created
                      </label>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        {new Date(app.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create App Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New App</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                App Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
                placeholder="My Integration"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Description
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={inputClass}
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Redirect URIs (comma-separated)
              </label>
              <input
                type="text"
                value={form.redirectUri}
                onChange={(e) => setForm((f) => ({ ...f, redirectUri: e.target.value }))}
                className={inputClass}
                placeholder="https://myapp.com/callback"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Webhook URL
              </label>
              <input
                type="text"
                value={form.webhookUrl}
                onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                className={inputClass}
                placeholder="https://myapp.com/webhook"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !form.name.trim()}>
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Create App
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Created App Credentials Dialog */}
      <Dialog open={!!createdApp} onOpenChange={(open) => !open && setCreatedApp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>App Credentials</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-xs text-yellow-800 dark:text-yellow-300 font-medium">
                Save the App Secret now. It will not be shown again.
              </p>
            </div>

            {createdApp?.appId && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  App ID
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded text-gray-900 dark:text-gray-100">
                    {createdApp.appId}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(createdApp.appId)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {createdApp?.appSecret && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  App Secret
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded text-gray-900 dark:text-gray-100 break-all">
                    {createdApp.appSecret}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(createdApp.appSecret!)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedApp(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

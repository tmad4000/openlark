"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  ArrowLeft,
  Code2,
  Webhook,
  Key,
  Shield,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────

interface AppData {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  appId: string;
  redirectUris: string[];
  scopes: string[];
  botEnabled: boolean;
  webhookUrl: string | null;
  createdAt: string;
}

interface SubscriptionData {
  id: string;
  appId: string;
  eventType: string;
  callbackUrl: string;
  status: string;
  createdAt: string;
}

interface DeliveryData {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

const EVENT_TYPES = [
  "message.created",
  "message.updated",
  "message.deleted",
  "chat.created",
  "chat.updated",
  "user.joined",
  "user.left",
  "document.created",
  "document.updated",
  "task.created",
  "task.completed",
  "approval.submitted",
  "approval.decided",
];

const AVAILABLE_SCOPES = [
  "messages:read",
  "messages:write",
  "chats:read",
  "chats:write",
  "users:read",
  "documents:read",
  "documents:write",
  "tasks:read",
  "tasks:write",
  "calendar:read",
  "calendar:write",
];

// ── Main Component ──────────────────────────────────────────────────

export default function DeveloperConsolePage() {
  const [apps, setApps] = useState<AppData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create app state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    redirect_uris: "",
    scopes: [] as string[],
    bot_enabled: false,
    webhook_url: "",
  });
  const [creating, setCreating] = useState(false);

  // App secret display (shown only once after create/regenerate)
  const [revealedSecret, setRevealedSecret] = useState<{
    appId: string;
    secret: string;
  } | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Detail view
  const [selectedApp, setSelectedApp] = useState<AppData | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [showAddSub, setShowAddSub] = useState(false);
  const [subForm, setSubForm] = useState({
    event_type: EVENT_TYPES[0],
    callback_url: "",
  });
  const [deliveries, setDeliveries] = useState<DeliveryData[]>([]);
  const [showDeliveries, setShowDeliveries] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    redirect_uris: "",
    scopes: [] as string[],
    bot_enabled: false,
    webhook_url: "",
  });

  const apiFetch = useCallback(
    async (url: string, options?: RequestInit) => {
      const t = getCookie("session_token");
      if (!t) return null;
      return fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
          ...(options?.headers || {}),
        },
      });
    },
    []
  );

  // ── Fetch apps ──────────────────────────────────────────────────────

  const loadApps = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/apps");
      if (res && res.ok) {
        const data = await res.json();
        setApps(data.apps || []);
      } else {
        setError("Failed to load apps");
      }
    } catch {
      setError("Failed to load apps");
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // ── Load app detail ─────────────────────────────────────────────────

  const loadAppDetail = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/api/apps/${id}`);
      if (res && res.ok) {
        const data = await res.json();
        setSelectedApp(data.app);
        setSubscriptions(data.eventSubscriptions || []);
      }
    },
    [apiFetch]
  );

  const loadDeliveries = useCallback(
    async (id: string) => {
      const res = await apiFetch(`/api/apps/${id}/deliveries?limit=50`);
      if (res && res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries || []);
      }
    },
    [apiFetch]
  );

  // ── Create app ──────────────────────────────────────────────────────

  async function handleCreate() {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/apps", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim() || undefined,
          redirect_uris: createForm.redirect_uris
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean),
          scopes: createForm.scopes,
          bot_enabled: createForm.bot_enabled,
          webhook_url: createForm.webhook_url.trim() || undefined,
        }),
      });
      if (res && res.ok) {
        const data = await res.json();
        setRevealedSecret({
          appId: data.app.appId,
          secret: data.app_secret,
        });
        setShowSecret(true);
        setShowCreate(false);
        setCreateForm({
          name: "",
          description: "",
          redirect_uris: "",
          scopes: [],
          bot_enabled: false,
          webhook_url: "",
        });
        loadApps();
      }
    } finally {
      setCreating(false);
    }
  }

  // ── Delete app ──────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm("Delete this app? This action cannot be undone.")) return;
    await apiFetch(`/api/apps/${id}`, { method: "DELETE" });
    setSelectedApp(null);
    loadApps();
  }

  // ── Regenerate secret ───────────────────────────────────────────────

  async function handleRegenerateSecret(id: string) {
    if (
      !confirm(
        "Regenerate app secret? The old secret will stop working immediately."
      )
    )
      return;
    const res = await apiFetch(`/api/apps/${id}/regenerate-secret`, {
      method: "POST",
    });
    if (res && res.ok) {
      const data = await res.json();
      setRevealedSecret({
        appId: data.app_id,
        secret: data.app_secret,
      });
      setShowSecret(true);
    }
  }

  // ── Update app ──────────────────────────────────────────────────────

  async function handleUpdate() {
    if (!selectedApp) return;
    const res = await apiFetch(`/api/apps/${selectedApp.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        redirect_uris: editForm.redirect_uris
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean),
        scopes: editForm.scopes,
        bot_enabled: editForm.bot_enabled,
        webhook_url: editForm.webhook_url.trim() || null,
      }),
    });
    if (res && res.ok) {
      setEditing(false);
      loadAppDetail(selectedApp.id);
      loadApps();
    }
  }

  // ── Add subscription ───────────────────────────────────────────────

  async function handleAddSubscription() {
    if (!selectedApp || !subForm.callback_url.trim()) return;
    const res = await apiFetch(`/api/apps/${selectedApp.id}/subscriptions`, {
      method: "POST",
      body: JSON.stringify({
        event_type: subForm.event_type,
        callback_url: subForm.callback_url.trim(),
      }),
    });
    if (res && res.ok) {
      setShowAddSub(false);
      setSubForm({ event_type: EVENT_TYPES[0], callback_url: "" });
      loadAppDetail(selectedApp.id);
    }
  }

  // ── Delete subscription ─────────────────────────────────────────────

  async function handleDeleteSubscription(subId: string) {
    if (!selectedApp) return;
    await apiFetch(`/api/apps/${selectedApp.id}/subscriptions/${subId}`, {
      method: "DELETE",
    });
    loadAppDetail(selectedApp.id);
  }

  // ── Copy to clipboard ──────────────────────────────────────────────

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  // ── Render ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  // ── Secret reveal modal ─────────────────────────────────────────────

  const secretModal = revealedSecret && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Key className="w-5 h-5 text-amber-500" />
          App Credentials
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Save the app secret now — it will not be shown again.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">
              App ID
            </label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
                {revealedSecret.appId}
              </code>
              <button
                onClick={() => copyToClipboard(revealedSecret.appId)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase">
              App Secret
            </label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-amber-50 border border-amber-200 px-3 py-2 rounded text-sm font-mono break-all">
                {showSecret ? revealedSecret.secret : "•".repeat(40)}
              </code>
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => copyToClipboard(revealedSecret.secret)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setRevealedSecret(null);
            setShowSecret(false);
          }}
          className="mt-6 w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          I&apos;ve saved the secret
        </button>
      </div>
    </div>
  );

  // ── Detail view ─────────────────────────────────────────────────────

  if (selectedApp) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {secretModal}

        <button
          onClick={() => {
            setSelectedApp(null);
            setEditing(false);
          }}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to apps
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{selectedApp.name}</h1>
            {selectedApp.description && (
              <p className="text-gray-500 mt-1">{selectedApp.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing(true);
                setEditForm({
                  name: selectedApp.name,
                  description: selectedApp.description || "",
                  redirect_uris: selectedApp.redirectUris.join("\n"),
                  scopes: selectedApp.scopes,
                  bot_enabled: selectedApp.botEnabled,
                  webhook_url: selectedApp.webhookUrl || "",
                });
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(selectedApp.id)}
              className="p-1.5 text-red-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="bg-gray-50 border rounded-lg p-4 mb-6 space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <input
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Redirect URIs (one per line)
              </label>
              <textarea
                value={editForm.redirect_uris}
                onChange={(e) =>
                  setEditForm({ ...editForm, redirect_uris: e.target.value })
                }
                rows={3}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Scopes</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {AVAILABLE_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.scopes.includes(scope)}
                      onChange={(e) => {
                        const newScopes = e.target.checked
                          ? [...editForm.scopes, scope]
                          : editForm.scopes.filter((s) => s !== scope);
                        setEditForm({ ...editForm, scopes: newScopes });
                      }}
                    />
                    {scope}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editForm.bot_enabled}
                onChange={(e) =>
                  setEditForm({ ...editForm, bot_enabled: e.target.checked })
                }
              />
              <label className="text-sm font-medium">Enable bot</label>
            </div>
            <div>
              <label className="text-sm font-medium">Webhook URL</label>
              <input
                value={editForm.webhook_url}
                onChange={(e) =>
                  setEditForm({ ...editForm, webhook_url: e.target.value })
                }
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Credentials */}
        <div className="bg-white border rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <Key className="w-4 h-4" />
            Credentials
          </h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 w-20">App ID</span>
              <code className="flex-1 bg-gray-100 px-3 py-1.5 rounded text-sm font-mono">
                {selectedApp.appId}
              </code>
              <button
                onClick={() => copyToClipboard(selectedApp.appId)}
                className="p-1.5 text-gray-400 hover:text-gray-600"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 w-20">Secret</span>
              <span className="flex-1 text-sm text-gray-400 italic">
                Hidden — regenerate to get a new one
              </span>
              <button
                onClick={() => handleRegenerateSecret(selectedApp.id)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50 rounded-lg"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate
              </button>
            </div>
          </div>
        </div>

        {/* OAuth endpoints */}
        <div className="bg-white border rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4" />
            OAuth 2.0 Endpoints
          </h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500">Authorize:</span>{" "}
              <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">
                GET /auth/oauth/authorize?client_id=...&redirect_uri=...&response_type=code
              </code>
            </div>
            <div>
              <span className="text-gray-500">Token:</span>{" "}
              <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">
                POST /auth/oauth/token
              </code>
            </div>
          </div>
        </div>

        {/* Scopes */}
        {selectedApp.scopes.length > 0 && (
          <div className="bg-white border rounded-lg p-4 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Scopes
            </h2>
            <div className="flex flex-wrap gap-1">
              {selectedApp.scopes.map((s) => (
                <span
                  key={s}
                  className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-mono"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Event Subscriptions */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Webhook className="w-4 h-4" />
              Event Subscriptions
            </h2>
            <button
              onClick={() => setShowAddSub(true)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {showAddSub && (
            <div className="bg-gray-50 border rounded-lg p-3 mb-3 space-y-2">
              <div>
                <label className="text-sm font-medium">Event Type</label>
                <select
                  value={subForm.event_type}
                  onChange={(e) =>
                    setSubForm({ ...subForm, event_type: e.target.value })
                  }
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {EVENT_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Callback URL</label>
                <input
                  value={subForm.callback_url}
                  onChange={(e) =>
                    setSubForm({ ...subForm, callback_url: e.target.value })
                  }
                  placeholder="https://your-app.com/webhook"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddSubscription}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Subscribe
                </button>
                <button
                  onClick={() => setShowAddSub(false)}
                  className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {subscriptions.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No event subscriptions yet
            </p>
          ) : (
            <div className="divide-y">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {sub.eventType}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      → {sub.callbackUrl}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        sub.status === "active"
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {sub.status}
                    </span>
                    <button
                      onClick={() => handleDeleteSubscription(sub.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Webhook Delivery Logs */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Webhook Delivery Logs
            </h2>
            <button
              onClick={() => {
                if (!showDeliveries && selectedApp) {
                  loadDeliveries(selectedApp.id);
                }
                setShowDeliveries(!showDeliveries);
              }}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              {showDeliveries ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Hide
                </>
              ) : (
                <>
                  <ChevronRight className="w-3.5 h-3.5" />
                  Show
                </>
              )}
            </button>
          </div>

          {showDeliveries && (
            <>
              {deliveries.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  No webhook deliveries yet
                </p>
              ) : (
                <div className="divide-y max-h-96 overflow-y-auto">
                  {deliveries.map((d) => (
                    <div key={d.id} className="py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {d.eventType}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {d.attempts} attempt{d.attempts !== 1 ? "s" : ""}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              d.status === "delivered"
                                ? "bg-green-50 text-green-700"
                                : d.status === "failed"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-yellow-50 text-yellow-700"
                            }`}
                          >
                            {d.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(d.createdAt).toLocaleString()}
                        {d.lastAttemptAt && (
                          <span className="ml-2">
                            Last attempt:{" "}
                            {new Date(d.lastAttemptAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() =>
                  selectedApp && loadDeliveries(selectedApp.id)
                }
                className="mt-2 text-xs text-blue-600 hover:text-blue-700"
              >
                Refresh
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── App list view ───────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {secretModal}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Code2 className="w-6 h-6 text-blue-600" />
            Developer Console
          </h1>
          <p className="text-gray-500 mt-1">
            Register and manage apps for the OpenLark platform
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          New App
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-gray-50 border rounded-lg p-4 mb-6 space-y-3">
          <h3 className="font-medium">Create New App</h3>
          <div>
            <label className="text-sm font-medium">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({ ...createForm, name: e.target.value })
              }
              placeholder="My Integration"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <input
              value={createForm.description}
              onChange={(e) =>
                setCreateForm({ ...createForm, description: e.target.value })
              }
              placeholder="What does this app do?"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">
              Redirect URIs (one per line)
            </label>
            <textarea
              value={createForm.redirect_uris}
              onChange={(e) =>
                setCreateForm({ ...createForm, redirect_uris: e.target.value })
              }
              rows={2}
              placeholder="https://your-app.com/callback"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Scopes</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {AVAILABLE_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={createForm.scopes.includes(scope)}
                    onChange={(e) => {
                      const newScopes = e.target.checked
                        ? [...createForm.scopes, scope]
                        : createForm.scopes.filter((s) => s !== scope);
                      setCreateForm({ ...createForm, scopes: newScopes });
                    }}
                  />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={createForm.bot_enabled}
              onChange={(e) =>
                setCreateForm({ ...createForm, bot_enabled: e.target.checked })
              }
            />
            <label className="text-sm font-medium">Enable bot</label>
          </div>
          <div>
            <label className="text-sm font-medium">Webhook URL</label>
            <input
              value={createForm.webhook_url}
              onChange={(e) =>
                setCreateForm({ ...createForm, webhook_url: e.target.value })
              }
              placeholder="https://your-app.com/webhook"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !createForm.name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create App"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* App list */}
      {apps.length === 0 && !showCreate ? (
        <div className="text-center py-16">
          <Code2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-600">No apps yet</h2>
          <p className="text-gray-400 mt-1">
            Create your first app to start integrating with OpenLark
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => {
                setSelectedApp(app);
                loadAppDetail(app.id);
              }}
              className="w-full flex items-center justify-between bg-white border rounded-lg px-4 py-3 hover:bg-gray-50 text-left"
            >
              <div>
                <h3 className="font-medium">{app.name}</h3>
                <p className="text-sm text-gray-400 font-mono mt-0.5">
                  {app.appId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {app.botEnabled && (
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded">
                    Bot
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(app.createdAt).toLocaleDateString()}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

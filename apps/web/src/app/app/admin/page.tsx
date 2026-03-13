"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Users,
  Network,
  Shield,
  Lock,
  Key,
  Plus,
  Search,
  Trash2,
  UserMinus,
  ChevronRight,
  ChevronDown,
  Edit2,
  Check,
  X,
  Mail,
  FileText,
  Download,
  Filter,
  Calendar,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────

interface OrgData {
  id: string;
  name: string;
  domain: string | null;
  logoUrl: string | null;
  industry: string | null;
  plan: string;
}

interface MemberData {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: "owner" | "admin" | "member";
  status: string;
  createdAt: string;
}

interface DeptMember {
  departmentId: string;
  userId: string;
  role: string;
  displayName: string;
  email: string;
}

interface DeptData {
  id: string;
  name: string;
  parentId: string | null;
  orgId: string;
  members: DeptMember[];
}

interface RoleData {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, string[]>;
  createdAt: string;
}

interface SecuritySettings {
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSpecial: boolean;
  passwordExpiryDays: number;
  require2FA: boolean;
  allowExternalComm: boolean;
  sessionTimeoutMinutes: number;
}

const DEFAULT_SECURITY: SecuritySettings = {
  passwordMinLength: 8,
  passwordRequireUppercase: false,
  passwordRequireNumber: false,
  passwordRequireSpecial: false,
  passwordExpiryDays: 0,
  require2FA: false,
  allowExternalComm: true,
  sessionTimeoutMinutes: 0,
};

const MODULES = [
  "messenger",
  "calendar",
  "docs",
  "tasks",
  "base",
  "wiki",
  "approvals",
  "okr",
  "attendance",
  "leave",
  "email",
  "forms",
  "admin",
];

const PERMISSION_ACTIONS = ["read", "write", "admin"];

// ── Helpers ─────────────────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function roleBadgeColor(role: string) {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-700";
    case "admin":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

// ── Tabs ─────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  diff: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface SsoConfigData {
  id: string;
  orgId: string;
  provider: string;
  metadataUrl: string | null;
  entityId: string;
  ssoUrl: string;
  certificate: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type TabId = "org" | "members" | "departments" | "roles" | "security" | "sso" | "audit";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "org", label: "Organization", icon: Building2 },
  { id: "members", label: "Members", icon: Users },
  { id: "departments", label: "Departments", icon: Network },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "security", label: "Security", icon: Lock },
  { id: "sso", label: "SSO", icon: Key },
  { id: "audit", label: "Audit Logs", icon: FileText },
];

// ── Main Component ──────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>("org");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Org state
  const [org, setOrg] = useState<OrgData | null>(null);
  const [orgForm, setOrgForm] = useState({ name: "", domain: "", industry: "", logo_url: "" });
  const [orgSaving, setOrgSaving] = useState(false);

  // Members state
  const [members, setMembers] = useState<MemberData[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  // Department state
  const [depts, setDepts] = useState<DeptData[]>([]);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptParent, setNewDeptParent] = useState<string | null>(null);
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [addMemberDept, setAddMemberDept] = useState<string | null>(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");

  // Roles state
  const [customRoles, setCustomRoles] = useState<RoleData[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<Record<string, string[]>>({});
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editRolePerms, setEditRolePerms] = useState<Record<string, string[]>>({});

  // Security state
  const [security, setSecurity] = useState<SecuritySettings>({ ...DEFAULT_SECURITY });
  const [securitySaving, setSecuritySaving] = useState(false);

  // SSO state
  const [ssoConfigs, setSsoConfigs] = useState<SsoConfigData[]>([]);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoSaving, setSsoSaving] = useState(false);
  const [ssoEditing, setSsoEditing] = useState<string | null>(null); // config id or "new"
  const [ssoForm, setSsoForm] = useState({
    metadata_url: "",
    entity_id: "",
    sso_url: "",
    certificate: "",
    enabled: false,
  });

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditNextCursor, setAuditNextCursor] = useState<string | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilterActor, setAuditFilterActor] = useState("");
  const [auditFilterAction, setAuditFilterAction] = useState("");
  const [auditFilterEntity, setAuditFilterEntity] = useState("");
  const [auditFilterFrom, setAuditFilterFrom] = useState("");
  const [auditFilterTo, setAuditFilterTo] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [auditEntityTypes, setAuditEntityTypes] = useState<string[]>([]);
  const [auditExpandedId, setAuditExpandedId] = useState<string | null>(null);
  const [auditExporting, setAuditExporting] = useState(false);

  const token = getCookie("session_token");

  const apiFetch = useCallback(
    async (url: string, options?: RequestInit) => {
      const t = getCookie("session_token");
      if (!t) return null;
      const res = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${t}`,
          "Content-Type": "application/json",
          ...(options?.headers || {}),
        },
      });
      return res;
    },
    []
  );

  // ── Check access ──────────────────────────────────────────────────

  useEffect(() => {
    async function checkAccess() {
      const t = getCookie("session_token");
      if (!t) return;

      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.user?.role || "member");
          if (data.user?.role !== "owner" && data.user?.role !== "admin") {
            setError("You don't have admin access to this page.");
          }
        }
      } catch {
        setError("Failed to verify access.");
      } finally {
        setIsLoading(false);
      }
    }
    checkAccess();
  }, []);

  // ── Fetch org ─────────────────────────────────────────────────────

  const fetchOrg = useCallback(async () => {
    const res = await apiFetch("/api/admin/org");
    if (res?.ok) {
      const data = await res.json();
      setOrg(data.org);
      setOrgForm({
        name: data.org.name || "",
        domain: data.org.domain || "",
        industry: data.org.industry || "",
        logo_url: data.org.logoUrl || "",
      });
    }
  }, [apiFetch]);

  // ── Fetch members ─────────────────────────────────────────────────

  const fetchMembers = useCallback(
    async (search?: string) => {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiFetch(`/api/admin/members${q}`);
      if (res?.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    },
    [apiFetch]
  );

  // ── Fetch departments ─────────────────────────────────────────────

  const fetchDepts = useCallback(async () => {
    const res = await apiFetch("/api/admin/departments");
    if (res?.ok) {
      const data = await res.json();
      setDepts(data.departments || []);
    }
  }, [apiFetch]);

  // ── Fetch roles ───────────────────────────────────────────────────

  const fetchRoles = useCallback(async () => {
    const res = await apiFetch("/api/admin/roles");
    if (res?.ok) {
      const data = await res.json();
      setCustomRoles(data.roles || []);
    }
  }, [apiFetch]);

  // ── Fetch security settings ──────────────────────────────────────

  const fetchSecurity = useCallback(async () => {
    const res = await apiFetch("/api/admin/org");
    if (res?.ok) {
      const data = await res.json();
      const s = data.org?.settings?.security;
      if (s) {
        setSecurity({ ...DEFAULT_SECURITY, ...s });
      } else {
        setSecurity({ ...DEFAULT_SECURITY });
      }
    }
  }, [apiFetch]);

  const fetchSsoConfigs = useCallback(async () => {
    setSsoLoading(true);
    try {
      const res = await apiFetch("/api/admin/sso");
      if (res?.ok) {
        const data = await res.json();
        setSsoConfigs(data.configs || []);
      }
    } finally {
      setSsoLoading(false);
    }
  }, [apiFetch]);

  const fetchAuditLogs = useCallback(async (append = false, cursor?: string | null) => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (auditFilterActor) params.set("actor_id", auditFilterActor);
      if (auditFilterAction) params.set("action", auditFilterAction);
      if (auditFilterEntity) params.set("entity_type", auditFilterEntity);
      if (auditFilterFrom) params.set("from", auditFilterFrom);
      if (auditFilterTo) params.set("to", auditFilterTo);
      if (auditSearch) params.set("search", auditSearch);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");
      const q = params.toString() ? `?${params.toString()}` : "";
      const res = await apiFetch(`/api/admin/audit-logs${q}`);
      if (res?.ok) {
        const data = await res.json();
        if (append) {
          setAuditLogs((prev) => [...prev, ...data.logs]);
        } else {
          setAuditLogs(data.logs);
        }
        setAuditNextCursor(data.nextCursor);
        setAuditHasMore(data.hasMore);
      }
    } finally {
      setAuditLoading(false);
    }
  }, [apiFetch, auditFilterActor, auditFilterAction, auditFilterEntity, auditFilterFrom, auditFilterTo, auditSearch]);

  const fetchAuditFilterOptions = useCallback(async () => {
    const [actionsRes, typesRes] = await Promise.all([
      apiFetch("/api/admin/audit-logs/actions"),
      apiFetch("/api/admin/audit-logs/entity-types"),
    ]);
    if (actionsRes?.ok) {
      const data = await actionsRes.json();
      setAuditActions(data.actions || []);
    }
    if (typesRes?.ok) {
      const data = await typesRes.json();
      setAuditEntityTypes(data.entityTypes || []);
    }
  }, [apiFetch]);

  // ── Load data on tab change ───────────────────────────────────────

  useEffect(() => {
    if (error || isLoading) return;
    if (activeTab === "org") fetchOrg();
    if (activeTab === "members") fetchMembers();
    if (activeTab === "departments") fetchDepts();
    if (activeTab === "roles") fetchRoles();
    if (activeTab === "security") fetchSecurity();
    if (activeTab === "sso") fetchSsoConfigs();
    if (activeTab === "audit") { fetchAuditLogs(); fetchAuditFilterOptions(); }
  }, [activeTab, error, isLoading, fetchOrg, fetchMembers, fetchDepts, fetchRoles, fetchSecurity, fetchSsoConfigs, fetchAuditLogs, fetchAuditFilterOptions]);

  // ── Org handlers ──────────────────────────────────────────────────

  const handleSaveOrg = async () => {
    setOrgSaving(true);
    try {
      await apiFetch("/api/admin/org", {
        method: "PATCH",
        body: JSON.stringify(orgForm),
      });
      await fetchOrg();
    } catch {
      // ignore
    } finally {
      setOrgSaving(false);
    }
  };

  // ── Security handlers ───────────────────────────────────────────

  const handleSaveSecurity = async () => {
    setSecuritySaving(true);
    try {
      await apiFetch("/api/admin/org/security", {
        method: "PATCH",
        body: JSON.stringify(security),
      });
      await fetchSecurity();
    } catch {
      // ignore
    } finally {
      setSecuritySaving(false);
    }
  };

  // ── SSO handlers ────────────────────────────────────────────────

  const handleSsoSave = async () => {
    setSsoSaving(true);
    try {
      if (ssoEditing === "new") {
        await apiFetch("/api/admin/sso", {
          method: "POST",
          body: JSON.stringify(ssoForm),
        });
      } else if (ssoEditing) {
        await apiFetch(`/api/admin/sso/${ssoEditing}`, {
          method: "PUT",
          body: JSON.stringify(ssoForm),
        });
      }
      setSsoEditing(null);
      await fetchSsoConfigs();
    } finally {
      setSsoSaving(false);
    }
  };

  const handleSsoDelete = async (id: string) => {
    await apiFetch(`/api/admin/sso/${id}`, { method: "DELETE" });
    await fetchSsoConfigs();
  };

  const handleSsoToggle = async (config: SsoConfigData) => {
    await apiFetch(`/api/admin/sso/${config.id}`, {
      method: "PUT",
      body: JSON.stringify({
        entity_id: config.entityId,
        sso_url: config.ssoUrl,
        certificate: config.certificate,
        metadata_url: config.metadataUrl,
        enabled: !config.enabled,
      }),
    });
    await fetchSsoConfigs();
  };

  // ── Member handlers ───────────────────────────────────────────────

  const handleChangeRole = async (userId: string, role: string) => {
    await apiFetch(`/api/admin/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    await fetchMembers(memberSearch);
  };

  const handleDeactivate = async (userId: string) => {
    if (!confirm("Deactivate this member?")) return;
    await apiFetch(`/api/admin/members/${userId}/deactivate`, {
      method: "POST",
    });
    await fetchMembers(memberSearch);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await apiFetch("/api/admin/members/invite", {
        method: "POST",
        body: JSON.stringify({ emails: [inviteEmail.trim()] }),
      });
      setInviteEmail("");
      await fetchMembers(memberSearch);
    } catch {
      // ignore
    } finally {
      setInviting(false);
    }
  };

  // ── Department handlers ───────────────────────────────────────────

  const handleCreateDept = async () => {
    if (!newDeptName.trim()) return;
    await apiFetch("/api/admin/departments", {
      method: "POST",
      body: JSON.stringify({ name: newDeptName.trim(), parent_id: newDeptParent }),
    });
    setNewDeptName("");
    setNewDeptParent(null);
    await fetchDepts();
  };

  const handleRenameDept = async (deptId: string) => {
    if (!editDeptName.trim()) return;
    await apiFetch(`/api/admin/departments/${deptId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: editDeptName.trim() }),
    });
    setEditingDept(null);
    await fetchDepts();
  };

  const handleDeleteDept = async (deptId: string) => {
    if (!confirm("Delete this department?")) return;
    await apiFetch(`/api/admin/departments/${deptId}`, {
      method: "DELETE",
    });
    await fetchDepts();
  };

  const handleAddDeptMember = async (deptId: string) => {
    if (!addMemberEmail.trim()) return;
    // Find user by email in members list
    const member = members.find(
      (m) => m.email.toLowerCase() === addMemberEmail.toLowerCase().trim()
    );
    if (!member) {
      alert("User not found. Make sure they are a member of this organization.");
      return;
    }
    await apiFetch(`/api/admin/departments/${deptId}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id: member.id }),
    });
    setAddMemberDept(null);
    setAddMemberEmail("");
    await fetchDepts();
  };

  const handleRemoveDeptMember = async (deptId: string, userId: string) => {
    await apiFetch(`/api/admin/departments/${deptId}/members/${userId}`, {
      method: "DELETE",
    });
    await fetchDepts();
  };

  // ── Role handlers ─────────────────────────────────────────────────

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    await apiFetch("/api/admin/roles", {
      method: "POST",
      body: JSON.stringify({
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || null,
        permissions: newRolePerms,
      }),
    });
    setNewRoleName("");
    setNewRoleDesc("");
    setNewRolePerms({});
    await fetchRoles();
  };

  const handleUpdateRolePerms = async (roleId: string) => {
    await apiFetch(`/api/admin/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify({ permissions: editRolePerms }),
    });
    setEditingRole(null);
    await fetchRoles();
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm("Delete this role?")) return;
    await apiFetch(`/api/admin/roles/${roleId}`, { method: "DELETE" });
    await fetchRoles();
  };

  const togglePerm = (
    perms: Record<string, string[]>,
    setPerms: (p: Record<string, string[]>) => void,
    module: string,
    action: string
  ) => {
    const current = perms[module] || [];
    const next = current.includes(action)
      ? current.filter((a) => a !== action)
      : [...current, action];
    setPerms({ ...perms, [module]: next });
  };

  // ── Department tree helpers ───────────────────────────────────────

  function getRootDepts() {
    return depts.filter((d) => !d.parentId);
  }

  function getChildDepts(parentId: string) {
    return depts.filter((d) => d.parentId === parentId);
  }

  function toggleExpand(id: string) {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 max-w-md">
          <Shield className="w-8 h-8 mx-auto mb-2" />
          <p className="text-center font-medium">{error}</p>
          <p className="text-center text-sm mt-1 text-red-500">
            Contact your organization admin for access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar tabs */}
      <div className="w-56 border-r border-gray-200 p-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Console</h2>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto p-6">
        {/* ─── Organization Tab ─────────────────────────────────── */}
        {activeTab === "org" && (
          <div className="max-w-2xl">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              Organization Settings
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={orgForm.name}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domain
                </label>
                <input
                  type="text"
                  value={orgForm.domain}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, domain: e.target.value })
                  }
                  placeholder="example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Industry
                </label>
                <input
                  type="text"
                  value={orgForm.industry}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, industry: e.target.value })
                  }
                  placeholder="Technology, Healthcare, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logo URL
                </label>
                <input
                  type="text"
                  value={orgForm.logo_url}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, logo_url: e.target.value })
                  }
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {org && (
                <div className="pt-2">
                  <span className="text-sm text-gray-500">
                    Plan:{" "}
                    <span className="font-medium text-gray-700 capitalize">
                      {org.plan}
                    </span>
                  </span>
                </div>
              )}

              <div className="pt-4">
                <button
                  onClick={handleSaveOrg}
                  disabled={orgSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {orgSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Members Tab ──────────────────────────────────────── */}
        {activeTab === "members" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Members</h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => {
                      setMemberSearch(e.target.value);
                      fetchMembers(e.target.value);
                    }}
                    placeholder="Search members..."
                    className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-64"
                  />
                </div>
              </div>
            </div>

            {/* Invite bar */}
            <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
              <Mail className="w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Invite by email..."
                className="flex-1 bg-transparent border-none outline-none text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {inviting ? "Sending..." : "Invite"}
              </button>
            </div>

            {/* Members list */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Email
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Role
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                            {m.displayName?.[0]?.toUpperCase() || "?"}
                          </div>
                          <span className="font-medium text-gray-900">
                            {m.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{m.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${roleBadgeColor(
                            m.role
                          )}`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <select
                            value={m.role}
                            onChange={(e) =>
                              handleChangeRole(m.id, e.target.value)
                            }
                            className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white"
                          >
                            <option value="member">member</option>
                            <option value="admin">admin</option>
                            <option value="owner">owner</option>
                          </select>
                          <button
                            onClick={() => handleDeactivate(m.id)}
                            className="p-1 text-gray-400 hover:text-red-500"
                            title="Deactivate"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        No members found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Departments Tab ──────────────────────────────────── */}
        {activeTab === "departments" && (
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              Departments
            </h3>

            {/* Add department */}
            <div className="flex items-center gap-2 mb-6 p-3 bg-gray-50 rounded-lg">
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="New department name..."
                className="flex-1 bg-transparent border-none outline-none text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleCreateDept()}
              />
              <select
                value={newDeptParent || ""}
                onChange={(e) =>
                  setNewDeptParent(e.target.value || null)
                }
                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
              >
                <option value="">Root level</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateDept}
                disabled={!newDeptName.trim()}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>

            {/* Department tree */}
            <div className="space-y-1">
              {getRootDepts().length === 0 && (
                <p className="text-gray-400 text-sm text-center py-8">
                  No departments yet. Add one above.
                </p>
              )}
              {getRootDepts().map((dept) => (
                <DeptNode
                  key={dept.id}
                  dept={dept}
                  depth={0}
                  getChildren={getChildDepts}
                  expanded={expandedDepts}
                  toggleExpand={toggleExpand}
                  editingDept={editingDept}
                  editDeptName={editDeptName}
                  setEditingDept={setEditingDept}
                  setEditDeptName={setEditDeptName}
                  handleRenameDept={handleRenameDept}
                  handleDeleteDept={handleDeleteDept}
                  addMemberDept={addMemberDept}
                  addMemberEmail={addMemberEmail}
                  setAddMemberDept={setAddMemberDept}
                  setAddMemberEmail={setAddMemberEmail}
                  handleAddDeptMember={handleAddDeptMember}
                  handleRemoveDeptMember={handleRemoveDeptMember}
                />
              ))}
            </div>
          </div>
        )}

        {/* ─── Roles Tab ────────────────────────────────────────── */}
        {activeTab === "roles" && (
          <div>
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              Custom Roles
            </h3>

            {/* Create role form */}
            <div className="border border-gray-200 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Create New Role
              </h4>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Role name"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Permission checkboxes */}
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-1 pr-4 font-medium text-gray-600">
                        Module
                      </th>
                      {PERMISSION_ACTIONS.map((a) => (
                        <th
                          key={a}
                          className="text-center py-1 px-2 font-medium text-gray-600 capitalize"
                        >
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((mod) => (
                      <tr key={mod} className="border-b border-gray-50">
                        <td className="py-1 pr-4 capitalize text-gray-700">
                          {mod}
                        </td>
                        {PERMISSION_ACTIONS.map((action) => (
                          <td key={action} className="text-center py-1 px-2">
                            <input
                              type="checkbox"
                              checked={
                                (newRolePerms[mod] || []).includes(action)
                              }
                              onChange={() =>
                                togglePerm(
                                  newRolePerms,
                                  setNewRolePerms,
                                  mod,
                                  action
                                )
                              }
                              className="rounded"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleCreateRole}
                disabled={!newRoleName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Create Role
              </button>
            </div>

            {/* Existing roles */}
            <div className="space-y-3">
              {customRoles.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">
                  No custom roles yet.
                </p>
              )}
              {customRoles.map((role) => (
                <div
                  key={role.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900">{role.name}</h4>
                      {role.description && (
                        <p className="text-xs text-gray-500">
                          {role.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {editingRole === role.id ? (
                        <>
                          <button
                            onClick={() => handleUpdateRolePerms(role.id)}
                            className="p-1 text-green-600 hover:text-green-700"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingRole(null)}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingRole(role.id);
                              setEditRolePerms(role.permissions || {});
                            }}
                            className="p-1 text-gray-400 hover:text-blue-600"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRole(role.id)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Show permissions */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-1 pr-4 font-medium text-gray-600">
                            Module
                          </th>
                          {PERMISSION_ACTIONS.map((a) => (
                            <th
                              key={a}
                              className="text-center py-1 px-2 font-medium text-gray-600 capitalize"
                            >
                              {a}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MODULES.map((mod) => {
                          const perms =
                            editingRole === role.id
                              ? editRolePerms
                              : role.permissions || {};
                          return (
                            <tr key={mod} className="border-b border-gray-50">
                              <td className="py-1 pr-4 capitalize text-gray-700">
                                {mod}
                              </td>
                              {PERMISSION_ACTIONS.map((action) => (
                                <td
                                  key={action}
                                  className="text-center py-1 px-2"
                                >
                                  <input
                                    type="checkbox"
                                    checked={(perms[mod] || []).includes(
                                      action
                                    )}
                                    onChange={() => {
                                      if (editingRole === role.id) {
                                        togglePerm(
                                          editRolePerms,
                                          setEditRolePerms,
                                          mod,
                                          action
                                        );
                                      }
                                    }}
                                    disabled={editingRole !== role.id}
                                    className="rounded"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Security Tab ──────────────────────────────────────── */}
        {activeTab === "security" && (
          <div className="max-w-2xl">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              Security Settings
            </h3>

            {/* Password Policy */}
            <div className="mb-8">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                Password Policy
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Password Length
                  </label>
                  <input
                    type="number"
                    min={6}
                    max={128}
                    value={security.passwordMinLength}
                    onChange={(e) =>
                      setSecurity((s) => ({
                        ...s,
                        passwordMinLength: parseInt(e.target.value) || 8,
                      }))
                    }
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={security.passwordRequireUppercase}
                    onChange={(e) =>
                      setSecurity((s) => ({
                        ...s,
                        passwordRequireUppercase: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">
                    Require uppercase letter
                  </span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={security.passwordRequireNumber}
                    onChange={(e) =>
                      setSecurity((s) => ({
                        ...s,
                        passwordRequireNumber: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">
                    Require number
                  </span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={security.passwordRequireSpecial}
                    onChange={(e) =>
                      setSecurity((s) => ({
                        ...s,
                        passwordRequireSpecial: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">
                    Require special character
                  </span>
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password Expiry (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={security.passwordExpiryDays}
                    onChange={(e) =>
                      setSecurity((s) => ({
                        ...s,
                        passwordExpiryDays: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Set to 0 to disable password expiration
                  </p>
                </div>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="mb-8">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                Two-Factor Authentication
              </h4>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={security.require2FA}
                  onChange={(e) =>
                    setSecurity((s) => ({
                      ...s,
                      require2FA: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                <span className="text-sm text-gray-700">
                  Require two-factor authentication for all members
                </span>
              </label>
            </div>

            {/* External Communication */}
            <div className="mb-8">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                External Communication
              </h4>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={security.allowExternalComm}
                  onChange={(e) =>
                    setSecurity((s) => ({
                      ...s,
                      allowExternalComm: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                <span className="text-sm text-gray-700">
                  Allow members to message external users
                </span>
              </label>
            </div>

            {/* Session Timeout */}
            <div className="mb-8">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                Session Management
              </h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Idle Session Timeout (minutes)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={security.sessionTimeoutMinutes}
                  onChange={(e) =>
                    setSecurity((s) => ({
                      ...s,
                      sessionTimeoutMinutes: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Set to 0 to disable idle timeout
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveSecurity}
              disabled={securitySaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {securitySaving ? "Saving..." : "Save Security Settings"}
            </button>
          </div>
        )}

        {/* ── SSO Tab ────────────────────────────────────────── */}
        {activeTab === "sso" && (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                Single Sign-On (SAML 2.0)
              </h3>
              {!ssoEditing && (
                <button
                  onClick={() => {
                    setSsoEditing("new");
                    setSsoForm({
                      metadata_url: "",
                      entity_id: "",
                      sso_url: "",
                      certificate: "",
                      enabled: false,
                    });
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Add SAML Configuration
                </button>
              )}
            </div>

            {ssoEditing && (
              <div className="border border-gray-200 rounded-lg p-5 mb-6 bg-gray-50">
                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                  {ssoEditing === "new" ? "New SAML Configuration" : "Edit SAML Configuration"}
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Metadata URL (optional)
                    </label>
                    <input
                      type="url"
                      value={ssoForm.metadata_url}
                      onChange={(e) =>
                        setSsoForm((f) => ({ ...f, metadata_url: e.target.value }))
                      }
                      placeholder="https://idp.example.com/saml/metadata"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      URL to fetch IdP metadata automatically
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IdP Entity ID *
                    </label>
                    <input
                      type="text"
                      value={ssoForm.entity_id}
                      onChange={(e) =>
                        setSsoForm((f) => ({ ...f, entity_id: e.target.value }))
                      }
                      placeholder="https://idp.example.com/saml"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IdP SSO URL *
                    </label>
                    <input
                      type="url"
                      value={ssoForm.sso_url}
                      onChange={(e) =>
                        setSsoForm((f) => ({ ...f, sso_url: e.target.value }))
                      }
                      placeholder="https://idp.example.com/saml/sso"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IdP X.509 Certificate *
                    </label>
                    <textarea
                      value={ssoForm.certificate}
                      onChange={(e) =>
                        setSsoForm((f) => ({ ...f, certificate: e.target.value }))
                      }
                      rows={6}
                      placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={ssoForm.enabled}
                      onChange={(e) =>
                        setSsoForm((f) => ({ ...f, enabled: e.target.checked }))
                      }
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">
                      Enable this SSO configuration
                    </span>
                  </label>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSsoSave}
                      disabled={ssoSaving || !ssoForm.entity_id || !ssoForm.sso_url || !ssoForm.certificate}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                      {ssoSaving ? "Saving..." : "Save Configuration"}
                    </button>
                    <button
                      onClick={() => setSsoEditing(null)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {ssoLoading && ssoConfigs.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                Loading SSO configurations...
              </div>
            )}

            {!ssoLoading && ssoConfigs.length === 0 && !ssoEditing && (
              <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg">
                <Key className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">
                  No SSO configurations yet. Add a SAML 2.0 configuration to enable single sign-on.
                </p>
              </div>
            )}

            {ssoConfigs.map((config) => (
              <div
                key={config.id}
                className="border border-gray-200 rounded-lg p-4 mb-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        config.enabled
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {config.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      SAML 2.0
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSsoToggle(config)}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      {config.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => {
                        setSsoEditing(config.id);
                        setSsoForm({
                          metadata_url: config.metadataUrl || "",
                          entity_id: config.entityId,
                          sso_url: config.ssoUrl,
                          certificate: config.certificate,
                          enabled: config.enabled,
                        });
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleSsoDelete(config.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>
                    <span className="font-medium text-gray-600">Entity ID:</span>{" "}
                    {config.entityId}
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">SSO URL:</span>{" "}
                    {config.ssoUrl}
                  </div>
                  {config.metadataUrl && (
                    <div>
                      <span className="font-medium text-gray-600">Metadata:</span>{" "}
                      {config.metadataUrl}
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-gray-600">SP Login URL:</span>{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">
                      /auth/saml/login?org_id={config.orgId}
                    </code>
                  </div>
                </div>
              </div>
            ))}

            <p className="text-xs text-gray-400 mt-6">
              Configure SAML 2.0 SSO to allow members to sign in with your
              identity provider. The SP ACS URL is{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded">
                /auth/saml/callback
              </code>
            </p>
          </div>
        )}

        {/* ── Audit Logs Tab ──────────────────────────────────── */}
        {activeTab === "audit" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                Audit Logs
              </h3>
              <button
                onClick={async () => {
                  setAuditExporting(true);
                  try {
                    const res = await apiFetch("/api/admin/audit-logs/export", {
                      method: "POST",
                      body: JSON.stringify({
                        actor_id: auditFilterActor || undefined,
                        action: auditFilterAction || undefined,
                        entity_type: auditFilterEntity || undefined,
                        from: auditFilterFrom || undefined,
                        to: auditFilterTo || undefined,
                      }),
                    });
                    if (res?.ok) {
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  } finally {
                    setAuditExporting(false);
                  }
                }}
                disabled={auditExporting}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {auditExporting ? "Exporting..." : "Export CSV"}
              </button>
            </div>

            {/* Filters */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
                <Filter className="w-4 h-4" />
                Filters
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Search
                  </label>
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Action
                  </label>
                  <select
                    value={auditFilterAction}
                    onChange={(e) => setAuditFilterAction(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All actions</option>
                    {auditActions.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Entity Type
                  </label>
                  <select
                    value={auditFilterEntity}
                    onChange={(e) => setAuditFilterEntity(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All types</option>
                    {auditEntityTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    From
                  </label>
                  <input
                    type="date"
                    value={auditFilterFrom}
                    onChange={(e) => setAuditFilterFrom(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    To
                  </label>
                  <input
                    type="date"
                    value={auditFilterTo}
                    onChange={(e) => setAuditFilterTo(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => fetchAuditLogs()}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Apply Filters
                </button>
                <button
                  onClick={() => {
                    setAuditFilterActor("");
                    setAuditFilterAction("");
                    setAuditFilterEntity("");
                    setAuditFilterFrom("");
                    setAuditFilterTo("");
                    setAuditSearch("");
                  }}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Timestamp
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Actor
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Action
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Entity
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      IP
                    </th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 && !auditLoading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-12 text-gray-400"
                      >
                        No audit logs found
                      </td>
                    </tr>
                  )}
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      onClick={() =>
                        setAuditExpandedId(
                          auditExpandedId === log.id ? null : log.id
                        )
                      }
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {log.actorName || "Unknown"}
                        </div>
                        <div className="text-xs text-gray-400">
                          {log.actorEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-900">{log.entityType}</span>
                        {log.entityId && (
                          <span className="text-xs text-gray-400 ml-1">
                            {log.entityId.slice(0, 8)}...
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {log.ip || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronDown
                          className={`w-4 h-4 text-gray-400 transition-transform ${auditExpandedId === log.id ? "rotate-180" : ""}`}
                        />
                      </td>
                    </tr>
                  ))}
                  {auditLogs.map(
                    (log) =>
                      auditExpandedId === log.id && (
                        <tr key={`${log.id}-detail`} className="bg-gray-50">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-gray-600">
                                  Actor ID:
                                </span>{" "}
                                <span className="text-gray-800 font-mono text-xs">
                                  {log.actorId}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-600">
                                  Entity ID:
                                </span>{" "}
                                <span className="text-gray-800 font-mono text-xs">
                                  {log.entityId || "-"}
                                </span>
                              </div>
                              <div className="col-span-2">
                                <span className="font-medium text-gray-600">
                                  User Agent:
                                </span>{" "}
                                <span className="text-gray-500 text-xs break-all">
                                  {log.userAgent || "-"}
                                </span>
                              </div>
                              {log.diff && (
                                <div className="col-span-2">
                                  <span className="font-medium text-gray-600">
                                    Changes:
                                  </span>
                                  <pre className="mt-1 p-3 bg-white border border-gray-200 rounded-md text-xs overflow-x-auto font-mono">
                                    {JSON.stringify(log.diff, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                  )}
                </tbody>
              </table>
            </div>

            {/* Load More */}
            {auditHasMore && (
              <div className="text-center mt-4">
                <button
                  onClick={() => fetchAuditLogs(true, auditNextCursor)}
                  disabled={auditLoading}
                  className="px-4 py-2 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                >
                  {auditLoading ? "Loading..." : "Load More"}
                </button>
              </div>
            )}

            {auditLoading && auditLogs.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                Loading audit logs...
              </div>
            )}

            <p className="text-xs text-gray-400 mt-4">
              Audit logs are retained for 180+ days. All state-changing API
              actions are automatically recorded.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Department Tree Node Component ──────────────────────────────────

function DeptNode({
  dept,
  depth,
  getChildren,
  expanded,
  toggleExpand,
  editingDept,
  editDeptName,
  setEditingDept,
  setEditDeptName,
  handleRenameDept,
  handleDeleteDept,
  addMemberDept,
  addMemberEmail,
  setAddMemberDept,
  setAddMemberEmail,
  handleAddDeptMember,
  handleRemoveDeptMember,
}: {
  dept: DeptData;
  depth: number;
  getChildren: (id: string) => DeptData[];
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  editingDept: string | null;
  editDeptName: string;
  setEditingDept: (id: string | null) => void;
  setEditDeptName: (name: string) => void;
  handleRenameDept: (id: string) => void;
  handleDeleteDept: (id: string) => void;
  addMemberDept: string | null;
  addMemberEmail: string;
  setAddMemberDept: (id: string | null) => void;
  setAddMemberEmail: (email: string) => void;
  handleAddDeptMember: (id: string) => void;
  handleRemoveDeptMember: (deptId: string, userId: string) => void;
}) {
  const children = getChildren(dept.id);
  const isExpanded = expanded.has(dept.id);
  const hasChildren = children.length > 0;
  const hasMembers = dept.members && dept.members.length > 0;

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-1 py-1 px-2 rounded hover:bg-gray-50 group">
        <button
          onClick={() => toggleExpand(dept.id)}
          className="w-5 h-5 flex items-center justify-center text-gray-400"
        >
          {hasChildren || hasMembers ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )
          ) : (
            <span className="w-3.5" />
          )}
        </button>

        {editingDept === dept.id ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={editDeptName}
              onChange={(e) => setEditDeptName(e.target.value)}
              className="px-2 py-0.5 border border-gray-300 rounded text-sm flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameDept(dept.id);
                if (e.key === "Escape") setEditingDept(null);
              }}
            />
            <button
              onClick={() => handleRenameDept(dept.id)}
              className="p-0.5 text-green-600"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setEditingDept(null)}
              className="p-0.5 text-gray-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <Network className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-800 flex-1">
              {dept.name}
            </span>
            <span className="text-xs text-gray-400">
              {dept.members?.length || 0} members
            </span>
            <div className="hidden group-hover:flex items-center gap-0.5 ml-2">
              <button
                onClick={() => {
                  setEditingDept(dept.id);
                  setEditDeptName(dept.name);
                }}
                className="p-0.5 text-gray-400 hover:text-blue-600"
                title="Rename"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setAddMemberDept(dept.id);
                  setAddMemberEmail("");
                }}
                className="p-0.5 text-gray-400 hover:text-green-600"
                title="Add member"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteDept(dept.id)}
                className="p-0.5 text-gray-400 hover:text-red-500"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Add member input */}
      {addMemberDept === dept.id && (
        <div
          className="flex items-center gap-1 py-1 px-2 ml-6"
          style={{ marginLeft: depth * 20 + 24 }}
        >
          <input
            type="email"
            value={addMemberEmail}
            onChange={(e) => setAddMemberEmail(e.target.value)}
            placeholder="Member email..."
            className="px-2 py-0.5 border border-gray-300 rounded text-xs flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddDeptMember(dept.id);
              if (e.key === "Escape") setAddMemberDept(null);
            }}
          />
          <button
            onClick={() => handleAddDeptMember(dept.id)}
            className="p-0.5 text-green-600"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setAddMemberDept(null)}
            className="p-0.5 text-gray-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Members and children */}
      {isExpanded && (
        <>
          {dept.members?.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-2 py-0.5 px-2 ml-6 text-xs text-gray-500 group/member"
              style={{ marginLeft: depth * 20 + 24 }}
            >
              <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px]">
                {m.displayName?.[0]?.toUpperCase() || "?"}
              </div>
              <span className="flex-1">{m.displayName}</span>
              <span className="text-gray-400">{m.email}</span>
              <button
                onClick={() => handleRemoveDeptMember(dept.id, m.userId)}
                className="hidden group-hover/member:block p-0.5 text-gray-300 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {children.map((child) => (
            <DeptNode
              key={child.id}
              dept={child}
              depth={depth + 1}
              getChildren={getChildren}
              expanded={expanded}
              toggleExpand={toggleExpand}
              editingDept={editingDept}
              editDeptName={editDeptName}
              setEditingDept={setEditingDept}
              setEditDeptName={setEditDeptName}
              handleRenameDept={handleRenameDept}
              handleDeleteDept={handleDeleteDept}
              addMemberDept={addMemberDept}
              addMemberEmail={addMemberEmail}
              setAddMemberDept={setAddMemberDept}
              setAddMemberEmail={setAddMemberEmail}
              handleAddDeptMember={handleAddDeptMember}
              handleRemoveDeptMember={handleRemoveDeptMember}
            />
          ))}
        </>
      )}
    </div>
  );
}

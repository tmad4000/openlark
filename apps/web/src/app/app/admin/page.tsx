"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Users,
  Network,
  Shield,
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

type TabId = "org" | "members" | "departments" | "roles";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "org", label: "Organization", icon: Building2 },
  { id: "members", label: "Members", icon: Users },
  { id: "departments", label: "Departments", icon: Network },
  { id: "roles", label: "Roles", icon: Shield },
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

  // ── Load data on tab change ───────────────────────────────────────

  useEffect(() => {
    if (error || isLoading) return;
    if (activeTab === "org") fetchOrg();
    if (activeTab === "members") fetchMembers();
    if (activeTab === "departments") fetchDepts();
    if (activeTab === "roles") fetchRoles();
  }, [activeTab, error, isLoading, fetchOrg, fetchMembers, fetchDepts, fetchRoles]);

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

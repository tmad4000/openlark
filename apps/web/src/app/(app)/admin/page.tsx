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
import {
  api,
  type AdminMember,
  type OrganizationFull,
  type SecuritySettings,
  type DepartmentTree,
  type InvitationInfo,
  type AuditLogEntry,
} from "@/lib/api";
import {
  Shield,
  Users,
  Building2,
  KeyRound,
  Plus,
  Search,
  Loader2,
  ChevronRight,
  ChevronDown,
  Trash2,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  UserX,
  UserCheck,
  Save,
  X,
  Lock,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminTab = "organization" | "members" | "departments" | "roles" | "security" | "sso" | "audit";

// ─── Role badge ───
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    primary_admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    member: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  const labels: Record<string, string> = {
    primary_admin: "Primary Admin",
    admin: "Admin",
    member: "Member",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", colors[role] || colors.member)}>
      {labels[role] || role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    deactivated: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", colors[status] || colors.pending)}>
      {status}
    </span>
  );
}

// ─── Organization Tab ───
function OrganizationTab({ orgId }: { orgId: string }) {
  const [org, setOrg] = useState<OrganizationFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", domain: "", logoUrl: "", industry: "" });

  useEffect(() => {
    (async () => {
      try {
        const result = await api.getOrganization(orgId);
        setOrg(result.organization);
        setForm({
          name: result.organization.name || "",
          domain: result.organization.domain || "",
          logoUrl: result.organization.logoUrl || "",
          industry: result.organization.industry || "",
        });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await api.updateOrganization(orgId, {
        name: form.name || undefined,
        domain: form.domain || undefined,
        logoUrl: form.logoUrl || undefined,
        industry: form.industry || undefined,
      });
      setOrg(result.organization);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Organization Settings</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Organization Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Domain
          </label>
          <input
            type="text"
            value={form.domain}
            onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Logo URL
          </label>
          <input
            type="text"
            value={form.logoUrl}
            onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Industry
          </label>
          <input
            type="text"
            value={form.industry}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {org && (
          <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <p>Plan: <span className="font-medium capitalize">{org.plan}</span></p>
            <p>Created: {new Date(org.createdAt).toLocaleDateString()}</p>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ─── Members Tab ───
function MembersTab({ orgId, currentUserId }: { orgId: string; currentUserId: string }) {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState("");
  const [inviting, setInviting] = useState(false);
  const [roleDialogUser, setRoleDialogUser] = useState<AdminMember | null>(null);
  const [newRole, setNewRole] = useState("");

  const loadMembers = useCallback(async (q?: string) => {
    try {
      setLoading(true);
      const result = await api.getAdminMembers(q);
      setMembers(result.members);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleSearch = useCallback(() => {
    loadMembers(search || undefined);
  }, [search, loadMembers]);

  const handleInvite = async () => {
    setInviting(true);
    try {
      const emails = inviteEmails.split(/[,\n]/).map((e) => e.trim()).filter(Boolean);
      await api.createInvitations(orgId, emails);
      setInviteOpen(false);
      setInviteEmails("");
      loadMembers();
    } catch {
      // ignore
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async () => {
    if (!roleDialogUser || !newRole) return;
    try {
      await api.updateMemberRole(roleDialogUser.id, newRole);
      setRoleDialogUser(null);
      loadMembers();
    } catch {
      // ignore
    }
  };

  const handleDeactivate = async (userId: string) => {
    try {
      await api.deactivateMember(userId);
      loadMembers();
    } catch {
      // ignore
    }
  };

  const handleReactivate = async (userId: string) => {
    try {
      await api.reactivateMember(userId);
      loadMembers();
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Members</h2>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1" />
          Invite
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search members..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Role</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Status</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300">
                          {m.displayName?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      <span className="text-gray-900 dark:text-gray-100">{m.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{m.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                  <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {m.id !== currentUserId && (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setRoleDialogUser(m); setNewRole(m.role); }}
                          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
                          title="Change role"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                        {m.status === "active" ? (
                          <button
                            onClick={() => handleDeactivate(m.id)}
                            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600"
                            title="Deactivate"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(m.id)}
                            className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-500 hover:text-green-600"
                            title="Reactivate"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">No members found</div>
          )}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Members</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Email addresses (comma or newline separated)
            </label>
            <textarea
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="user@example.com"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmails.trim()}>
              {inviting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
              Send Invitations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog open={!!roleDialogUser} onOpenChange={(open) => !open && setRoleDialogUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role for {roleDialogUser?.displayName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {["member", "admin", "primary_admin"].map((role) => (
              <label key={role} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={newRole === role}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="accent-blue-600"
                />
                <div>
                  <RoleBadge role={role} />
                  <p className="text-xs text-gray-500 mt-1">
                    {role === "primary_admin" && "Full control over the organization"}
                    {role === "admin" && "Can manage members, departments, and settings"}
                    {role === "member" && "Standard access to workspace features"}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogUser(null)}>Cancel</Button>
            <Button onClick={handleRoleChange}>Save Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Department Tree Node ───
function DeptNode({
  dept,
  orgId,
  level,
  onRefresh,
}: {
  dept: DepartmentTree;
  orgId: string;
  level: number;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");

  const handleRename = async () => {
    try {
      await api.updateDepartment(orgId, dept.id, { name });
      setEditing(false);
      onRefresh();
    } catch {
      // ignore
    }
  };

  const handleAddChild = async () => {
    if (!childName.trim()) return;
    try {
      await api.createDepartment(orgId, { name: childName.trim(), parentId: dept.id });
      setAddingChild(false);
      setChildName("");
      onRefresh();
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteDepartment(orgId, dept.id);
      onRefresh();
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1.5 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 group"
        style={{ paddingLeft: `${level * 20 + 8}px` }}
      >
        <button onClick={() => setExpanded(!expanded)} className="p-0.5">
          {dept.children.length > 0 ? (
            expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />
          ) : (
            <span className="w-4 h-4 inline-block" />
          )}
        </button>

        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="px-2 py-0.5 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex-1"
              autoFocus
            />
            <button onClick={handleRename} className="p-1 text-blue-600"><Save className="w-3.5 h-3.5" /></button>
            <button onClick={() => setEditing(false)} className="p-1 text-gray-400"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <>
            <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
            <span
              className="text-sm text-gray-900 dark:text-gray-100 flex-1 cursor-pointer"
              onDoubleClick={() => setEditing(true)}
            >
              {dept.name}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setAddingChild(true)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title="Add child">
                <Plus className="w-3.5 h-3.5 text-gray-400" />
              </button>
              <button onClick={handleDelete} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30" title="Delete">
                <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          </>
        )}
      </div>

      {addingChild && (
        <div className="flex items-center gap-1 py-1 px-2" style={{ paddingLeft: `${(level + 1) * 20 + 8}px` }}>
          <input
            type="text"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddChild()}
            placeholder="Department name"
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex-1"
            autoFocus
          />
          <Button size="sm" onClick={handleAddChild}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddingChild(false); setChildName(""); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {expanded && dept.children.map((child) => (
        <DeptNode key={child.id} dept={child} orgId={orgId} level={level + 1} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

// ─── Departments Tab ───
function DepartmentsTab({ orgId }: { orgId: string }) {
  const [departments, setDepartments] = useState<DepartmentTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRoot, setAddingRoot] = useState(false);
  const [rootName, setRootName] = useState("");

  const loadDepartments = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getDepartments(orgId);
      setDepartments(result.departments);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const handleAddRoot = async () => {
    if (!rootName.trim()) return;
    try {
      await api.createDepartment(orgId, { name: rootName.trim() });
      setAddingRoot(false);
      setRootName("");
      loadDepartments();
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Departments</h2>
        <Button size="sm" onClick={() => setAddingRoot(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add Department
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-2 space-y-0.5">
          {departments.map((dept) => (
            <DeptNode key={dept.id} dept={dept} orgId={orgId} level={0} onRefresh={loadDepartments} />
          ))}
          {departments.length === 0 && !addingRoot && (
            <div className="p-8 text-center text-sm text-gray-400">
              <Building2 className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              No departments yet
            </div>
          )}
          {addingRoot && (
            <div className="flex items-center gap-2 px-2 py-1">
              <input
                type="text"
                value={rootName}
                onChange={(e) => setRootName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddRoot()}
                placeholder="Department name"
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex-1"
                autoFocus
              />
              <Button size="sm" onClick={handleAddRoot}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingRoot(false); setRootName(""); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Roles Tab ───
interface CustomRole {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
}

const MODULES = [
  "messenger", "calendar", "docs", "wiki", "base", "tasks",
  "forms", "approvals", "okr", "attendance", "leave", "email",
];

function RolesTab() {
  const [roles, setRoles] = useState<CustomRole[]>([
    {
      id: "admin",
      name: "Admin",
      permissions: Object.fromEntries(MODULES.map((m) => [m, true])),
    },
    {
      id: "member",
      name: "Member",
      permissions: Object.fromEntries(MODULES.map((m) => [m, true])),
    },
  ]);
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [addOpen, setAddOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const selected = roles.find((r) => r.id === selectedRole);

  const togglePermission = (module: string) => {
    setRoles((prev) =>
      prev.map((r) =>
        r.id === selectedRole
          ? { ...r, permissions: { ...r.permissions, [module]: !r.permissions[module] } }
          : r
      )
    );
  };

  const handleAddRole = () => {
    if (!newRoleName.trim()) return;
    const id = newRoleName.toLowerCase().replace(/\s+/g, "_");
    setRoles((prev) => [
      ...prev,
      { id, name: newRoleName.trim(), permissions: Object.fromEntries(MODULES.map((m) => [m, true])) },
    ]);
    setSelectedRole(id);
    setAddOpen(false);
    setNewRoleName("");
  };

  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Custom Roles</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Add Role
        </Button>
      </div>

      <div className="flex gap-6">
        <div className="w-48 space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRole(role.id)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                selectedRole === role.id
                  ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <KeyRound className="w-4 h-4 inline mr-2" />
              {role.name}
            </button>
          ))}
        </div>

        {selected && (
          <div className="flex-1 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Module Permissions for &quot;{selected.name}&quot;
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {MODULES.map((module) => (
                <label
                  key={module}
                  className="flex items-center gap-2 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <input
                    type="checkbox"
                    checked={selected.permissions[module] ?? false}
                    onChange={() => togglePermission(module)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{module}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Role</DialogTitle>
          </DialogHeader>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Role Name</label>
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRole()}
              className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Team Lead"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRole} disabled={!newRoleName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Security Tab ───
const DEFAULT_SECURITY: SecuritySettings = {
  passwordMinLength: 8,
  passwordRequireUppercase: false,
  passwordRequireNumber: false,
  passwordRequireSpecial: false,
  passwordExpiryDays: 0,
  require2fa: false,
  allowExternalComms: true,
  sessionTimeoutMinutes: 0,
};

function SecurityTab({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULT_SECURITY);

  useEffect(() => {
    (async () => {
      try {
        const result = await api.getOrganization(orgId);
        const saved = (result.organization.settingsJson?.security ?? {}) as SecuritySettings;
        setSettings({ ...DEFAULT_SECURITY, ...saved });
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await api.getOrganization(orgId);
      const existingSettings = result.organization.settingsJson ?? {};
      await api.updateOrganization(orgId, {
        settings: { ...existingSettings, security: settings },
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof SecuritySettings>(key: K, value: SecuritySettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Security Settings</h2>

      {/* Password Policy */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2">
          Password Policy
        </h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Minimum Password Length
          </label>
          <input
            type="number"
            min={6}
            max={128}
            value={settings.passwordMinLength ?? 8}
            onChange={(e) => update("passwordMinLength", parseInt(e.target.value) || 8)}
            className={inputClass}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.passwordRequireUppercase ?? false}
            onChange={(e) => update("passwordRequireUppercase", e.target.checked)}
            className="accent-blue-600 w-4 h-4"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Require uppercase letter</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.passwordRequireNumber ?? false}
            onChange={(e) => update("passwordRequireNumber", e.target.checked)}
            className="accent-blue-600 w-4 h-4"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Require number</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.passwordRequireSpecial ?? false}
            onChange={(e) => update("passwordRequireSpecial", e.target.checked)}
            className="accent-blue-600 w-4 h-4"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Require special character</span>
        </label>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Password Expiry (days, 0 = never)
          </label>
          <input
            type="number"
            min={0}
            max={365}
            value={settings.passwordExpiryDays ?? 0}
            onChange={(e) => update("passwordExpiryDays", parseInt(e.target.value) || 0)}
            className={inputClass}
          />
        </div>
      </section>

      {/* Two-Factor Authentication */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2">
          Two-Factor Authentication
        </h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.require2fa ?? false}
            onChange={(e) => update("require2fa", e.target.checked)}
            className="accent-blue-600 w-4 h-4"
          />
          <div>
            <span className="text-sm text-gray-700 dark:text-gray-300">Require 2FA for all members</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              All members must set up two-factor authentication to access the workspace.
            </p>
          </div>
        </label>
      </section>

      {/* External Communication */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2">
          External Communication
        </h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.allowExternalComms ?? true}
            onChange={(e) => update("allowExternalComms", e.target.checked)}
            className="accent-blue-600 w-4 h-4"
          />
          <div>
            <span className="text-sm text-gray-700 dark:text-gray-300">Allow external messaging</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Members can send and receive messages from users outside the organization.
            </p>
          </div>
        </label>
      </section>

      {/* Session Timeout */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-800 pb-2">
          Session Management
        </h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Idle Session Timeout (minutes, 0 = no timeout)
          </label>
          <input
            type="number"
            min={0}
            max={10080}
            value={settings.sessionTimeoutMinutes ?? 0}
            onChange={(e) => update("sessionTimeoutMinutes", parseInt(e.target.value) || 0)}
            className={inputClass}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Automatically sign out users after this period of inactivity.
          </p>
        </div>
      </section>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
        Save Security Settings
      </Button>
    </div>
  );
}

// ─── SSO / SAML Tab ───
function SsoTab({ orgId }: { orgId: string }) {
  const [config, setConfig] = useState<{
    entityId: string;
    ssoUrl: string;
    certificate: string;
    isEnabled: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entityId, setEntityId] = useState("");
  const [ssoUrl, setSsoUrl] = useState("");
  const [certificate, setCertificate] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await api.getSsoConfig();
        if (result.config) {
          setConfig(result.config);
          setEntityId(result.config.entityId);
          setSsoUrl(result.config.ssoUrl);
          setCertificate(result.config.certificate);
          setIsEnabled(result.config.isEnabled);
        }
      } catch {
        // No config yet
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (config) {
        const result = await api.updateSsoConfig({
          entityId,
          ssoUrl,
          certificate,
          isEnabled,
        });
        setConfig(result.config);
      } else {
        const result = await api.createSsoConfig({
          entityId,
          ssoUrl,
          certificate,
        });
        setConfig(result.config);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-gray-500">Loading SSO configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
        SSO / SAML 2.0 Configuration
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Configure SAML 2.0 identity provider for single sign-on.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Entity ID (IdP Issuer)
          </label>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="https://idp.example.com/saml/metadata"
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            SSO URL (IdP Login URL)
          </label>
          <input
            type="text"
            value={ssoUrl}
            onChange={(e) => setSsoUrl(e.target.value)}
            placeholder="https://idp.example.com/saml/sso"
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            X.509 Certificate
          </label>
          <textarea
            value={certificate}
            onChange={(e) => setCertificate(e.target.value)}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            rows={6}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono"
          />
        </div>

        {config && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Enable SSO
            </label>
            <button
              onClick={() => setIsEnabled(!isEnabled)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                isEnabled ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  isEnabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={handleSave} disabled={saving || !entityId || !ssoUrl || !certificate}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {config ? "Update Configuration" : "Save Configuration"}
          </Button>
        </div>

        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Service Provider Details
          </h3>
          <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400 font-mono">
            <p>ACS URL: {typeof window !== "undefined" ? window.location.origin : ""}/api/v1/auth/saml/callback</p>
            <p>Entity ID: {typeof window !== "undefined" ? window.location.origin : ""}/saml/metadata</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Audit Logs Tab ───
function AuditLogsTab({ orgId }: { orgId: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const [filters, setFilters] = useState({
    search: "",
    action: "",
    entityType: "",
    from: "",
    to: "",
  });

  const PAGE_SIZE = 50;

  const loadLogs = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const result = await api.getAuditLogs({
        action: filters.action || undefined,
        entityType: filters.entityType || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        search: filters.search || undefined,
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      });
      setLogs(result.logs);
      setTotal(result.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadLogs(page);
  }, [loadLogs, page]);

  useEffect(() => {
    (async () => {
      try {
        const [actionsRes, typesRes] = await Promise.all([
          api.getAuditActions(),
          api.getAuditEntityTypes(),
        ]);
        setActions(actionsRes.actions);
        setEntityTypes(typesRes.entityTypes);
      } catch {
        // ignore
      }
    })();
  }, []);

  const handleFilter = () => {
    setPage(0);
    loadLogs(0);
  };

  const handleExport = () => {
    const url = api.getAuditExportUrl({
      action: filters.action || undefined,
      entityType: filters.entityType || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      search: filters.search || undefined,
    });
    window.open(url, "_blank");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const selectClass =
    "px-2 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Audit Logs</h2>
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleFilter()}
              placeholder="Search actions, entities..."
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Action</label>
          <select
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            className={selectClass}
          >
            <option value="">All Actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Entity Type</label>
          <select
            value={filters.entityType}
            onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
            className={selectClass}
          >
            <option value="">All Types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">From</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            className={selectClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            className={selectClass}
          />
        </div>

        <Button size="sm" onClick={handleFilter}>
          <Search className="w-4 h-4 mr-1" />
          Filter
        </Button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : (
        <>
          <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Timestamp</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Actor</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Action</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Entity Type</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">Entity ID</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-400">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div>
                        <span className="text-gray-900 dark:text-gray-100">{log.actorName || "Unknown"}</span>
                        {log.actorEmail && (
                          <span className="text-xs text-gray-400 ml-1">({log.actorEmail})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 capitalize">
                      {log.entityType}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 font-mono text-xs">
                      {log.entityId ? log.entityId.slice(0, 8) + "..." : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">
                      {log.ip || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-400">
                <FileText className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                No audit logs found
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            Logs retained for 180+ days. Data shown reflects all state-changing API activity.
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Admin Page ───
export default function AdminPage() {
  const { user, organization } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("organization");

  // Access check: only admins can see admin console
  if (!user || user.role === "member") {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col items-center justify-center">
          <ShieldAlert className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Admin access required</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            You need admin privileges to access this page.
          </p>
        </div>
      </AppShell>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Shield }[] = [
    { id: "organization", label: "Organization", icon: Building2 },
    { id: "members", label: "Members", icon: Users },
    { id: "departments", label: "Departments", icon: Building2 },
    { id: "roles", label: "Roles", icon: KeyRound },
    { id: "security", label: "Security", icon: Lock },
    { id: "sso", label: "SSO / SAML", icon: Shield },
    { id: "audit", label: "Audit Logs", icon: FileText },
  ];

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Admin Console</h2>
        </div>
      </div>
      <div className="p-2 space-y-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
                activeTab === tab.id
                  ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar}>
      <div className="flex-1 flex flex-col overflow-auto">
        {activeTab === "organization" && organization && (
          <OrganizationTab orgId={organization.id} />
        )}
        {activeTab === "members" && organization && (
          <MembersTab orgId={organization.id} currentUserId={user.id} />
        )}
        {activeTab === "departments" && organization && (
          <DepartmentsTab orgId={organization.id} />
        )}
        {activeTab === "roles" && <RolesTab />}
        {activeTab === "security" && organization && (
          <SecurityTab orgId={organization.id} />
        )}
        {activeTab === "sso" && organization && (
          <SsoTab orgId={organization.id} />
        )}
        {activeTab === "audit" && organization && (
          <AuditLogsTab orgId={organization.id} />
        )}
      </div>
    </AppShell>
  );
}

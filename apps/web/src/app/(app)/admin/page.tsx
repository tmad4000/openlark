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
  type DepartmentTree,
  type InvitationInfo,
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
} from "lucide-react";
import { cn } from "@/lib/utils";

type AdminTab = "organization" | "members" | "departments" | "roles";

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
      </div>
    </AppShell>
  );
}

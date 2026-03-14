"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  api,
  type LeaveType,
  type LeaveBalance,
  type LeaveRequestItem,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Settings,
  Palmtree,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function LeavePage() {
  const { user } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"my" | "admin">("my");

  // Request form
  const [showForm, setShowForm] = useState(false);
  const [formLeaveTypeId, setFormLeaveTypeId] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formDays, setFormDays] = useState(1);
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin: leave type config
  const [showConfig, setShowConfig] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeIsPaid, setNewTypeIsPaid] = useState(true);
  const [newTypeDays, setNewTypeDays] = useState(15);
  const [creatingType, setCreatingType] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [typesRes, balancesRes, requestsRes] = await Promise.all([
        api.getLeaveTypes(),
        api.getLeaveBalances(),
        api.getLeaveRequests(),
      ]);
      setLeaveTypes(typesRes.leaveTypes);
      setBalances(balancesRes.balances);
      setRequests(requestsRes.requests);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-calculate days when dates change
  useEffect(() => {
    if (formStartDate && formEndDate) {
      const start = new Date(formStartDate);
      const end = new Date(formEndDate);
      if (end >= start) {
        let count = 0;
        const cur = new Date(start);
        while (cur <= end) {
          const day = cur.getDay();
          if (day !== 0 && day !== 6) count++;
          cur.setDate(cur.getDate() + 1);
        }
        setFormDays(Math.max(1, count));
      }
    }
  }, [formStartDate, formEndDate]);

  const handleSubmitRequest = async () => {
    if (!formLeaveTypeId || !formStartDate || !formEndDate) {
      setFormError("Please fill all required fields");
      return;
    }
    try {
      setSubmitting(true);
      setFormError(null);
      await api.submitLeaveRequest({
        leaveTypeId: formLeaveTypeId,
        startDate: new Date(formStartDate).toISOString(),
        endDate: new Date(formEndDate).toISOString(),
        days: formDays,
        reason: formReason || undefined,
      });
      setShowForm(false);
      setFormLeaveTypeId("");
      setFormStartDate("");
      setFormEndDate("");
      setFormDays(1);
      setFormReason("");
      await loadData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to submit";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return;
    try {
      setCreatingType(true);
      await api.createLeaveType({
        name: newTypeName.trim(),
        isPaid: newTypeIsPaid,
        defaultDaysPerYear: newTypeDays,
      });
      setNewTypeName("");
      setNewTypeDays(15);
      setNewTypeIsPaid(true);
      await loadData();
    } catch {
      // ignore
    } finally {
      setCreatingType(false);
    }
  };

  const handleReview = async (id: string, decision: "approved" | "rejected") => {
    try {
      await api.reviewLeaveRequest(id, decision);
      await loadData();
    } catch {
      // ignore
    }
  };

  // Org leave requests for admin tab
  const [orgRequests, setOrgRequests] = useState<LeaveRequestItem[]>([]);
  useEffect(() => {
    if (tab === "admin") {
      api.getOrgLeaveRequests({ status: "pending" }).then((r) => {
        setOrgRequests(r.requests);
      }).catch(() => {});
    }
  }, [tab]);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <Palmtree className="w-5 h-5 text-green-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Leave
          </h2>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="p-4 flex-1 overflow-y-auto space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
          Balances ({new Date().getFullYear()})
        </h3>
        {balances.length === 0 && !loading ? (
          <p className="text-xs text-gray-400">No leave types configured</p>
        ) : (
          balances.map((b) => {
            const total = Number(b.totalDays);
            const used = Number(b.usedDays);
            const remaining = total - used;
            const pct = total > 0 ? (used / total) * 100 : 0;
            return (
              <div
                key={b.id}
                className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                    {b.leaveTypeName}
                  </span>
                  {b.isPaid && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Paid
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mb-1.5">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {remaining}
                  </span>
                  <span className="text-xs text-gray-400">/ {total} days remaining</span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500"
                    )}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {used} used of {total}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar}>
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Leave Management
            </h1>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setTab("my")}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  tab === "my"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                My Leaves
              </button>
              <button
                onClick={() => setTab("admin")}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  tab === "admin"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                Admin
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfig(!showConfig)}
            >
              <Settings className="w-4 h-4 mr-1" />
              Configure
            </Button>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="w-4 h-4 mr-1" />
              Request Leave
            </Button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Leave Type Configuration (admin) */}
          {showConfig && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Configure Leave Types
              </h2>
              {/* Existing types */}
              <div className="space-y-2 mb-4">
                {leaveTypes.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {t.name}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {t.defaultDaysPerYear} days/yr
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        t.isPaid
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      )}
                    >
                      {t.isPaid ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                ))}
              </div>
              {/* Add new type */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="e.g. Annual Leave"
                    className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Days/yr</label>
                  <input
                    type="number"
                    value={newTypeDays}
                    onChange={(e) => setNewTypeDays(Number(e.target.value))}
                    className="w-20 px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={newTypeIsPaid}
                    onChange={(e) => setNewTypeIsPaid(e.target.checked)}
                    className="rounded"
                  />
                  Paid
                </label>
                <Button
                  size="sm"
                  onClick={handleCreateType}
                  disabled={creatingType || !newTypeName.trim()}
                >
                  {creatingType ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Leave Request Form */}
          {showForm && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-200 dark:border-blue-900/50 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                New Leave Request
              </h2>
              {formError && (
                <div className="mb-3 p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Leave Type *
                  </label>
                  <select
                    value={formLeaveTypeId}
                    onChange={(e) => setFormLeaveTypeId(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Select type...</option>
                    {leaveTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Days
                  </label>
                  <input
                    type="number"
                    value={formDays}
                    onChange={(e) => setFormDays(Number(e.target.value))}
                    min={0.5}
                    step={0.5}
                    className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">
                    Reason
                  </label>
                  <textarea
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    rows={2}
                    placeholder="Optional reason..."
                    className="w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitRequest}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : null}
                  Submit Request
                </Button>
              </div>
            </div>
          )}

          {/* My Leaves Tab */}
          {tab === "my" && (
            <>
              {/* Balance overview cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {balances.map((b) => {
                  const total = Number(b.totalDays);
                  const used = Number(b.usedDays);
                  const remaining = total - used;
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl border p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                    >
                      <p className="text-xs text-gray-500 mb-1">
                        {b.leaveTypeName}
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {remaining}
                        <span className="text-sm font-normal text-gray-400">
                          /{total}
                        </span>
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {used} used
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Leave calendar preview - shows approved leave days */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Approved Leave Days
                </h2>
                <div className="flex flex-wrap gap-2">
                  {requests
                    .filter((r) => r.status === "approved")
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                      >
                        <Calendar className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-xs text-green-800 dark:text-green-300">
                          {r.leaveTypeName}: {formatDate(r.startDate)} — {formatDate(r.endDate)} ({r.days}d)
                        </span>
                      </div>
                    ))}
                  {requests.filter((r) => r.status === "approved").length === 0 && (
                    <p className="text-xs text-gray-400">No approved leave days</p>
                  )}
                </div>
              </div>

              {/* Request list */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    My Requests
                  </h2>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  </div>
                ) : requests.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">
                    No leave requests yet
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {requests.map((r) => (
                      <div
                        key={r.id}
                        className="px-4 py-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center",
                              r.status === "approved"
                                ? "bg-green-100 dark:bg-green-900/30"
                                : r.status === "rejected"
                                  ? "bg-red-100 dark:bg-red-900/30"
                                  : "bg-yellow-100 dark:bg-yellow-900/30"
                            )}
                          >
                            {r.status === "approved" ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : r.status === "rejected" ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {r.leaveTypeName}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatDate(r.startDate)} — {formatDate(r.endDate)} ({r.days} days)
                            </p>
                            {r.reason && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate">
                                {r.reason}
                              </p>
                            )}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-medium capitalize",
                            STATUS_COLORS[r.status] ?? STATUS_COLORS.cancelled
                          )}
                        >
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Admin Tab */}
          {tab === "admin" && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Pending Requests (Org)
                </h2>
              </div>
              {orgRequests.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">
                  No pending requests
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {orgRequests.map((r) => (
                    <div
                      key={r.id}
                      className="px-4 py-3 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {r.leaveTypeName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(r.startDate)} — {formatDate(r.endDate)} ({r.days} days)
                        </p>
                        {r.reason && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
                            {r.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReview(r.id, "rejected")}
                          className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleReview(r.id, "approved")}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Approve
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  Plus,
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Palmtree,
  Settings,
  Trash2,
} from "lucide-react";

// --- Types ---

interface LeaveType {
  id: string;
  orgId: string;
  name: string;
  paid: boolean;
  defaultDays: string;
  createdAt: string;
}

interface LeaveBalance {
  id: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  totalDays: string;
  usedDays: string;
  remaining: string;
  leaveTypeName: string;
  paid: boolean;
}

interface LeaveRequest {
  id: string;
  orgId: string;
  userId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewerId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  leaveTypeName: string | null;
}

interface LeaveDay {
  date: string;
  leaveType: string | null;
  userName: string | null;
  userId: string;
}

type ViewMode = "requests" | "calendar" | "admin";

// --- Helpers ---

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: typeof CheckCircle }
> = {
  pending: {
    label: "Pending",
    color: "text-amber-700",
    bg: "bg-amber-100",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "text-green-700",
    bg: "bg-green-100",
    icon: CheckCircle,
  },
  rejected: {
    label: "Rejected",
    color: "text-red-700",
    bg: "bg-red-100",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-700",
    bg: "bg-gray-100",
    icon: XCircle,
  },
};

// --- Component ---

export default function LeavePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("requests");
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
  const [loading, setLoading] = useState(false);

  // Request form state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [formLeaveTypeId, setFormLeaveTypeId] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin form state
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminPaid, setAdminPaid] = useState(true);
  const [adminDefaultDays, setAdminDefaultDays] = useState("10");
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  // Calendar state
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const monthStr = formatMonth(calYear, calMonth);

  const getToken = () => getCookie("session_token");

  // Fetch leave types
  const fetchLeaveTypes = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/leave/types", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeaveTypes(data.leaveTypes || []);
      }
    } catch (err) {
      console.error("Failed to fetch leave types:", err);
    }
  }, []);

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/leave/balances", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBalances(data.balances || []);
      }
    } catch (err) {
      console.error("Failed to fetch balances:", err);
    }
  }, []);

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/leave/requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Failed to fetch requests:", err);
    }
  }, []);

  // Fetch calendar leave days
  const fetchCalendar = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/leave/calendar?month=${monthStr}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeaveDays(data.leaveDays || []);
      }
    } catch (err) {
      console.error("Failed to fetch calendar:", err);
    }
  }, [monthStr]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchLeaveTypes(), fetchBalances(), fetchRequests()]).finally(
      () => setLoading(false)
    );
  }, [fetchLeaveTypes, fetchBalances, fetchRequests]);

  // Calendar data
  useEffect(() => {
    if (viewMode === "calendar") {
      fetchCalendar();
    }
  }, [viewMode, fetchCalendar]);

  // Submit leave request
  const handleSubmitRequest = async () => {
    const token = getToken();
    if (!token) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch("/api/leave/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leave_type_id: formLeaveTypeId,
          start_date: formStartDate,
          end_date: formEndDate,
          reason: formReason || undefined,
        }),
      });

      if (res.ok) {
        setShowRequestForm(false);
        setFormLeaveTypeId("");
        setFormStartDate("");
        setFormEndDate("");
        setFormReason("");
        fetchRequests();
        fetchBalances();
      } else {
        const data = await res.json();
        setFormError(data.error || "Failed to submit leave request");
      }
    } catch (err) {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel leave request
  const handleCancel = async (id: string) => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`/api/leave/requests/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchRequests();
        fetchBalances();
      }
    } catch (err) {
      console.error("Failed to cancel request:", err);
    }
  };

  // Create leave type (admin)
  const handleCreateLeaveType = async () => {
    const token = getToken();
    if (!token) return;
    setAdminSubmitting(true);

    try {
      const res = await fetch("/api/leave/types", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: adminName,
          paid: adminPaid,
          default_days: parseFloat(adminDefaultDays) || 0,
        }),
      });

      if (res.ok) {
        setShowAdminForm(false);
        setAdminName("");
        setAdminPaid(true);
        setAdminDefaultDays("10");
        fetchLeaveTypes();
        fetchBalances();
      }
    } catch (err) {
      console.error("Failed to create leave type:", err);
    } finally {
      setAdminSubmitting(false);
    }
  };

  // Delete leave type
  const handleDeleteLeaveType = async (id: string) => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`/api/leave/types/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchLeaveTypes();
      fetchBalances();
    } catch (err) {
      console.error("Failed to delete leave type:", err);
    }
  };

  // Calendar navigation
  const prevMonth = () => {
    if (calMonth === 0) {
      setCalYear(calYear - 1);
      setCalMonth(11);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalYear(calYear + 1);
      setCalMonth(0);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  const goToToday = () => {
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
  };

  // Build calendar leave day map
  const leaveDayMap = new Map<string, LeaveDay[]>();
  for (const ld of leaveDays) {
    if (!leaveDayMap.has(ld.date)) leaveDayMap.set(ld.date, []);
    leaveDayMap.get(ld.date)!.push(ld);
  }

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" }
  );

  // Calculate days for form preview
  let previewDays = 0;
  if (formStartDate && formEndDate && new Date(formStartDate) <= new Date(formEndDate)) {
    const start = new Date(formStartDate);
    const end = new Date(formEndDate);
    const current = new Date(start);
    while (current <= end) {
      if (current.getDay() !== 0 && current.getDay() !== 6) previewDays++;
      current.setDate(current.getDate() + 1);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
            <p className="text-sm text-gray-500 mt-1">
              Request leave and track your balance
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("requests")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "requests"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <Palmtree className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Requests
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "calendar"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <Calendar className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Calendar
            </button>
            <button
              onClick={() => setViewMode("admin")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "admin"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <Settings className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Admin
            </button>
          </div>
        </div>

        {/* Leave Balances */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {balances.map((balance) => {
            const remaining = parseFloat(balance.remaining);
            const total = parseFloat(balance.totalDays);
            const used = parseFloat(balance.usedDays);
            const pct = total > 0 ? (used / total) * 100 : 0;

            return (
              <div
                key={balance.id}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {balance.leaveTypeName}
                  </span>
                  {balance.paid ? (
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                      Paid
                    </span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      Unpaid
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {remaining}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {used} used of {total} days
                </div>
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
          {balances.length === 0 && !loading && (
            <div className="col-span-full text-center py-8 text-gray-500 bg-white rounded-xl border border-gray-200">
              No leave types configured. Ask an admin to set up leave types.
            </div>
          )}
        </div>

        {/* Requests View */}
        {viewMode === "requests" && (
          <div className="space-y-4">
            {/* New Request Button */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowRequestForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Leave Request
              </button>
            </div>

            {/* Request Form Dialog */}
            {showRequestForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Request Leave
                    </h2>
                    <button
                      onClick={() => {
                        setShowRequestForm(false);
                        setFormError(null);
                      }}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Leave Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Leave Type
                      </label>
                      <select
                        value={formLeaveTypeId}
                        onChange={(e) => setFormLeaveTypeId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select leave type...</option>
                        {leaveTypes.map((lt) => (
                          <option key={lt.id} value={lt.id}>
                            {lt.name} {lt.paid ? "(Paid)" : "(Unpaid)"}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Start Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* End Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Days Preview */}
                    {previewDays > 0 && (
                      <div className="text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                        {previewDays} working day{previewDays > 1 ? "s" : ""} requested
                      </div>
                    )}

                    {/* Reason */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reason
                      </label>
                      <textarea
                        value={formReason}
                        onChange={(e) => setFormReason(e.target.value)}
                        placeholder="Optional reason for leave..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      />
                    </div>

                    {/* Error */}
                    {formError && (
                      <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {formError}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => {
                        setShowRequestForm(false);
                        setFormError(null);
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitRequest}
                      disabled={
                        submitting ||
                        !formLeaveTypeId ||
                        !formStartDate ||
                        !formEndDate
                      }
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Requests List */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  My Leave Requests
                </h2>
              </div>
              {loading ? (
                <div className="text-center text-gray-500 py-8">Loading...</div>
              ) : requests.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No leave requests yet. Click "New Leave Request" to get started.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {requests.map((request) => {
                    const config = STATUS_CONFIG[request.status];
                    const StatusIcon = config?.icon || Clock;
                    const startDate = new Date(
                      request.startDate + "T00:00:00"
                    );
                    const endDate = new Date(request.endDate + "T00:00:00");

                    return (
                      <div
                        key={request.id}
                        className="p-4 flex items-center justify-between hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${config?.bg || "bg-gray-100"}`}
                          >
                            <StatusIcon
                              className={`w-5 h-5 ${config?.color || "text-gray-600"}`}
                            />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {request.leaveTypeName || "Leave"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {startDate.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                              {request.startDate !== request.endDate && (
                                <>
                                  {" - "}
                                  {endDate.toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </>
                              )}
                            </div>
                            {request.reason && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {request.reason}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full ${config?.bg || "bg-gray-100"} ${config?.color || "text-gray-600"}`}
                          >
                            {config?.label || request.status}
                          </span>
                          {request.status === "pending" && (
                            <button
                              onClick={() => handleCancel(request.id)}
                              className="text-xs text-red-600 hover:text-red-700 font-medium"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Calendar View */}
        {viewMode === "calendar" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={prevMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {monthName}
                </h2>
                <button
                  onClick={goToToday}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded border border-blue-200 hover:bg-blue-50"
                >
                  Today
                </button>
              </div>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-gray-500 py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells */}
              {[...Array(firstDay)].map((_, i) => (
                <div key={`empty-${i}`} className="h-20" />
              ))}

              {/* Day cells */}
              {[...Array(daysInMonth)].map((_, i) => {
                const day = i + 1;
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayLeaves = leaveDayMap.get(dateStr) || [];
                const date = new Date(calYear, calMonth, day);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isToday =
                  calYear === today.getFullYear() &&
                  calMonth === today.getMonth() &&
                  day === today.getDate();

                return (
                  <div
                    key={day}
                    className={`h-20 rounded-lg p-1.5 flex flex-col ${
                      isWeekend
                        ? "bg-gray-50"
                        : dayLeaves.length > 0
                        ? "bg-blue-50"
                        : "bg-white"
                    } ${isToday ? "ring-2 ring-blue-500" : "border border-gray-100"}`}
                  >
                    <span
                      className={`text-xs font-medium ${
                        isWeekend ? "text-gray-400" : "text-gray-700"
                      }`}
                    >
                      {day}
                    </span>
                    {dayLeaves.length > 0 && (
                      <div className="flex-1 overflow-hidden mt-0.5">
                        {dayLeaves.slice(0, 2).map((ld, idx) => (
                          <div
                            key={idx}
                            className="text-[10px] text-blue-700 bg-blue-100 rounded px-1 py-0.5 truncate mb-0.5"
                          >
                            {ld.userName || "User"} - {ld.leaveType || "Leave"}
                          </div>
                        ))}
                        {dayLeaves.length > 2 && (
                          <div className="text-[10px] text-gray-500">
                            +{dayLeaves.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin View */}
        {viewMode === "admin" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Leave Types Configuration
              </h2>
              <button
                onClick={() => setShowAdminForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Leave Type
              </button>
            </div>

            {/* Admin Form Dialog */}
            {showAdminForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Add Leave Type
                    </h2>
                    <button
                      onClick={() => setShowAdminForm(false)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        placeholder="e.g. Annual Leave"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-gray-700">
                        Paid Leave
                      </label>
                      <button
                        onClick={() => setAdminPaid(!adminPaid)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          adminPaid ? "bg-blue-600" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            adminPaid ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Default Days Per Year
                      </label>
                      <input
                        type="number"
                        value={adminDefaultDays}
                        onChange={(e) => setAdminDefaultDays(e.target.value)}
                        min="0"
                        step="0.5"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={() => setShowAdminForm(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateLeaveType}
                      disabled={adminSubmitting || !adminName.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {adminSubmitting ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Leave Types List */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              {leaveTypes.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No leave types configured yet. Click "Add Leave Type" to get
                  started.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {leaveTypes.map((lt) => (
                    <div
                      key={lt.id}
                      className="p-4 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <Palmtree className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {lt.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {lt.paid ? "Paid" : "Unpaid"} &middot;{" "}
                            {parseFloat(lt.defaultDays)} days/year
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteLeaveType(lt.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

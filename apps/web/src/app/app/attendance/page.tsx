"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Calendar,
  BarChart3,
  CheckCircle,
  AlertCircle,
  XCircle,
} from "lucide-react";

// --- Types ---

interface ClockRecord {
  id: string;
  userId: string;
  orgId: string;
  type: "clock_in" | "clock_out";
  method: string;
  clockedAt: string;
  latitude: string | null;
  longitude: string | null;
  locationVerified: boolean;
  note: string | null;
}

interface AttendanceStats {
  month: string;
  days_present: number;
  days_late: number;
  days_absent: number;
  days_leave: number;
  overtime_hours: number;
  total_working_days: number;
}

type ViewMode = "dashboard" | "calendar";

// Day status for the calendar
type DayStatus = "present" | "absent" | "late" | "leave" | "weekend" | "future" | null;

// --- Helpers ---

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
  { label: string; color: string; bg: string; dotColor: string }
> = {
  present: {
    label: "Present",
    color: "text-green-700",
    bg: "bg-green-100",
    dotColor: "bg-green-500",
  },
  absent: {
    label: "Absent",
    color: "text-red-700",
    bg: "bg-red-100",
    dotColor: "bg-red-500",
  },
  late: {
    label: "Late",
    color: "text-amber-700",
    bg: "bg-amber-100",
    dotColor: "bg-amber-500",
  },
  leave: {
    label: "Leave",
    color: "text-blue-700",
    bg: "bg-blue-100",
    dotColor: "bg-blue-500",
  },
};

// --- Component ---

export default function AttendancePage() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [records, setRecords] = useState<ClockRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [clocking, setClocking] = useState(false);
  const [lastAction, setLastAction] = useState<"clock_in" | "clock_out" | null>(null);
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [clockMessage, setClockMessage] = useState<string | null>(null);

  // Calendar month navigation
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const monthStr = formatMonth(calYear, calMonth);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Request GPS position
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Auto-request GPS on mount
  useEffect(() => {
    requestGps();
  }, [requestGps]);

  // Fetch records and stats
  const fetchData = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;
    setLoading(true);
    try {
      const [recordsRes, statsRes] = await Promise.all([
        fetch(`/api/attendance/my-records?month=${monthStr}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/attendance/stats?month=${monthStr}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (recordsRes.ok) {
        const data = await recordsRes.json();
        setRecords(data.records || []);
        // Determine last action from today's records
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayRecords = (data.records || [])
          .filter((r: ClockRecord) => r.clockedAt.slice(0, 10) === todayStr)
          .sort(
            (a: ClockRecord, b: ClockRecord) =>
              new Date(b.clockedAt).getTime() - new Date(a.clockedAt).getTime()
          );
        if (todayRecords.length > 0) {
          setLastAction(todayRecords[0].type);
        }
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch attendance data:", err);
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Clock in/out
  const handleClock = useCallback(
    async (type: "clock_in" | "clock_out") => {
      const token = getCookie("session_token");
      if (!token) return;
      setClocking(true);
      setClockMessage(null);
      try {
        const body: Record<string, unknown> = {
          type,
          method: gpsPosition ? "gps" : "manual",
        };
        if (gpsPosition) {
          body.location = {
            latitude: gpsPosition.lat,
            longitude: gpsPosition.lng,
          };
        }
        const res = await fetch("/api/attendance/clock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setLastAction(type);
          setClockMessage(
            type === "clock_in"
              ? "Clocked in successfully!"
              : "Clocked out successfully!"
          );
          fetchData();
        } else {
          const err = await res.json();
          setClockMessage(err.error || "Failed to clock");
        }
      } catch (err) {
        setClockMessage("Network error. Please try again.");
      } finally {
        setClocking(false);
      }
    },
    [gpsPosition, fetchData]
  );

  // Build calendar day statuses
  const getDayStatuses = useCallback((): Map<number, DayStatus> => {
    const map = new Map<number, DayStatus>();
    const daysInMonth = getDaysInMonth(calYear, calMonth);
    const todayDate = new Date();
    const isCurrentMonth =
      calYear === todayDate.getFullYear() && calMonth === todayDate.getMonth();

    // Group clock-in records by day
    const clockInsByDay = new Map<number, ClockRecord[]>();
    for (const r of records) {
      if (r.type === "clock_in") {
        const d = new Date(r.clockedAt);
        const day = d.getDate();
        if (!clockInsByDay.has(day)) clockInsByDay.set(day, []);
        clockInsByDay.get(day)!.push(r);
      }
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(calYear, calMonth, day);
      const dayOfWeek = date.getDay();

      // Weekend
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        map.set(day, "weekend");
        continue;
      }

      // Future days
      if (date > todayDate && (isCurrentMonth || calYear > todayDate.getFullYear() || (calYear === todayDate.getFullYear() && calMonth > todayDate.getMonth()))) {
        map.set(day, "future");
        continue;
      }

      const dayClockIns = clockInsByDay.get(day);
      if (dayClockIns && dayClockIns.length > 0) {
        // Check if late (clock-in after 9:00 AM)
        const earliest = dayClockIns.reduce((e, r) => {
          const t = new Date(r.clockedAt);
          return t < e ? t : e;
        }, new Date(dayClockIns[0].clockedAt));
        if (earliest.getHours() >= 9 && earliest.getMinutes() > 0) {
          map.set(day, "late");
        } else {
          map.set(day, "present");
        }
      } else {
        // Check if it's a leave day (we don't have leave data at the day level, use stats)
        // For simplicity, mark as absent. Stats will show leave count.
        map.set(day, "absent");
      }
    }

    return map;
  }, [records, calYear, calMonth]);

  const dayStatuses = getDayStatuses();

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

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);
  const monthName = new Date(calYear, calMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Is clocked in right now?
  const isClockedIn = lastAction === "clock_in";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
            <p className="text-sm text-gray-500 mt-1">
              Track your work hours and attendance records
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("dashboard")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "dashboard"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              <BarChart3 className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
              Dashboard
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
          </div>
        </div>

        {/* Clock Widget */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Current Time + Clock Buttons */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-6 h-6 text-blue-600" />
                <div>
                  <div className="text-3xl font-mono font-bold text-gray-900">
                    {formatTime(currentTime)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {currentTime.toLocaleDateString(undefined, {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleClock("clock_in")}
                  disabled={clocking || isClockedIn}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-colors ${
                    isClockedIn
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  {clocking ? "Clocking..." : "Clock In"}
                </button>
                <button
                  onClick={() => handleClock("clock_out")}
                  disabled={clocking || !isClockedIn}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-sm transition-colors ${
                    !isClockedIn
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-red-600 text-white hover:bg-red-700"
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                  {clocking ? "Clocking..." : "Clock Out"}
                </button>
              </div>

              {clockMessage && (
                <div
                  className={`mt-3 text-sm flex items-center gap-1.5 ${
                    clockMessage.includes("successfully")
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {clockMessage.includes("successfully") ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  {clockMessage}
                </div>
              )}

              {lastAction && (
                <div className="mt-2 text-xs text-gray-500">
                  Status:{" "}
                  <span
                    className={
                      isClockedIn ? "text-green-600 font-medium" : "text-gray-600 font-medium"
                    }
                  >
                    {isClockedIn ? "Clocked In" : "Clocked Out"}
                  </span>
                </div>
              )}
            </div>

            {/* GPS Location */}
            <div className="flex-1 max-w-sm">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">
                    GPS Verification
                  </span>
                </div>

                {gpsLoading ? (
                  <div className="text-sm text-gray-500">
                    Acquiring GPS position...
                  </div>
                ) : gpsError ? (
                  <div className="space-y-2">
                    <div className="text-sm text-red-600 flex items-center gap-1">
                      <XCircle className="w-4 h-4" />
                      {gpsError}
                    </div>
                    <button
                      onClick={requestGps}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Retry
                    </button>
                  </div>
                ) : gpsPosition ? (
                  <div className="space-y-2">
                    {/* Map placeholder showing coordinates and allowed radius */}
                    <div className="w-full h-32 bg-blue-50 rounded-lg border border-blue-200 flex flex-col items-center justify-center relative overflow-hidden">
                      {/* Simulated map background */}
                      <div className="absolute inset-0 opacity-10">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-200 to-green-100" />
                        {/* Grid lines */}
                        {[...Array(6)].map((_, i) => (
                          <div
                            key={`h-${i}`}
                            className="absolute w-full border-t border-gray-400"
                            style={{ top: `${(i + 1) * 16.6}%` }}
                          />
                        ))}
                        {[...Array(8)].map((_, i) => (
                          <div
                            key={`v-${i}`}
                            className="absolute h-full border-l border-gray-400"
                            style={{ left: `${(i + 1) * 12.5}%` }}
                          />
                        ))}
                      </div>
                      {/* Allowed radius circle */}
                      <div className="w-20 h-20 rounded-full border-2 border-blue-400 bg-blue-200/30 flex items-center justify-center z-10">
                        <div className="w-3 h-3 bg-blue-600 rounded-full" />
                      </div>
                      <div className="text-xs text-blue-600 font-medium mt-1 z-10">
                        Your Location
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Lat: {gpsPosition.lat.toFixed(6)}</span>
                      <span>Lng: {gpsPosition.lng.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      Location acquired
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    Location not available. Clock-in will use manual method.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Summary */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-green-600">
                {stats.days_present}
              </div>
              <div className="text-sm text-gray-500 mt-1">Days Present</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-amber-600">
                {stats.days_late}
              </div>
              <div className="text-sm text-gray-500 mt-1">Late Count</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-red-600">
                {stats.days_absent}
              </div>
              <div className="text-sm text-gray-500 mt-1">Days Absent</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">
                {stats.days_leave}
              </div>
              <div className="text-sm text-gray-500 mt-1">Leave Used</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-purple-600">
                {stats.overtime_hours}
              </div>
              <div className="text-sm text-gray-500 mt-1">Overtime Hours</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="text-2xl font-bold text-gray-700">
                {stats.total_working_days}
              </div>
              <div className="text-sm text-gray-500 mt-1">Working Days</div>
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
                <h2 className="text-lg font-semibold text-gray-900">{monthName}</h2>
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

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mb-4">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <div className={`w-3 h-3 rounded-full ${config.dotColor}`} />
                  <span className="text-gray-600">{config.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-gray-600">Weekend</span>
              </div>
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
              {/* Empty cells for days before start of month */}
              {[...Array(firstDay)].map((_, i) => (
                <div key={`empty-${i}`} className="h-16" />
              ))}

              {/* Day cells */}
              {[...Array(daysInMonth)].map((_, i) => {
                const day = i + 1;
                const status = dayStatuses.get(day);
                const isToday =
                  calYear === today.getFullYear() &&
                  calMonth === today.getMonth() &&
                  day === today.getDate();

                let bgClass = "";
                let textClass = "text-gray-900";

                if (status === "present") {
                  bgClass = "bg-green-100";
                  textClass = "text-green-800";
                } else if (status === "absent") {
                  bgClass = "bg-red-100";
                  textClass = "text-red-800";
                } else if (status === "late") {
                  bgClass = "bg-amber-100";
                  textClass = "text-amber-800";
                } else if (status === "leave") {
                  bgClass = "bg-blue-100";
                  textClass = "text-blue-800";
                } else if (status === "weekend") {
                  bgClass = "bg-gray-50";
                  textClass = "text-gray-400";
                } else if (status === "future") {
                  textClass = "text-gray-300";
                }

                return (
                  <div
                    key={day}
                    className={`h-16 rounded-lg flex flex-col items-center justify-center relative ${bgClass} ${
                      isToday ? "ring-2 ring-blue-500" : ""
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${textClass}`}
                    >
                      {day}
                    </span>
                    {status && status !== "weekend" && status !== "future" && (
                      <span
                        className={`text-[10px] mt-0.5 font-medium ${
                          STATUS_CONFIG[status]?.color || ""
                        }`}
                      >
                        {STATUS_CONFIG[status]?.label || ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dashboard: Recent Records */}
        {viewMode === "dashboard" && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Recent Clock Records
            </h2>
            {loading ? (
              <div className="text-center text-gray-500 py-8">Loading...</div>
            ) : records.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No attendance records for this month
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {records.slice(0, 20).map((record) => {
                  const recordDate = new Date(record.clockedAt);
                  return (
                    <div
                      key={record.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            record.type === "clock_in"
                              ? "bg-green-100 text-green-600"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {record.type === "clock_in" ? (
                            <LogIn className="w-4 h-4" />
                          ) : (
                            <LogOut className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {record.type === "clock_in"
                              ? "Clock In"
                              : "Clock Out"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {recordDate.toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono text-gray-900">
                          {recordDate.toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <div className="text-xs text-gray-500 capitalize">
                          {record.method}
                          {record.locationVerified && (
                            <CheckCircle className="w-3 h-3 inline-block ml-1 text-green-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

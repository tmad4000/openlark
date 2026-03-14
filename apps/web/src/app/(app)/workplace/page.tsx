"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { api, type ClockRecord, type AttendanceStats } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Clock,
  MapPin,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  Timer,
  TrendingUp,
  LogIn,
  LogOut,
} from "lucide-react";

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Status colors for calendar cells
type DayStatus = "present" | "absent" | "late" | "leave" | "future" | "weekend" | "none";

function statusColor(status: DayStatus): string {
  switch (status) {
    case "present":
      return "bg-green-500";
    case "absent":
      return "bg-red-500";
    case "late":
      return "bg-yellow-500";
    case "leave":
      return "bg-blue-500";
    default:
      return "bg-gray-200 dark:bg-gray-700";
  }
}

function statusLabel(status: DayStatus): string {
  switch (status) {
    case "present":
      return "Present";
    case "absent":
      return "Absent";
    case "late":
      return "Late";
    case "leave":
      return "Leave";
    default:
      return "";
  }
}

// Default allowed office location (demo)
const OFFICE_LOCATION = { lat: 39.9042, lng: 116.4074 }; // Beijing
const ALLOWED_RADIUS_KM = 0.5;

export default function WorkplacePage() {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [records, setRecords] = useState<ClockRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockingIn, setClockingIn] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Try to get user location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          setLocationError("Location access denied");
        }
      );
    } else {
      setLocationError("Geolocation not supported");
    }
  }, []);

  const monthStr = useMemo(() => formatMonth(viewMonth), [viewMonth]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [recordsRes, statsRes] = await Promise.all([
        api.getMyAttendanceRecords(monthStr),
        api.getAttendanceStats(monthStr),
      ]);
      setRecords(recordsRes.records);
      setStats(statsRes.stats);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Determine if user is currently clocked in
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter(
    (r) => r.clockTime.slice(0, 10) === todayStr
  );
  const lastRecord = todayRecords[todayRecords.length - 1];
  const isClockedIn = lastRecord?.type === "clock_in";

  const handleClock = async () => {
    try {
      setClockingIn(true);
      const type = isClockedIn ? "clock_out" : "clock_in";
      await api.clockInOut({
        type,
        method: userLocation ? "gps" : "manual",
        location: userLocation
          ? { latitude: userLocation.lat, longitude: userLocation.lng }
          : undefined,
      });
      await loadData();
    } catch {
      // ignore
    } finally {
      setClockingIn(false);
    }
  };

  // Build calendar day statuses
  const dayStatuses = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const map: Record<number, DayStatus> = {};

    // Group records by day
    const clockInDays = new Set<number>();
    const lateDays = new Set<number>();

    for (const r of records) {
      const d = new Date(r.clockTime);
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        if (r.type === "clock_in") {
          clockInDays.add(day);
          if (r.isLate) {
            lateDays.add(day);
          }
        }
      }
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isFuture =
        date > today &&
        !(
          date.getDate() === today.getDate() &&
          date.getMonth() === today.getMonth() &&
          date.getFullYear() === today.getFullYear()
        );

      if (isWeekend) {
        map[d] = "weekend";
      } else if (isFuture) {
        map[d] = "future";
      } else if (lateDays.has(d)) {
        map[d] = "late";
      } else if (clockInDays.has(d)) {
        map[d] = "present";
      } else {
        // Could be absent or leave — for now mark as absent for past working days
        map[d] = "absent";
      }
    }

    return map;
  }, [records, viewMonth]);

  const prevMonth = () => {
    setViewMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  };

  const nextMonth = () => {
    setViewMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  };

  // Calculate distance from office
  const distanceFromOffice = useMemo(() => {
    if (!userLocation) return null;
    const R = 6371;
    const dLat = ((OFFICE_LOCATION.lat - userLocation.lat) * Math.PI) / 180;
    const dLng = ((OFFICE_LOCATION.lng - userLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((OFFICE_LOCATION.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, [userLocation]);

  const withinRadius =
    distanceFromOffice != null && distanceFromOffice <= ALLOWED_RADIUS_KM;

  // Build calendar grid
  const calendarGrid = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const cells: Array<{ day: number | null; status: DayStatus }> = [];

    // Empty cells before first day
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ day: null, status: "none" });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, status: dayStatuses[d] ?? "none" });
    }

    return cells;
  }, [viewMonth, dayStatuses]);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Workplace
          </h2>
        </div>
      </div>

      {/* Today's Records */}
      <div className="p-4 flex-1 overflow-y-auto">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
          Today&apos;s Records
        </h3>
        {todayRecords.length === 0 ? (
          <p className="text-xs text-gray-400">No records yet</p>
        ) : (
          <div className="space-y-2">
            {todayRecords.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 p-2 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
              >
                {r.type === "clock_in" ? (
                  <LogIn className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <LogOut className="w-3.5 h-3.5 text-orange-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
                    {r.type === "clock_in" ? "Clock In" : "Clock Out"}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {formatTime(r.clockTime)} via {r.method}
                  </p>
                </div>
                {r.isLate && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    Late
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
          Legend
        </h3>
        <div className="space-y-1.5">
          {(
            [
              ["present", "Present"],
              ["late", "Late"],
              ["absent", "Absent"],
              ["leave", "Leave"],
            ] as const
          ).map(([status, label]) => (
            <div key={status} className="flex items-center gap-2">
              <div
                className={cn("w-3 h-3 rounded-sm", statusColor(status))}
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar}>
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Attendance
          </h1>
          <span className="text-sm text-gray-400">
            {currentTime.toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Clock In/Out Widget */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-100 dark:border-blue-900/50 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                  Current Time
                </p>
                <p className="text-4xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {currentTime.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {isClockedIn ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      Clocked in at {lastRecord ? formatTime(lastRecord.clockTime) : ""}
                    </span>
                  ) : (
                    <span>Not clocked in</span>
                  )}
                </p>
              </div>

              <Button
                onClick={handleClock}
                disabled={clockingIn}
                size="lg"
                className={cn(
                  "h-16 px-8 text-base font-semibold rounded-xl shadow-lg",
                  isClockedIn
                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
              >
                {clockingIn ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : isClockedIn ? (
                  <LogOut className="w-5 h-5 mr-2" />
                ) : (
                  <LogIn className="w-5 h-5 mr-2" />
                )}
                {isClockedIn ? "Clock Out" : "Clock In"}
              </Button>
            </div>

            {/* GPS Verification */}
            <div className="mt-4 p-3 bg-white/60 dark:bg-gray-900/40 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  GPS Verification
                </span>
                {userLocation && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      withinRadius
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    )}
                  >
                    {withinRadius ? "Within range" : "Out of range"}
                  </span>
                )}
              </div>

              {/* Simple map visualization */}
              <div className="relative w-full h-40 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                {/* Grid lines */}
                <div className="absolute inset-0 opacity-20">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={`h-${i}`}
                      className="absolute w-full border-t border-gray-400"
                      style={{ top: `${(i + 1) * 16.67}%` }}
                    />
                  ))}
                  {[...Array(7)].map((_, i) => (
                    <div
                      key={`v-${i}`}
                      className="absolute h-full border-l border-gray-400"
                      style={{ left: `${(i + 1) * 12.5}%` }}
                    />
                  ))}
                </div>

                {/* Allowed radius circle (center) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-blue-400 bg-blue-100/30 dark:bg-blue-900/20" />

                {/* Office marker (center) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                  <div className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow" />
                  <span className="text-[9px] text-gray-500 mt-0.5 whitespace-nowrap">
                    Office
                  </span>
                </div>

                {/* User location marker */}
                {userLocation ? (
                  <div
                    className="absolute flex flex-col items-center"
                    style={{
                      top: `${50 - (userLocation.lat - OFFICE_LOCATION.lat) * 500}%`,
                      left: `${50 + (userLocation.lng - OFFICE_LOCATION.lng) * 500}%`,
                    }}
                  >
                    <div
                      className={cn(
                        "w-3 h-3 rounded-full border-2 border-white shadow",
                        withinRadius ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <span className="text-[9px] text-gray-500 mt-0.5 whitespace-nowrap">
                      You
                    </span>
                  </div>
                ) : (
                  <div className="absolute bottom-2 left-2 text-[10px] text-gray-400">
                    {locationError ?? "Getting location..."}
                  </div>
                )}

                {/* Radius label */}
                <div className="absolute bottom-2 right-2 text-[10px] text-gray-400">
                  Radius: {ALLOWED_RADIUS_KM * 1000}m
                  {distanceFromOffice != null && (
                    <span className="ml-1">
                      ({(distanceFromOffice * 1000).toFixed(0)}m away)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
              label="Days Present"
              value={stats?.daysPresent ?? 0}
              total={stats?.workingDays ?? 0}
              color="green"
            />
            <StatCard
              icon={<AlertTriangle className="w-5 h-5 text-yellow-500" />}
              label="Late Count"
              value={stats?.daysLate ?? 0}
              color="yellow"
            />
            <StatCard
              icon={<Calendar className="w-5 h-5 text-blue-500" />}
              label="Leave Used"
              value={stats?.leaveDays ?? 0}
              color="blue"
            />
            <StatCard
              icon={<Timer className="w-5 h-5 text-purple-500" />}
              label="Overtime Hours"
              value={stats?.overtimeHours ?? 0}
              color="purple"
              suffix="h"
            />
          </div>

          {/* Monthly Calendar View */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Monthly Attendance
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={prevMonth}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[140px] text-center">
                  {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                </span>
                <button
                  onClick={nextMonth}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {/* Day headers */}
                {DAY_NAMES.map((day) => (
                  <div
                    key={day}
                    className="text-center text-[10px] font-medium text-gray-500 py-1"
                  >
                    {day}
                  </div>
                ))}

                {/* Calendar cells */}
                {calendarGrid.map((cell, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-colors",
                      cell.day === null
                        ? ""
                        : cell.status === "weekend"
                          ? "bg-gray-50 dark:bg-gray-900/50 text-gray-400"
                          : cell.status === "future"
                            ? "bg-gray-50 dark:bg-gray-900/30 text-gray-400"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                    )}
                  >
                    {cell.day !== null && (
                      <>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            cell.status === "weekend" || cell.status === "future"
                              ? "text-gray-400"
                              : "text-gray-700 dark:text-gray-300"
                          )}
                        >
                          {cell.day}
                        </span>
                        {cell.status !== "weekend" &&
                          cell.status !== "future" &&
                          cell.status !== "none" && (
                            <div
                              className={cn(
                                "w-2 h-2 rounded-full mt-0.5",
                                statusColor(cell.status)
                              )}
                              title={statusLabel(cell.status)}
                            />
                          )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// --- Stat Card ---
function StatCard({
  icon,
  label,
  value,
  total,
  color,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total?: number;
  color: "green" | "yellow" | "blue" | "purple";
  suffix?: string;
}) {
  const bgColors = {
    green: "bg-green-50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30",
    yellow: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-100 dark:border-yellow-900/30",
    blue: "bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30",
    purple: "bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30",
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-4 flex flex-col gap-2",
        bgColors[color]
      )}
    >
      {icon}
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
          {value}
          {suffix && (
            <span className="text-sm font-normal text-gray-500 ml-0.5">
              {suffix}
            </span>
          )}
          {total != null && (
            <span className="text-sm font-normal text-gray-400">
              /{total}
            </span>
          )}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {label}
        </p>
      </div>
    </div>
  );
}

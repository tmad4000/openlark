"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Clock, Globe, Save, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../../../components/ThemeProvider";

type UserStatus = "active" | "away" | "busy" | "offline";

interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  avatarUrl: string | null;
  timezone: string | null;
  locale: string | null;
  status: UserStatus | null;
  statusText: string | null;
  statusEmoji: string | null;
  workingHoursStart: string | null;
  workingHoursEnd: string | null;
}

const STATUS_COLORS: Record<UserStatus, string> = {
  active: "bg-green-500",
  away: "bg-yellow-500",
  busy: "bg-red-500",
  offline: "bg-gray-400",
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Pacific/Auckland",
];

type ThemePreference = "light" | "dark" | "system";

export default function ProfilePage() {
  const router = useRouter();
  const { theme: currentTheme, setTheme } = useTheme();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [workingHoursStart, setWorkingHoursStart] = useState("09:00");
  const [workingHoursEnd, setWorkingHoursEnd] = useState("17:00");

  useEffect(() => {
    const token = getCookie("session_token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid session");
        return res.json();
      })
      .then((data) => {
        const u = data.user;
        setUser(u);
        setDisplayName(u.displayName || "");
        setPhone(u.phone || "");
        setTimezone(u.timezone || "UTC");
        setWorkingHoursStart(u.workingHoursStart || "09:00");
        setWorkingHoursEnd(u.workingHoursEnd || "17:00");
        setThemePreference(u.theme || "system");
        setIsLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  const handleSave = async () => {
    const token = getCookie("session_token");
    if (!token) return;

    setIsSaving(true);
    setSaveMessage("");

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: displayName,
          phone: phone || null,
          timezone,
          working_hours_start: workingHoursStart,
          working_hours_end: workingHoursEnd,
          theme: themePreference,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSaveMessage("Profile saved successfully");
        setTimeout(() => setSaveMessage(""), 3000);
      } else {
        const err = await res.json();
        setSaveMessage(`Error: ${err.error}`);
      }
    } catch {
      setSaveMessage("Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Profile Settings</h1>

      {/* Current Status Display */}
      <div className="rounded-lg p-6 mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <User className="w-5 h-5" />
          Current Status
        </h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg font-medium">
              {user?.displayName?.charAt(0).toUpperCase() || "U"}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${STATUS_COLORS[user?.status || "offline"]}`}
            />
          </div>
          <div>
            <p className="font-medium text-gray-900">{user?.displayName}</p>
            <p className="text-sm text-gray-500">
              {user?.statusEmoji && <span className="mr-1">{user.statusEmoji}</span>}
              {user?.statusText || (user?.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1) : "Offline")}
            </p>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="rounded-lg p-6 mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Personal Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ""}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Theme Settings */}
      <div className="rounded-lg p-6 mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Sun className="w-5 h-5" />
          Appearance
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Choose how OpenLark looks to you. Select a theme or let it follow your system settings.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: "light" as ThemePreference, label: "Light", icon: Sun },
            { value: "dark" as ThemePreference, label: "Dark", icon: Moon },
            { value: "system" as ThemePreference, label: "System", icon: Monitor },
          ]).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setThemePreference(value);
                setTheme(value);
              }}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                themePreference === value
                  ? "border-blue-500"
                  : ""
              }`}
              style={{
                borderColor: themePreference === value ? "var(--accent)" : "var(--border-default)",
                background: themePreference === value ? "var(--bg-surface-hover)" : "var(--bg-surface)",
                color: "var(--text-primary)",
              }}
            >
              <Icon className="w-6 h-6" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Working Hours */}
      <div className="rounded-lg p-6 mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Clock className="w-5 h-5" />
          Working Hours
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Set your working hours so colleagues know when you're available. They'll see a warning if they try to contact you outside these hours.
        </p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <input
              type="time"
              value={workingHoursStart}
              onChange={(e) => setWorkingHoursStart(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
            <input
              type="time"
              value={workingHoursEnd}
              onChange={(e) => setWorkingHoursEnd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
        {saveMessage && (
          <p className={`text-sm ${saveMessage.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
            {saveMessage}
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Target,
  Plus,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  BarChart3,
  GitBranch,
  X,
  Check,
  Edit2,
  Trash2,
} from "lucide-react";

// --- Types ---

interface OkrCycle {
  id: string;
  orgId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
}

interface KeyResult {
  id: string;
  objectiveId: string;
  title: string;
  targetValue: string;
  currentValue: string;
  weight: string;
  score: string | null;
  unit: string | null;
  createdAt: string;
}

interface Objective {
  id: string;
  cycleId: string;
  ownerId: string;
  title: string;
  description: string | null;
  parentObjectiveId: string | null;
  visibility: string;
  status: string;
  createdAt: string;
  key_results?: KeyResult[];
}

interface OkrAlignment {
  objectiveId: string;
  alignedToObjectiveId: string;
  confirmed: boolean;
}

interface OkrCheckin {
  id: string;
  keyResultId: string;
  userId: string;
  value: string;
  notes: string | null;
  createdAt: string;
}

type ViewMode = "objectives" | "alignment";

// --- Helpers ---

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function computeObjectiveScore(krs: KeyResult[]): number {
  if (krs.length === 0) return 0;
  let totalWeight = 0;
  let weightedScore = 0;
  for (const kr of krs) {
    const w = parseFloat(kr.weight) || 1;
    const s = kr.score !== null ? parseFloat(kr.score) : 0;
    totalWeight += w;
    weightedScore += w * s;
  }
  return totalWeight > 0 ? weightedScore / totalWeight : 0;
}

function scoreColor(score: number): string {
  if (score >= 0.7) return "text-green-600";
  if (score >= 0.4) return "text-amber-600";
  return "text-red-600";
}

function scoreBgColor(score: number): string {
  if (score >= 0.7) return "bg-green-500";
  if (score >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

function progressBarBg(score: number): string {
  if (score >= 0.7) return "bg-green-100";
  if (score >= 0.4) return "bg-amber-100";
  return "bg-red-100";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
  active: { label: "Active", color: "text-blue-600", bg: "bg-blue-100" },
  completed: { label: "Completed", color: "text-green-600", bg: "bg-green-100" },
};

const CYCLE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  creating: { label: "Creating", color: "text-gray-600", bg: "bg-gray-100" },
  aligning: { label: "Aligning", color: "text-blue-600", bg: "bg-blue-100" },
  following_up: { label: "Following Up", color: "text-amber-600", bg: "bg-amber-100" },
  reviewing: { label: "Reviewing", color: "text-green-600", bg: "bg-green-100" },
};

// --- Main Component ---

export default function OkrPage() {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Data
  const [cycles, setCycles] = useState<OkrCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [objectivesList, setObjectivesList] = useState<Objective[]>([]);
  const [alignments, setAlignments] = useState<OkrAlignment[]>([]);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>("objectives");
  const [loading, setLoading] = useState(true);
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set());

  // Dialogs
  const [showCreateCycle, setShowCreateCycle] = useState(false);
  const [showCreateObjective, setShowCreateObjective] = useState(false);
  const [showAddKR, setShowAddKR] = useState<string | null>(null);
  const [showCheckin, setShowCheckin] = useState<KeyResult | null>(null);
  const [checkinHistory, setCheckinHistory] = useState<OkrCheckin[]>([]);

  // Form state
  const [cycleName, setCycleName] = useState("");
  const [cycleStart, setCycleStart] = useState("");
  const [cycleEnd, setCycleEnd] = useState("");
  const [objTitle, setObjTitle] = useState("");
  const [objDescription, setObjDescription] = useState("");
  const [objParentId, setObjParentId] = useState("");
  const [objStatus, setObjStatus] = useState("draft");
  const [krTitle, setKrTitle] = useState("");
  const [krTarget, setKrTarget] = useState("");
  const [krUnit, setKrUnit] = useState("");
  const [krWeight, setKrWeight] = useState("1");
  const [checkinValue, setCheckinValue] = useState("");
  const [checkinNotes, setCheckinNotes] = useState("");

  // --- Auth ---
  useEffect(() => {
    const t = getCookie("session_token");
    setToken(t);
    if (t) {
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${t}` } })
        .then((r) => r.json())
        .then((d) => {
          if (d.user) setUserId(d.user.id);
        })
        .catch(() => {});
    }
  }, []);

  // --- Data Fetching ---

  const fetchCycles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/okrs/cycles", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCycles(data.cycles || []);
      if (!selectedCycleId && data.cycles?.length > 0) {
        setSelectedCycleId(data.cycles[0].id);
      }
    } catch {
      /* ignore */
    }
  }, [token, selectedCycleId]);

  const fetchObjectives = useCallback(async () => {
    if (!token || !selectedCycleId) return;
    try {
      const res = await fetch(`/api/okrs/objectives?cycle_id=${selectedCycleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const objs: Objective[] = data.objectives || [];

      // Fetch key results for each objective
      const withKRs = await Promise.all(
        objs.map(async (obj) => {
          try {
            const r = await fetch(`/api/okrs/objectives/${obj.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json();
            return d.objective || obj;
          } catch {
            return obj;
          }
        })
      );
      setObjectivesList(withKRs);
    } catch {
      /* ignore */
    }
  }, [token, selectedCycleId]);

  const fetchAlignments = useCallback(async () => {
    if (!token || objectivesList.length === 0) return;
    try {
      const allAlignments: OkrAlignment[] = [];
      for (const obj of objectivesList) {
        const res = await fetch(`/api/okrs/alignments?objective_id=${obj.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.alignments) allAlignments.push(...data.alignments);
      }
      setAlignments(allAlignments);
    } catch {
      /* ignore */
    }
  }, [token, objectivesList]);

  useEffect(() => {
    if (token) {
      setLoading(true);
      fetchCycles().finally(() => setLoading(false));
    }
  }, [token, fetchCycles]);

  useEffect(() => {
    if (selectedCycleId) {
      fetchObjectives();
    }
  }, [selectedCycleId, fetchObjectives]);

  useEffect(() => {
    if (objectivesList.length > 0 && viewMode === "alignment") {
      fetchAlignments();
    }
  }, [objectivesList, viewMode, fetchAlignments]);

  // --- Actions ---

  const createCycle = async () => {
    if (!token || !cycleName || !cycleStart || !cycleEnd) return;
    try {
      await fetch("/api/okrs/cycles", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cycleName,
          start_date: cycleStart,
          end_date: cycleEnd,
        }),
      });
      setCycleName("");
      setCycleStart("");
      setCycleEnd("");
      setShowCreateCycle(false);
      await fetchCycles();
    } catch {
      /* ignore */
    }
  };

  const createObjective = async () => {
    if (!token || !selectedCycleId || !objTitle) return;
    try {
      await fetch("/api/okrs/objectives", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cycle_id: selectedCycleId,
          title: objTitle,
          description: objDescription || undefined,
          parent_objective_id: objParentId || undefined,
          status: objStatus,
        }),
      });
      setObjTitle("");
      setObjDescription("");
      setObjParentId("");
      setObjStatus("draft");
      setShowCreateObjective(false);
      await fetchObjectives();
    } catch {
      /* ignore */
    }
  };

  const createKeyResult = async () => {
    if (!token || !showAddKR || !krTitle || !krTarget) return;
    try {
      await fetch("/api/okrs/key-results", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          objective_id: showAddKR,
          title: krTitle,
          target_value: krTarget,
          unit: krUnit || undefined,
          weight: krWeight || "1",
        }),
      });
      setKrTitle("");
      setKrTarget("");
      setKrUnit("");
      setKrWeight("1");
      setShowAddKR(null);
      await fetchObjectives();
    } catch {
      /* ignore */
    }
  };

  const submitCheckin = async () => {
    if (!token || !showCheckin || !checkinValue) return;
    try {
      await fetch("/api/okrs/checkins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key_result_id: showCheckin.id,
          value: checkinValue,
          notes: checkinNotes || undefined,
        }),
      });
      setCheckinValue("");
      setCheckinNotes("");
      setShowCheckin(null);
      await fetchObjectives();
    } catch {
      /* ignore */
    }
  };

  const openCheckin = async (kr: KeyResult) => {
    setShowCheckin(kr);
    setCheckinValue(kr.currentValue || "");
    setCheckinNotes("");
    if (token) {
      try {
        const res = await fetch(`/api/okrs/checkins?key_result_id=${kr.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setCheckinHistory(data.checkins || []);
      } catch {
        setCheckinHistory([]);
      }
    }
  };

  const deleteObjective = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`/api/okrs/objectives/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchObjectives();
    } catch {
      /* ignore */
    }
  };

  const deleteKeyResult = async (id: string) => {
    if (!token) return;
    try {
      await fetch(`/api/okrs/key-results/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchObjectives();
    } catch {
      /* ignore */
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedObjectives((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);

  // --- Alignment tree building ---
  function buildAlignmentTree(): { obj: Objective; children: Objective[] }[] {
    const childMap = new Map<string, string[]>();
    for (const a of alignments) {
      const existing = childMap.get(a.alignedToObjectiveId) || [];
      existing.push(a.objectiveId);
      childMap.set(a.alignedToObjectiveId, existing);
    }

    const alignedChildIds = new Set(alignments.map((a) => a.objectiveId));
    // Root = objectives that don't appear as children in any alignment,
    // OR objectives with parentObjectiveId === null and no alignment parent
    const roots = objectivesList.filter((o) => !alignedChildIds.has(o.id));

    return roots.map((root) => ({
      obj: root,
      children: (childMap.get(root.id) || [])
        .map((cid) => objectivesList.find((o) => o.id === cid))
        .filter(Boolean) as Objective[],
    }));
  }

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-gray-400">Loading OKRs...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900">OKR</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateCycle(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
            >
              New Cycle
            </button>
            <button
              onClick={() => setShowCreateObjective(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              disabled={!selectedCycleId}
            >
              <Plus className="w-4 h-4" />
              New Objective
            </button>
          </div>
        </div>

        {/* Cycle selector & view tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {cycles.length > 0 ? (
              <select
                value={selectedCycleId || ""}
                onChange={(e) => setSelectedCycleId(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-gray-500">No cycles yet</span>
            )}
            {selectedCycle && (
              <>
                <span className="text-xs text-gray-400">
                  {new Date(selectedCycle.startDate).toLocaleDateString()} —{" "}
                  {new Date(selectedCycle.endDate).toLocaleDateString()}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${CYCLE_STATUS_CONFIG[selectedCycle.status]?.bg || "bg-gray-100"} ${CYCLE_STATUS_CONFIG[selectedCycle.status]?.color || "text-gray-600"}`}
                >
                  {CYCLE_STATUS_CONFIG[selectedCycle.status]?.label || selectedCycle.status}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center bg-gray-100 rounded-md p-0.5">
            <button
              onClick={() => setViewMode("objectives")}
              className={`flex items-center gap-1 px-3 py-1 text-sm rounded ${viewMode === "objectives" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Objectives
            </button>
            <button
              onClick={() => setViewMode("alignment")}
              className={`flex items-center gap-1 px-3 py-1 text-sm rounded ${viewMode === "alignment" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Alignment
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {!selectedCycleId ? (
          <div className="text-center py-16 text-gray-400">
            <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Create an OKR cycle to get started</p>
          </div>
        ) : viewMode === "objectives" ? (
          <ObjectivesView
            objectives={objectivesList}
            expandedObjectives={expandedObjectives}
            toggleExpand={toggleExpand}
            onAddKR={setShowAddKR}
            onCheckin={openCheckin}
            onDeleteObjective={deleteObjective}
            onDeleteKR={deleteKeyResult}
          />
        ) : (
          <AlignmentView tree={buildAlignmentTree()} objectives={objectivesList} />
        )}
      </div>

      {/* Create Cycle Dialog */}
      {showCreateCycle && (
        <Dialog title="New OKR Cycle" onClose={() => setShowCreateCycle(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cycle Name
              </label>
              <input
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                placeholder="e.g., Q1 2026"
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={cycleStart}
                  onChange={(e) => setCycleStart(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={cycleEnd}
                  onChange={(e) => setCycleEnd(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateCycle(false)}
                className="px-4 py-2 text-sm text-gray-700 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createCycle}
                disabled={!cycleName || !cycleStart || !cycleEnd}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Create Cycle
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Create Objective Dialog */}
      {showCreateObjective && (
        <Dialog title="New Objective" onClose={() => setShowCreateObjective(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                value={objTitle}
                onChange={(e) => setObjTitle(e.target.value)}
                placeholder="e.g., Increase customer satisfaction"
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={objDescription}
                onChange={(e) => setObjDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={objStatus}
                  onChange={(e) => setObjStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Align to Parent
                </label>
                <select
                  value={objParentId}
                  onChange={(e) => setObjParentId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">None</option>
                  {objectivesList.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateObjective(false)}
                className="px-4 py-2 text-sm text-gray-700 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createObjective}
                disabled={!objTitle}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Create Objective
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Add Key Result Dialog */}
      {showAddKR && (
        <Dialog title="Add Key Result" onClose={() => setShowAddKR(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Key Result Title <span className="text-red-500">*</span>
              </label>
              <input
                value={krTitle}
                onChange={(e) => setKrTitle(e.target.value)}
                placeholder="e.g., Achieve NPS score of 50+"
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={krTarget}
                  onChange={(e) => setKrTarget(e.target.value)}
                  placeholder="100"
                  className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit
                </label>
                <input
                  value={krUnit}
                  onChange={(e) => setKrUnit(e.target.value)}
                  placeholder="e.g., %, pts"
                  className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight
                </label>
                <input
                  type="number"
                  value={krWeight}
                  onChange={(e) => setKrWeight(e.target.value)}
                  placeholder="1"
                  min="0.1"
                  step="0.1"
                  className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddKR(null)}
                className="px-4 py-2 text-sm text-gray-700 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createKeyResult}
                disabled={!krTitle || !krTarget}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add Key Result
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Check-in Dialog */}
      {showCheckin && (
        <Dialog
          title={`Check-in: ${showCheckin.title}`}
          onClose={() => setShowCheckin(null)}
        >
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-md p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Current</span>
                <span className="font-medium">
                  {showCheckin.currentValue} / {showCheckin.targetValue}
                  {showCheckin.unit ? ` ${showCheckin.unit}` : ""}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar
                  current={parseFloat(showCheckin.currentValue)}
                  target={parseFloat(showCheckin.targetValue)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Value <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={checkinValue}
                onChange={(e) => setCheckinValue(e.target.value)}
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={checkinNotes}
                onChange={(e) => setCheckinNotes(e.target.value)}
                rows={2}
                placeholder="What progress was made?"
                className="w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {checkinHistory.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">History</h4>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {checkinHistory.map((ci) => (
                    <div
                      key={ci.id}
                      className="flex items-center justify-between text-xs text-gray-500 px-2 py-1 bg-gray-50 rounded"
                    >
                      <span className="font-medium text-gray-700">{ci.value}</span>
                      <div className="flex items-center gap-2">
                        {ci.notes && (
                          <span className="text-gray-400 truncate max-w-[150px]">
                            {ci.notes}
                          </span>
                        )}
                        <span>{new Date(ci.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCheckin(null)}
                className="px-4 py-2 text-sm text-gray-700 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitCheckin}
                disabled={!checkinValue}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Submit Check-in
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// --- Sub-components ---

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ProgressBar({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const score = target > 0 ? Math.min(current / target, 1) : 0;
  return (
    <div className={`w-full h-2 rounded-full ${progressBarBg(score)}`}>
      <div
        className={`h-full rounded-full transition-all ${scoreBgColor(score)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ObjectivesView({
  objectives,
  expandedObjectives,
  toggleExpand,
  onAddKR,
  onCheckin,
  onDeleteObjective,
  onDeleteKR,
}: {
  objectives: Objective[];
  expandedObjectives: Set<string>;
  toggleExpand: (id: string) => void;
  onAddKR: (id: string) => void;
  onCheckin: (kr: KeyResult) => void;
  onDeleteObjective: (id: string) => void;
  onDeleteKR: (id: string) => void;
}) {
  if (objectives.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No objectives yet. Create one to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {objectives.map((obj) => {
        const krs = obj.key_results || [];
        const objScore = computeObjectiveScore(krs);
        const isExpanded = expandedObjectives.has(obj.id);
        const statusCfg = STATUS_CONFIG[obj.status] || STATUS_CONFIG.draft;

        return (
          <div
            key={obj.id}
            className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
          >
            {/* Objective header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleExpand(obj.id)}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900 truncate">
                    {obj.title}
                  </h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}
                  >
                    {statusCfg.label}
                  </span>
                </div>
                {obj.description && (
                  <p className="text-sm text-gray-500 mt-0.5 truncate">
                    {obj.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div
                    className={`text-lg font-semibold ${scoreColor(objScore)}`}
                  >
                    {(objScore * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-400">
                    {krs.length} KR{krs.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="w-20">
                  <ProgressBar
                    current={objScore * 100}
                    target={100}
                  />
                </div>
              </div>
            </div>

            {/* Expanded KR list */}
            {isExpanded && (
              <div className="border-t bg-gray-50">
                {krs.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-gray-400 text-center">
                    No key results yet
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {krs.map((kr) => {
                      const current = parseFloat(kr.currentValue) || 0;
                      const target = parseFloat(kr.targetValue) || 1;
                      const krScore =
                        kr.score !== null ? parseFloat(kr.score) : 0;
                      return (
                        <div
                          key={kr.id}
                          className="px-5 py-3 flex items-center gap-4 hover:bg-white/60"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-800">
                                {kr.title}
                              </span>
                              <span className="text-xs text-gray-400">
                                w:{kr.weight}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5">
                              <div className="w-40">
                                <ProgressBar
                                  current={current}
                                  target={target}
                                />
                              </div>
                              <span className="text-xs text-gray-500">
                                {current}/{target}
                                {kr.unit ? ` ${kr.unit}` : ""}
                              </span>
                              <span
                                className={`text-xs font-medium ${scoreColor(krScore)}`}
                              >
                                {(krScore * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCheckin(kr);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                              title="Check-in"
                            >
                              <TrendingUp className="w-3 h-3" />
                              Check-in
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteKR(kr.id);
                              }}
                              className="p-1 text-gray-400 hover:text-red-500 rounded"
                              title="Delete key result"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="px-5 py-2 border-t border-gray-100 flex items-center justify-between">
                  <button
                    onClick={() => onAddKR(obj.id)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="w-3 h-3" />
                    Add Key Result
                  </button>
                  <button
                    onClick={() => onDeleteObjective(obj.id)}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete Objective
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlignmentView({
  tree,
  objectives,
}: {
  tree: { obj: Objective; children: Objective[] }[];
  objectives: Objective[];
}) {
  if (objectives.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No objectives to show alignment for.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
        Objective Hierarchy
      </h2>
      {tree.map(({ obj, children }) => {
        const krs = obj.key_results || [];
        const objScore = computeObjectiveScore(krs);
        return (
          <div key={obj.id}>
            {/* Root node */}
            <div className="bg-white rounded-lg border-2 border-blue-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{obj.title}</h3>
                  {obj.description && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {obj.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-lg font-semibold ${scoreColor(objScore)}`}
                  >
                    {(objScore * 100).toFixed(0)}%
                  </span>
                  <div className="w-16">
                    <ProgressBar current={objScore * 100} target={100} />
                  </div>
                </div>
              </div>
            </div>

            {/* Children */}
            {children.length > 0 && (
              <div className="ml-8 mt-2 space-y-2 border-l-2 border-gray-200 pl-4">
                {children.map((child) => {
                  const childKrs = child.key_results || [];
                  const childScore = computeObjectiveScore(childKrs);
                  return (
                    <div
                      key={child.id}
                      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-gray-800">
                            {child.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${scoreColor(childScore)}`}
                          >
                            {(childScore * 100).toFixed(0)}%
                          </span>
                          <div className="w-12">
                            <ProgressBar
                              current={childScore * 100}
                              target={100}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

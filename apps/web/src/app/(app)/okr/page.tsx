"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  api,
  type OkrCycle,
  type OkrObjective,
  type OkrKeyResult,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Target,
  Plus,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
  TrendingUp,
  GitBranch,
  User,
  Users,
  BarChart3,
  MessageSquare,
} from "lucide-react";

type TabMode = "my_okrs" | "all_okrs" | "alignment";

// --- Helper: calculate objective score from key results ---
function calcObjectiveScore(krs: OkrKeyResult[]): number | null {
  if (!krs.length) return null;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const kr of krs) {
    const w = parseFloat(kr.weight) || 1;
    const s = kr.score != null ? parseFloat(kr.score) : null;
    if (s != null && !isNaN(s)) {
      totalWeight += w;
      weightedSum += s * w;
    }
  }
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

// --- Helper: score color ---
function scoreColor(score: number | null): string {
  if (score == null) return "text-gray-400";
  if (score >= 0.7) return "text-green-600 dark:text-green-400";
  if (score >= 0.4) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBgColor(score: number | null): string {
  if (score == null) return "bg-gray-100 dark:bg-gray-800";
  if (score >= 0.7) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 0.4) return "bg-amber-100 dark:bg-amber-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export default function OkrPage() {
  const { user } = useAuth();
  const [cycles, setCycles] = useState<OkrCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [objectives, setObjectives] = useState<OkrObjective[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabMode, setTabMode] = useState<TabMode>("my_okrs");
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [checkinKrId, setCheckinKrId] = useState<string | null>(null);

  // Load cycles on mount
  const loadCycles = useCallback(async () => {
    try {
      const res = await api.getOkrCycles({ limit: 20 });
      setCycles(res.cycles);
      if (res.cycles.length > 0 && !selectedCycleId) {
        setSelectedCycleId(res.cycles[0].id);
      }
    } catch {
      // ignore
    }
  }, [selectedCycleId]);

  // Load objectives for selected cycle
  const loadObjectives = useCallback(async () => {
    if (!selectedCycleId) {
      setObjectives([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await api.getOkrObjectives({ cycleId: selectedCycleId, limit: 200 });
      setObjectives(res.objectives);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedCycleId]);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  useEffect(() => {
    if (selectedCycleId) {
      loadObjectives();
    }
  }, [selectedCycleId, loadObjectives]);

  // Filter objectives by tab
  const filteredObjectives = useMemo(() => {
    if (!user) return [];
    switch (tabMode) {
      case "my_okrs":
        return objectives.filter((o) => o.ownerId === user.id);
      case "all_okrs":
        return objectives;
      case "alignment":
        return objectives;
      default:
        return objectives;
    }
  }, [objectives, tabMode, user]);

  // For alignment view, build tree
  const objectiveTree = useMemo(() => {
    const roots: OkrObjective[] = [];
    const childMap = new Map<string, OkrObjective[]>();

    for (const obj of objectives) {
      if (!obj.parentObjectiveId) {
        roots.push(obj);
      } else {
        const children = childMap.get(obj.parentObjectiveId) || [];
        children.push(obj);
        childMap.set(obj.parentObjectiveId, children);
      }
    }

    return { roots, childMap };
  }, [objectives]);

  const toggleExpanded = (id: string) => {
    setExpandedObjectives((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refreshAndClose = useCallback(() => {
    setShowCreateForm(false);
    loadObjectives();
  }, [loadObjectives]);

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            OKRs
          </h2>
        </div>

        {/* Cycle selector */}
        <select
          value={selectedCycleId}
          onChange={(e) => setSelectedCycleId(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 mb-3"
        >
          {cycles.length === 0 && <option value="">No cycles</option>}
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <Button
          onClick={() => setShowCreateForm(true)}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New objective
        </Button>
      </div>

      <div className="p-2 space-y-0.5">
        <button
          onClick={() => setTabMode("my_okrs")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            tabMode === "my_okrs"
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <User className="w-4 h-4" />
          My OKRs
          <span className="ml-auto text-xs text-gray-400">
            {user ? objectives.filter((o) => o.ownerId === user.id).length : 0}
          </span>
        </button>
        <button
          onClick={() => setTabMode("all_okrs")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            tabMode === "all_okrs"
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <Users className="w-4 h-4" />
          All OKRs
          <span className="ml-auto text-xs text-gray-400">
            {objectives.length}
          </span>
        </button>
        <button
          onClick={() => setTabMode("alignment")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            tabMode === "alignment"
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <GitBranch className="w-4 h-4" />
          Alignment
        </button>
      </div>

      {/* Cycle info */}
      {selectedCycle && (
        <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-500 mb-1">Cycle</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {selectedCycle.name}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(selectedCycle.startDate).toLocaleDateString()} -{" "}
            {new Date(selectedCycle.endDate).toLocaleDateString()}
          </p>
          <span
            className={cn(
              "inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium",
              selectedCycle.status === "following_up"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : selectedCycle.status === "reviewing"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            {selectedCycle.status.replace("_", " ")}
          </span>
        </div>
      )}
    </div>
  );

  // Right panel: check-in form
  const rightPanel = checkinKrId ? (
    <CheckinPanel
      keyResultId={checkinKrId}
      onClose={() => setCheckinKrId(null)}
      onCheckedIn={() => {
        setCheckinKrId(null);
        loadObjectives();
      }}
    />
  ) : undefined;

  return (
    <AppShell sidebar={sidebar} rightPanel={rightPanel}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tabMode === "my_okrs"
              ? "My OKRs"
              : tabMode === "all_okrs"
                ? "All OKRs"
                : "Alignment"}
          </h1>
          {selectedCycle && (
            <span className="text-xs text-gray-400">
              {selectedCycle.name}
            </span>
          )}
        </div>

        {/* Create form */}
        {showCreateForm && selectedCycleId && (
          <CreateObjectiveForm
            cycleId={selectedCycleId}
            objectives={objectives}
            onCreated={refreshAndClose}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : !selectedCycleId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Target className="w-10 h-10 mb-2" />
            <p className="text-sm">No OKR cycles found</p>
            <p className="text-xs mt-1">Create a cycle to get started</p>
          </div>
        ) : tabMode === "alignment" ? (
          <div className="flex-1 overflow-y-auto p-4">
            {objectiveTree.roots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <GitBranch className="w-10 h-10 mb-2" />
                <p className="text-sm">No objectives yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {objectiveTree.roots.map((obj) => (
                  <AlignmentTreeNode
                    key={obj.id}
                    objective={obj}
                    childMap={objectiveTree.childMap}
                    depth={0}
                    onCheckin={setCheckinKrId}
                    expandedObjectives={expandedObjectives}
                    toggleExpanded={toggleExpanded}
                  />
                ))}
              </div>
            )}
          </div>
        ) : filteredObjectives.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Target className="w-10 h-10 mb-2" />
            <p className="text-sm">No objectives</p>
            <p className="text-xs mt-1">
              {tabMode === "my_okrs"
                ? "Create your first objective"
                : "No objectives in this cycle yet"}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {filteredObjectives.map((obj) => (
              <ObjectiveCard
                key={obj.id}
                objective={obj}
                expanded={expandedObjectives.has(obj.id)}
                onToggle={() => toggleExpanded(obj.id)}
                onCheckin={setCheckinKrId}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// --- Objective Card ---

function ObjectiveCard({
  objective,
  expanded,
  onToggle,
  onCheckin,
}: {
  objective: OkrObjective;
  expanded: boolean;
  onToggle: () => void;
  onCheckin: (krId: string) => void;
}) {
  const krs = objective.keyResults ?? [];
  const score = calcObjectiveScore(krs);
  const scoreDisplay = score != null ? score.toFixed(2) : "--";

  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
      >
        {krs.length > 0 ? (
          expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )
        ) : (
          <div className="w-4 h-4 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {objective.title}
          </p>
          {objective.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {objective.description}
            </p>
          )}
        </div>

        <StatusBadge status={objective.status} />

        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold",
            scoreBgColor(score),
            scoreColor(score)
          )}
        >
          {scoreDisplay}
        </span>

        <span className="text-xs text-gray-400 shrink-0">
          {krs.length} KR{krs.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Expanded key results */}
      {expanded && krs.length > 0 && (
        <div className="px-4 pb-3 pl-11 space-y-2">
          {krs.map((kr) => (
            <KeyResultRow key={kr.id} kr={kr} onCheckin={onCheckin} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Key Result Row ---

function KeyResultRow({
  kr,
  onCheckin,
}: {
  kr: OkrKeyResult;
  onCheckin: (krId: string) => void;
}) {
  const current = parseFloat(kr.currentValue) || 0;
  const target = parseFloat(kr.targetValue) || 1;
  const progress = Math.min((current / target) * 100, 100);
  const krScore = kr.score != null ? parseFloat(kr.score) : null;
  const weight = parseFloat(kr.weight) || 1;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50">
      <BarChart3 className="w-4 h-4 text-gray-400 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
            {kr.title}
          </p>
          {weight !== 1 && (
            <span className="text-[10px] text-gray-400 shrink-0">
              w:{weight}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                progress >= 70
                  ? "bg-green-500"
                  : progress >= 40
                    ? "bg-amber-500"
                    : "bg-blue-500"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500 shrink-0 w-16 text-right">
            {current}/{target}
            {kr.unit ? ` ${kr.unit}` : ""}
          </span>
        </div>
      </div>

      {/* Score */}
      <span
        className={cn(
          "text-xs font-semibold shrink-0",
          scoreColor(krScore)
        )}
      >
        {krScore != null ? krScore.toFixed(2) : "--"}
      </span>

      {/* Check-in button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCheckin(kr.id);
        }}
        className="shrink-0 px-2 py-1 rounded text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
      >
        Check-in
      </button>
    </div>
  );
}

// --- Status Badge ---

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    active: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium shrink-0",
        styles[status] ?? styles.draft
      )}
    >
      {status}
    </span>
  );
}

// --- Create Objective Form ---

function CreateObjectiveForm({
  cycleId,
  objectives,
  onCreated,
  onCancel,
}: {
  cycleId: string;
  objectives: OkrObjective[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [visibility, setVisibility] = useState<"everyone" | "leaders" | "team">("everyone");
  const [keyResults, setKeyResults] = useState<
    Array<{ title: string; targetValue: string; unit: string; weight: string }>
  >([{ title: "", targetValue: "100", unit: "%", weight: "1" }]);
  const [submitting, setSubmitting] = useState(false);

  const addKr = () => {
    setKeyResults((prev) => [
      ...prev,
      { title: "", targetValue: "100", unit: "%", weight: "1" },
    ]);
  };

  const updateKr = (
    idx: number,
    field: "title" | "targetValue" | "unit" | "weight",
    value: string
  ) => {
    setKeyResults((prev) =>
      prev.map((kr, i) => (i === idx ? { ...kr, [field]: value } : kr))
    );
  };

  const removeKr = (idx: number) => {
    setKeyResults((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    try {
      setSubmitting(true);
      const res = await api.createOkrObjective({
        cycleId,
        title: title.trim(),
        description: description.trim() || undefined,
        parentObjectiveId: parentId || undefined,
        visibility,
      });

      // Create key results
      for (const kr of keyResults) {
        if (kr.title.trim()) {
          await api.createOkrKeyResult({
            objectiveId: res.objective.id,
            title: kr.title.trim(),
            targetValue: parseFloat(kr.targetValue) || 100,
            weight: parseFloat(kr.weight) || 1,
            unit: kr.unit || undefined,
          });
        }
      }

      onCreated();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Create Objective
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Title */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Objective title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Increase customer retention"
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Description */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 resize-none"
        />
      </div>

      {/* Parent alignment */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Align to parent objective (optional)
        </label>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
        >
          <option value="">None</option>
          {objectives.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>

      {/* Visibility */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Visibility
        </label>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "everyone" | "leaders" | "team")}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
        >
          <option value="everyone">Everyone</option>
          <option value="leaders">Leaders</option>
          <option value="team">Team</option>
        </select>
      </div>

      {/* Key Results */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Key Results
          </label>
          <button
            onClick={addKr}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Add KR
          </button>
        </div>

        <div className="space-y-2">
          {keyResults.map((kr, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-2 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex-1 space-y-1">
                <input
                  type="text"
                  value={kr.title}
                  onChange={(e) => updateKr(idx, "title", e.target.value)}
                  placeholder="Key result title"
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-400">Target</label>
                    <input
                      type="number"
                      value={kr.targetValue}
                      onChange={(e) => updateKr(idx, "targetValue", e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-0.5 text-xs text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="w-16">
                    <label className="text-[10px] text-gray-400">Unit</label>
                    <input
                      type="text"
                      value={kr.unit}
                      onChange={(e) => updateKr(idx, "unit", e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-0.5 text-xs text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="w-16">
                    <label className="text-[10px] text-gray-400">Weight</label>
                    <input
                      type="number"
                      value={kr.weight}
                      onChange={(e) => updateKr(idx, "weight", e.target.value)}
                      step="0.1"
                      min="0"
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-0.5 text-xs text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>
              {keyResults.length > 1 && (
                <button
                  onClick={() => removeKr(idx)}
                  className="text-gray-400 hover:text-red-500 mt-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={!title.trim() || submitting}
          size="sm"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Target className="w-4 h-4 mr-2" />
          )}
          Create
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// --- Check-in Panel ---

function CheckinPanel({
  keyResultId,
  onClose,
  onCheckedIn,
}: {
  keyResultId: string;
  onClose: () => void;
  onCheckedIn: () => void;
}) {
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    try {
      setSubmitting(true);
      await api.createOkrCheckin({
        keyResultId,
        value: numValue,
        notes: notes.trim() || undefined,
      });
      onCheckedIn();
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Check-in
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Current value
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter current value"
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What progress was made?"
            rows={3}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 resize-none"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            disabled={!value || submitting}
            size="sm"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <TrendingUp className="w-4 h-4 mr-2" />
            )}
            Submit check-in
          </Button>
          <Button onClick={onClose} variant="outline" size="sm">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Alignment Tree Node ---

function AlignmentTreeNode({
  objective,
  childMap,
  depth,
  onCheckin,
  expandedObjectives,
  toggleExpanded,
}: {
  objective: OkrObjective;
  childMap: Map<string, OkrObjective[]>;
  depth: number;
  onCheckin: (krId: string) => void;
  expandedObjectives: Set<string>;
  toggleExpanded: (id: string) => void;
}) {
  const children = childMap.get(objective.id) ?? [];
  const krs = objective.keyResults ?? [];
  const score = calcObjectiveScore(krs);
  const scoreDisplay = score != null ? score.toFixed(2) : "--";
  const expanded = expandedObjectives.has(objective.id);
  const hasExpandable = krs.length > 0 || children.length > 0;

  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors",
          depth > 0 && "border-l-2 border-blue-200 dark:border-blue-800"
        )}
      >
        {hasExpandable ? (
          <button onClick={() => toggleExpanded(objective.id)} className="shrink-0">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
        ) : (
          <div className="w-4 h-4 shrink-0" />
        )}

        <Target className="w-4 h-4 text-blue-500 shrink-0" />

        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
          {objective.title}
        </span>

        <StatusBadge status={objective.status} />

        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold",
            scoreBgColor(score),
            scoreColor(score)
          )}
        >
          {scoreDisplay}
        </span>
      </div>

      {/* Expanded: show KRs */}
      {expanded && krs.length > 0 && (
        <div className="ml-8 mt-1 mb-2 space-y-1">
          {krs.map((kr) => (
            <KeyResultRow key={kr.id} kr={kr} onCheckin={onCheckin} />
          ))}
        </div>
      )}

      {/* Children */}
      {expanded &&
        children.map((child) => (
          <AlignmentTreeNode
            key={child.id}
            objective={child}
            childMap={childMap}
            depth={depth + 1}
            onCheckin={onCheckin}
            expandedObjectives={expandedObjectives}
            toggleExpanded={toggleExpanded}
          />
        ))}
    </div>
  );
}

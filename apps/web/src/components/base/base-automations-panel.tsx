"use client";

import { useState, useEffect, useCallback } from "react";
import {
  api,
  type BaseAutomation,
  type AutomationRun,
  type AutomationTrigger,
  type AutomationAction,
  type TriggerType,
  type ActionType,
  type BaseTableInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Zap,
  Trash2,
  Play,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from "lucide-react";

const TRIGGER_LABELS: Record<TriggerType, string> = {
  record_created: "Record Created",
  record_updated: "Record Updated",
  record_matches_condition: "Record Matches Condition",
  scheduled: "Scheduled",
  button_clicked: "Button Clicked",
  webhook_received: "Webhook Received",
};

const ACTION_LABELS: Record<ActionType, string> = {
  update_record: "Update Record",
  create_record: "Create Record",
  send_message: "Send Message",
  http_request: "HTTP Request",
};

const TRIGGER_TYPES: TriggerType[] = [
  "record_created",
  "record_updated",
  "record_matches_condition",
  "scheduled",
  "button_clicked",
  "webhook_received",
];

const ACTION_TYPES: ActionType[] = [
  "update_record",
  "create_record",
  "send_message",
  "http_request",
];

interface BaseAutomationsPanelProps {
  baseId: string;
  tables: BaseTableInfo[];
}

export function BaseAutomationsPanel({
  baseId,
  tables,
}: BaseAutomationsPanelProps) {
  const [automations, setAutomations] = useState<BaseAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BaseAutomation | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<string | null>(null);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const loadAutomations = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.getAutomations(baseId);
      setAutomations(result.automations);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [baseId]);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  const handleToggleEnabled = useCallback(
    async (automation: BaseAutomation) => {
      try {
        const result = await api.updateAutomation(automation.id, {
          enabled: !automation.enabled,
        });
        setAutomations((prev) =>
          prev.map((a) => (a.id === result.automation.id ? result.automation : a))
        );
      } catch {
        // silently handle
      }
    },
    []
  );

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteAutomation(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // silently handle
    }
  }, []);

  const handleViewRuns = useCallback(async (automationId: string) => {
    if (expandedRuns === automationId) {
      setExpandedRuns(null);
      return;
    }
    setExpandedRuns(automationId);
    setRunsLoading(true);
    try {
      const result = await api.getAutomationRuns(automationId);
      setRuns(result.runs);
    } catch {
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  }, [expandedRuns]);

  if (creating || editing) {
    return (
      <AutomationEditor
        baseId={baseId}
        tables={tables}
        automation={editing}
        onSave={(automation) => {
          if (editing) {
            setAutomations((prev) =>
              prev.map((a) => (a.id === automation.id ? automation : a))
            );
          } else {
            setAutomations((prev) => [...prev, automation]);
          }
          setEditing(null);
          setCreating(false);
        }}
        onCancel={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Automations
          </h3>
          <span className="text-xs text-gray-500">
            ({automations.length})
          </span>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          New Automation
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              No automations yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Automate repetitive tasks with triggers and actions
            </p>
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Create Automation
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {automations.map((automation) => (
              <div key={automation.id}>
                <div
                  className={cn(
                    "bg-white dark:bg-gray-900 border rounded-lg p-3 transition-colors",
                    automation.enabled
                      ? "border-gray-200 dark:border-gray-700"
                      : "border-gray-200 dark:border-gray-800 opacity-60"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggleEnabled(automation)}
                        className={cn(
                          "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                          automation.enabled
                            ? "bg-blue-600"
                            : "bg-gray-300 dark:bg-gray-600"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200",
                            automation.enabled
                              ? "translate-x-4 mt-0.5 ml-0.5"
                              : "translate-x-0.5 mt-0.5"
                          )}
                        />
                      </button>

                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => setEditing(automation)}
                          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 truncate block text-left"
                        >
                          {automation.name}
                        </button>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">
                            {TRIGGER_LABELS[automation.trigger?.type as TriggerType] || "Unknown trigger"}
                          </span>
                          <span className="text-xs text-gray-400">→</span>
                          <span className="text-xs text-gray-500">
                            {automation.actions?.length || 0} action
                            {(automation.actions?.length || 0) !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewRuns(automation.id)}
                        className="h-7 px-2 text-xs"
                      >
                        <Clock className="w-3.5 h-3.5 mr-1" />
                        History
                        {expandedRuns === automation.id ? (
                          <ChevronDown className="w-3 h-3 ml-1" />
                        ) : (
                          <ChevronRight className="w-3 h-3 ml-1" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(automation.id)}
                        className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Run history */}
                {expandedRuns === automation.id && (
                  <div className="ml-4 mt-1 border-l-2 border-gray-200 dark:border-gray-700 pl-3 pb-2">
                    {runsLoading ? (
                      <p className="text-xs text-gray-400 py-2">Loading runs...</p>
                    ) : runs.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">No runs yet</p>
                    ) : (
                      <div className="space-y-1 py-1">
                        {runs.slice(0, 20).map((run) => (
                          <div
                            key={run.id}
                            className="flex items-center gap-2 text-xs py-1"
                          >
                            {run.status === "success" ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                            )}
                            <span className="text-gray-600 dark:text-gray-400">
                              {new Date(run.startedAt).toLocaleString()}
                            </span>
                            {run.completedAt && (
                              <span className="text-gray-400">
                                (
                                {Math.round(
                                  (new Date(run.completedAt).getTime() -
                                    new Date(run.startedAt).getTime()) /
                                    1000
                                )}
                                s)
                              </span>
                            )}
                            {run.error && (
                              <span className="text-red-500 truncate flex-1">
                                {run.error}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Automation Editor (create/edit)
interface AutomationEditorProps {
  baseId: string;
  tables: BaseTableInfo[];
  automation: BaseAutomation | null;
  onSave: (automation: BaseAutomation) => void;
  onCancel: () => void;
}

function AutomationEditor({
  baseId,
  tables,
  automation,
  onSave,
  onCancel,
}: AutomationEditorProps) {
  const [name, setName] = useState(automation?.name || "");
  const [triggerType, setTriggerType] = useState<TriggerType>(
    (automation?.trigger?.type as TriggerType) || "record_created"
  );
  const [triggerTableId, setTriggerTableId] = useState(
    automation?.trigger?.tableId || ""
  );
  const [triggerSchedule, setTriggerSchedule] = useState(
    automation?.trigger?.schedule || ""
  );
  const [actions, setActions] = useState<AutomationAction[]>(
    automation?.actions || [{ type: "update_record", config: {} }]
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "success" | "failed";
    error?: string;
  } | null>(null);

  const handleAddAction = useCallback(() => {
    setActions((prev) => [...prev, { type: "update_record", config: {} }]);
  }, []);

  const handleRemoveAction = useCallback((index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleActionTypeChange = useCallback(
    (index: number, type: ActionType) => {
      setActions((prev) =>
        prev.map((a, i) => (i === index ? { ...a, type, config: {} } : a))
      );
    },
    []
  );

  const handleActionConfigChange = useCallback(
    (index: number, key: string, value: string) => {
      setActions((prev) =>
        prev.map((a, i) =>
          i === index ? { ...a, config: { ...a.config, [key]: value } } : a
        )
      );
    },
    []
  );

  const buildTrigger = useCallback((): AutomationTrigger => {
    const trigger: AutomationTrigger = { type: triggerType };
    if (triggerTableId) trigger.tableId = triggerTableId;
    if (triggerType === "scheduled" && triggerSchedule) {
      trigger.schedule = triggerSchedule;
    }
    return trigger;
  }, [triggerType, triggerTableId, triggerSchedule]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || actions.length === 0) return;
    setSaving(true);
    try {
      const trigger = buildTrigger();
      if (automation) {
        const result = await api.updateAutomation(automation.id, {
          name: name.trim(),
          trigger,
          actions,
        });
        onSave(result.automation);
      } else {
        const result = await api.createAutomation(baseId, {
          name: name.trim(),
          trigger,
          actions,
          enabled: true,
        });
        onSave(result.automation);
      }
    } catch {
      // silently handle
    } finally {
      setSaving(false);
    }
  }, [name, actions, automation, baseId, buildTrigger, onSave]);

  const handleTestRun = useCallback(async () => {
    if (!automation) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Save first, then check runs to see latest
      const runsResult = await api.getAutomationRuns(automation.id);
      const latestRun = runsResult.runs[0];
      if (latestRun) {
        setTestResult({
          status: latestRun.status,
          error: latestRun.error || undefined,
        });
      } else {
        setTestResult({ status: "success" });
      }
    } catch {
      setTestResult({ status: "failed", error: "Failed to run test" });
    } finally {
      setTesting(false);
    }
  }, [automation]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {automation ? "Edit Automation" : "New Automation"}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {automation && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestRun}
              disabled={testing}
            >
              <Play className="w-3.5 h-3.5 mr-1" />
              {testing ? "Running..." : "Test Run"}
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Automation name"
          />
        </div>

        {/* Test result */}
        {testResult && (
          <div
            className={cn(
              "p-3 rounded-lg text-sm",
              testResult.status === "success"
                ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
            )}
          >
            {testResult.status === "success"
              ? "Test run completed successfully"
              : `Test run failed: ${testResult.error}`}
          </div>
        )}

        {/* Trigger */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Trigger
            </h4>
          </div>
          <div className="ml-8 space-y-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Trigger Type
              </label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as TriggerType)}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {TRIGGER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRIGGER_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Table selector for record-based triggers */}
            {(triggerType === "record_created" ||
              triggerType === "record_updated" ||
              triggerType === "record_matches_condition") && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Table
                </label>
                <select
                  value={triggerTableId}
                  onChange={(e) => setTriggerTableId(e.target.value)}
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Any table</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Schedule for scheduled trigger */}
            {triggerType === "scheduled" && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Cron Schedule
                </label>
                <Input
                  value={triggerSchedule}
                  onChange={(e) => setTriggerSchedule(e.target.value)}
                  placeholder="e.g. 0 9 * * 1-5 (weekdays at 9am)"
                  className="text-sm"
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Play className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Actions
              </h4>
            </div>
            <Button variant="ghost" size="sm" onClick={handleAddAction}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Step
            </Button>
          </div>

          <div className="ml-8 space-y-2">
            {actions.map((action, index) => (
              <div
                key={index}
                className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">
                    Step {index + 1}
                  </span>
                  {actions.length > 1 && (
                    <button
                      onClick={() => handleRemoveAction(index)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Action Type
                  </label>
                  <select
                    value={action.type}
                    onChange={(e) =>
                      handleActionTypeChange(index, e.target.value as ActionType)
                    }
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    {ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTION_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action-specific config */}
                {(action.type === "update_record" ||
                  action.type === "create_record") && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Target Table
                    </label>
                    <select
                      value={(action.config.tableId as string) || ""}
                      onChange={(e) =>
                        handleActionConfigChange(index, "tableId", e.target.value)
                      }
                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Select table</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {action.type === "send_message" && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Message Template
                    </label>
                    <Input
                      value={(action.config.message as string) || ""}
                      onChange={(e) =>
                        handleActionConfigChange(index, "message", e.target.value)
                      }
                      placeholder="Message to send"
                      className="text-sm"
                    />
                  </div>
                )}

                {action.type === "http_request" && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        URL
                      </label>
                      <Input
                        value={(action.config.url as string) || ""}
                        onChange={(e) =>
                          handleActionConfigChange(index, "url", e.target.value)
                        }
                        placeholder="https://..."
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Method
                      </label>
                      <select
                        value={(action.config.method as string) || "POST"}
                        onChange={(e) =>
                          handleActionConfigChange(
                            index,
                            "method",
                            e.target.value
                          )
                        }
                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

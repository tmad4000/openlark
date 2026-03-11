"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Plus,
  Play,
  Pause,
  Trash2,
  Settings,
  ChevronDown,
  ChevronRight,
  Clock,
  Check,
  X,
  AlertCircle,
  ArrowRight,
  FileText,
  Send,
  Globe,
  Edit3,
  RefreshCw,
  History,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Switch from "@radix-ui/react-switch";

// Types matching backend schema
interface AutomationTrigger {
  type:
    | "record_created"
    | "record_updated"
    | "record_matches_condition"
    | "scheduled"
    | "button_clicked"
    | "webhook_received";
  tableId?: string;
  fieldIds?: string[];
  condition?: {
    fieldId: string;
    op: string;
    value: unknown;
  };
  cron?: string;
  timezone?: string;
  fieldId?: string;
  webhookId?: string;
}

interface AutomationAction {
  type: "update_record" | "create_record" | "send_message" | "http_request";
  tableId?: string;
  recordId?: string;
  updates?: Record<string, unknown>;
  data?: Record<string, unknown>;
  chatId?: string;
  content?: { text: string };
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface Automation {
  id: string;
  baseId: string;
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
  type: "automation" | "workflow";
  createdAt: string;
  updatedAt: string;
}

interface AutomationRun {
  id: string;
  automationId?: string;
  automationName?: string;
  triggerEvent: {
    type: string;
    recordId?: string;
    tableId?: string;
    data?: Record<string, unknown>;
  };
  status: "pending" | "running" | "success" | "failed";
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface TableData {
  id: string;
  name: string;
  fields: FieldData[];
}

interface FieldData {
  id: string;
  name: string;
  type: string;
}

interface AutomationsPanelProps {
  baseId: string;
  tables: TableData[];
  token: string;
}

// Trigger type labels
const TRIGGER_TYPE_LABELS: Record<string, string> = {
  record_created: "When a record is created",
  record_updated: "When a record is updated",
  record_matches_condition: "When a record matches a condition",
  scheduled: "On a schedule",
  button_clicked: "When a button is clicked",
  webhook_received: "When a webhook is received",
};

// Action type labels
const ACTION_TYPE_LABELS: Record<string, string> = {
  update_record: "Update a record",
  create_record: "Create a record",
  send_message: "Send a message",
  http_request: "HTTP request",
};

// Condition operators
const CONDITION_OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "greater than or equals" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "less than or equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

export function AutomationsPanel({
  baseId,
  tables,
  token,
}: AutomationsPanelProps) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null
  );
  const [selectedAutomation, setSelectedAutomation] =
    useState<Automation | null>(null);
  const [runHistory, setRunHistory] = useState<AutomationRun[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Fetch automations
  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch(`/api/bases/${baseId}/automations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAutomations(data.automations || []);
      }
    } catch (error) {
      console.error("Failed to fetch automations:", error);
    } finally {
      setIsLoading(false);
    }
  }, [baseId, token]);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  // Toggle automation enabled/disabled
  const toggleAutomation = async (automation: Automation) => {
    try {
      const res = await fetch(`/api/automations/${automation.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: !automation.enabled }),
      });

      if (res.ok) {
        setAutomations((prev) =>
          prev.map((a) =>
            a.id === automation.id ? { ...a, enabled: !a.enabled } : a
          )
        );
      }
    } catch (error) {
      console.error("Failed to toggle automation:", error);
    }
  };

  // Delete automation
  const deleteAutomation = async (automationId: string) => {
    if (!confirm("Are you sure you want to delete this automation?")) return;

    try {
      const res = await fetch(`/api/automations/${automationId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setAutomations((prev) => prev.filter((a) => a.id !== automationId));
        if (selectedAutomation?.id === automationId) {
          setSelectedAutomation(null);
        }
      }
    } catch (error) {
      console.error("Failed to delete automation:", error);
    }
  };

  // Test run automation
  const testRunAutomation = async (automationId: string) => {
    try {
      const res = await fetch(`/api/automations/${automationId}/test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        alert(`Test run queued. Run ID: ${data.runId}`);
        // Refresh run history if automation is selected
        if (selectedAutomation?.id === automationId) {
          fetchRunHistory(automationId);
        }
      }
    } catch (error) {
      console.error("Failed to test automation:", error);
    }
  };

  // Fetch run history for an automation
  const fetchRunHistory = async (automationId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/automations/${automationId}/runs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRunHistory(data.runs || []);
      }
    } catch (error) {
      console.error("Failed to fetch run history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Select automation to view details
  const selectAutomation = (automation: Automation) => {
    setSelectedAutomation(automation);
    fetchRunHistory(automation.id);
  };

  // Handle automation created/updated
  const handleAutomationSaved = (automation: Automation) => {
    setAutomations((prev) => {
      const existing = prev.find((a) => a.id === automation.id);
      if (existing) {
        return prev.map((a) => (a.id === automation.id ? automation : a));
      }
      return [automation, ...prev];
    });
    setIsCreateDialogOpen(false);
    setEditingAutomation(null);
  };

  // Get table name by ID
  const getTableName = (tableId: string | undefined) => {
    if (!tableId) return "Unknown";
    const table = tables.find((t) => t.id === tableId);
    return table?.name || "Unknown";
  };

  // Format trigger description
  const formatTrigger = (trigger: AutomationTrigger) => {
    const label = TRIGGER_TYPE_LABELS[trigger.type] || trigger.type;
    if (trigger.tableId) {
      return `${label} in ${getTableName(trigger.tableId)}`;
    }
    if (trigger.type === "scheduled" && trigger.cron) {
      return `${label} (${trigger.cron})`;
    }
    return label;
  };

  // Format actions description
  const formatActions = (actions: AutomationAction[]) => {
    if (actions.length === 0) return "No actions";
    if (actions.length === 1) {
      return ACTION_TYPE_LABELS[actions[0].type] || actions[0].type;
    }
    return `${actions.length} actions`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Status badge component
  const StatusBadge = ({ status }: { status: AutomationRun["status"] }) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-800",
      running: "bg-blue-100 text-blue-800",
      success: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
    };

    const icons = {
      pending: <Clock className="w-3 h-3" />,
      running: <RefreshCw className="w-3 h-3 animate-spin" />,
      success: <Check className="w-3 h-3" />,
      failed: <X className="w-3 h-3" />,
    };

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
      >
        {icons[status]}
        {status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading automations...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-white">
      {/* Automations list */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Automations</h2>
            <button
              onClick={() => {
                setEditingAutomation(null);
                setIsCreateDialogOpen(true);
              }}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {automations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <Zap className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-sm">No automations yet</p>
              <button
                onClick={() => {
                  setEditingAutomation(null);
                  setIsCreateDialogOpen(true);
                }}
                className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Create your first automation
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {automations.map((automation) => (
                <div
                  key={automation.id}
                  onClick={() => selectAutomation(automation)}
                  className={`px-4 py-3 cursor-pointer hover:bg-gray-50 ${
                    selectedAutomation?.id === automation.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Zap
                          className={`w-4 h-4 flex-shrink-0 ${
                            automation.enabled
                              ? "text-yellow-500"
                              : "text-gray-400"
                          }`}
                        />
                        <span
                          className={`font-medium truncate ${
                            automation.enabled
                              ? "text-gray-900"
                              : "text-gray-500"
                          }`}
                        >
                          {automation.name}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 truncate">
                        {formatTrigger(automation.trigger)}
                      </p>
                    </div>
                    <Switch.Root
                      checked={automation.enabled}
                      onCheckedChange={() => toggleAutomation(automation)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      className={`w-9 h-5 rounded-full relative ${
                        automation.enabled ? "bg-blue-600" : "bg-gray-200"
                      }`}
                    >
                      <Switch.Thumb
                        className={`block w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          automation.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </Switch.Root>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Automation detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedAutomation ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedAutomation.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Created {formatDate(selectedAutomation.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => testRunAutomation(selectedAutomation.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    <Play className="w-4 h-4" />
                    Test Run
                  </button>
                  <button
                    onClick={() => {
                      setEditingAutomation(selectedAutomation);
                      setIsCreateDialogOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => deleteAutomation(selectedAutomation.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            </div>

            {/* Automation details */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Trigger */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Trigger
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                      <Zap className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {TRIGGER_TYPE_LABELS[selectedAutomation.trigger.type] ||
                          selectedAutomation.trigger.type}
                      </p>
                      {selectedAutomation.trigger.tableId && (
                        <p className="text-sm text-gray-500">
                          Table: {getTableName(selectedAutomation.trigger.tableId)}
                        </p>
                      )}
                      {selectedAutomation.trigger.cron && (
                        <p className="text-sm text-gray-500">
                          Schedule: {selectedAutomation.trigger.cron}
                        </p>
                      )}
                      {selectedAutomation.trigger.condition && (
                        <p className="text-sm text-gray-500">
                          Condition: Field {selectedAutomation.trigger.condition.fieldId}{" "}
                          {selectedAutomation.trigger.condition.op}{" "}
                          {JSON.stringify(selectedAutomation.trigger.condition.value)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Actions ({selectedAutomation.actions.length})
                </h3>
                <div className="space-y-3">
                  {selectedAutomation.actions.map((action, index) => (
                    <div
                      key={index}
                      className="bg-gray-50 rounded-lg p-4 flex items-center gap-3"
                    >
                      <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {ACTION_TYPE_LABELS[action.type] || action.type}
                        </p>
                        {action.tableId && (
                          <p className="text-sm text-gray-500">
                            Table: {getTableName(action.tableId)}
                          </p>
                        )}
                        {action.url && (
                          <p className="text-sm text-gray-500">
                            URL: {action.url}
                          </p>
                        )}
                        {action.content?.text && (
                          <p className="text-sm text-gray-500">
                            Message: {action.content.text}
                          </p>
                        )}
                      </div>
                      <ActionIcon type={action.type} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Run History */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Run History
                  </h3>
                  <button
                    onClick={() => fetchRunHistory(selectedAutomation.id)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                </div>

                {isLoadingHistory ? (
                  <div className="text-center py-4 text-gray-500">
                    Loading history...
                  </div>
                ) : runHistory.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <History className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No runs yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Run history will appear here after the automation runs
                    </p>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Started</th>
                          <th className="px-4 py-2 text-left">Completed</th>
                          <th className="px-4 py-2 text-left">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {runHistory.map((run) => (
                          <tr key={run.id} className="text-sm">
                            <td className="px-4 py-3">
                              <StatusBadge status={run.status} />
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {formatDate(run.startedAt)}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {run.completedAt
                                ? formatDate(run.completedAt)
                                : "-"}
                            </td>
                            <td className="px-4 py-3">
                              {run.error ? (
                                <span
                                  className="text-red-600 text-xs truncate block max-w-[200px]"
                                  title={run.error}
                                >
                                  {run.error}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Zap className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">
                Select an automation to view details
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Automation Dialog */}
      <AutomationDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        baseId={baseId}
        tables={tables}
        token={token}
        automation={editingAutomation}
        onSaved={handleAutomationSaved}
      />
    </div>
  );
}

// Action icon component
function ActionIcon({ type }: { type: AutomationAction["type"] }) {
  const icons = {
    update_record: <Edit3 className="w-4 h-4 text-gray-400" />,
    create_record: <Plus className="w-4 h-4 text-gray-400" />,
    send_message: <Send className="w-4 h-4 text-gray-400" />,
    http_request: <Globe className="w-4 h-4 text-gray-400" />,
  };
  return icons[type] || null;
}

// Automation creation/editing dialog
function AutomationDialog({
  open,
  onOpenChange,
  baseId,
  tables,
  token,
  automation,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseId: string;
  tables: TableData[];
  token: string;
  automation: Automation | null;
  onSaved: (automation: Automation) => void;
}) {
  const isEditing = !!automation;

  // Form state
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTrigger["type"]>(
    "record_created"
  );
  const [triggerTableId, setTriggerTableId] = useState("");
  const [triggerFieldIds, setTriggerFieldIds] = useState<string[]>([]);
  const [triggerCondition, setTriggerCondition] = useState({
    fieldId: "",
    op: "eq",
    value: "",
  });
  const [triggerCron, setTriggerCron] = useState("");
  const [actions, setActions] = useState<
    Array<{
      type: AutomationAction["type"];
      tableId: string;
      updates: string;
      data: string;
      chatId: string;
      messageText: string;
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      url: string;
    }>
  >([]);
  const [isSaving, setIsSaving] = useState(false);
  const [tableFields, setTableFields] = useState<FieldData[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  // Fetch table fields when trigger table changes
  useEffect(() => {
    if (!triggerTableId || !token) {
      setTableFields([]);
      return;
    }

    const fetchFields = async () => {
      setIsLoadingFields(true);
      try {
        const res = await fetch(`/api/tables/${triggerTableId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTableFields(data.fields || []);
        }
      } catch (error) {
        console.error("Failed to fetch table fields:", error);
      } finally {
        setIsLoadingFields(false);
      }
    };

    fetchFields();
  }, [triggerTableId, token]);

  // Reset form when dialog opens/closes or automation changes
  useEffect(() => {
    if (open) {
      if (automation) {
        setName(automation.name);
        setTriggerType(automation.trigger.type);
        setTriggerTableId(automation.trigger.tableId || "");
        setTriggerFieldIds(automation.trigger.fieldIds || []);
        setTriggerCondition(
          automation.trigger.condition
            ? {
                fieldId: automation.trigger.condition.fieldId,
                op: automation.trigger.condition.op,
                value: String(automation.trigger.condition.value ?? "")
              }
            : { fieldId: "", op: "eq", value: "" }
        );
        setTriggerCron(automation.trigger.cron || "");
        setActions(
          automation.actions.map((a) => ({
            type: a.type,
            tableId: a.tableId || "",
            updates: JSON.stringify(a.updates || {}, null, 2),
            data: JSON.stringify(a.data || {}, null, 2),
            chatId: a.chatId || "",
            messageText: a.content?.text || "",
            method: a.method || "POST",
            url: a.url || "",
          }))
        );
      } else {
        setName("");
        setTriggerType("record_created");
        setTriggerTableId(tables[0]?.id || "");
        setTriggerFieldIds([]);
        setTriggerCondition({ fieldId: "", op: "eq", value: "" });
        setTriggerCron("");
        setActions([]);
      }
    }
  }, [open, automation, tables]);

  // Add action
  const addAction = () => {
    setActions((prev) => [
      ...prev,
      {
        type: "update_record",
        tableId: triggerTableId,
        updates: "{}",
        data: "{}",
        chatId: "",
        messageText: "",
        method: "POST",
        url: "",
      },
    ]);
  };

  // Remove action
  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  // Update action
  const updateAction = (
    index: number,
    field: string,
    value: string | AutomationAction["type"]
  ) => {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    );
  };

  // Build trigger object
  const buildTrigger = (): AutomationTrigger => {
    const trigger: AutomationTrigger = { type: triggerType };

    if (
      triggerType === "record_created" ||
      triggerType === "record_updated" ||
      triggerType === "record_matches_condition" ||
      triggerType === "button_clicked"
    ) {
      trigger.tableId = triggerTableId;
    }

    if (triggerType === "record_updated" && triggerFieldIds.length > 0) {
      trigger.fieldIds = triggerFieldIds;
    }

    if (triggerType === "record_matches_condition" && triggerCondition.fieldId) {
      trigger.condition = {
        fieldId: triggerCondition.fieldId,
        op: triggerCondition.op,
        value: triggerCondition.value,
      };
    }

    if (triggerType === "scheduled" && triggerCron) {
      trigger.cron = triggerCron;
    }

    return trigger;
  };

  // Build actions array
  const buildActions = (): AutomationAction[] => {
    return actions.map((a) => {
      const action: AutomationAction = { type: a.type };

      if (a.type === "update_record") {
        action.tableId = a.tableId;
        try {
          action.updates = JSON.parse(a.updates);
        } catch {
          action.updates = {};
        }
      }

      if (a.type === "create_record") {
        action.tableId = a.tableId;
        try {
          action.data = JSON.parse(a.data);
        } catch {
          action.data = {};
        }
      }

      if (a.type === "send_message") {
        action.chatId = a.chatId;
        action.content = { text: a.messageText };
      }

      if (a.type === "http_request") {
        action.method = a.method;
        action.url = a.url;
      }

      return action;
    });
  };

  // Save automation
  const save = async () => {
    if (!name.trim() || actions.length === 0) return;

    setIsSaving(true);
    try {
      const body = {
        name: name.trim(),
        trigger: buildTrigger(),
        actions: buildActions(),
        enabled: automation?.enabled ?? true,
      };

      const url = isEditing
        ? `/api/automations/${automation.id}`
        : `/api/bases/${baseId}/automations`;

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const saved = await res.json();
        onSaved(saved);
      }
    } catch (error) {
      console.error("Failed to save automation:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl w-[700px] max-w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
          <Dialog.Title className="px-6 py-4 border-b border-gray-200 text-lg font-semibold text-gray-900">
            {isEditing ? "Edit Automation" : "Create Automation"}
          </Dialog.Title>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Automation"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Trigger */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Trigger
              </h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Trigger type
                  </label>
                  <select
                    value={triggerType}
                    onChange={(e) =>
                      setTriggerType(e.target.value as AutomationTrigger["type"])
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Table selector for record-based triggers */}
                {(triggerType === "record_created" ||
                  triggerType === "record_updated" ||
                  triggerType === "record_matches_condition" ||
                  triggerType === "button_clicked") && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Table
                    </label>
                    <select
                      value={triggerTableId}
                      onChange={(e) => setTriggerTableId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a table...</option>
                      {tables.map((table) => (
                        <option key={table.id} value={table.id}>
                          {table.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Field selector for record_updated */}
                {triggerType === "record_updated" && triggerTableId && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Watch specific fields (optional)
                    </label>
                    <div className="space-y-1">
                      {tableFields.map((field) => (
                        <label
                          key={field.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={triggerFieldIds.includes(field.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTriggerFieldIds((prev) => [...prev, field.id]);
                              } else {
                                setTriggerFieldIds((prev) =>
                                  prev.filter((id) => id !== field.id)
                                );
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          {field.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Condition for record_matches_condition */}
                {triggerType === "record_matches_condition" && triggerTableId && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Field
                      </label>
                      <select
                        value={triggerCondition.fieldId}
                        onChange={(e) =>
                          setTriggerCondition((prev) => ({
                            ...prev,
                            fieldId: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select field...</option>
                        {tableFields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Operator
                      </label>
                      <select
                        value={triggerCondition.op}
                        onChange={(e) =>
                          setTriggerCondition((prev) => ({
                            ...prev,
                            op: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {CONDITION_OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        Value
                      </label>
                      <input
                        type="text"
                        value={String(triggerCondition.value)}
                        onChange={(e) =>
                          setTriggerCondition((prev) => ({
                            ...prev,
                            value: e.target.value,
                          }))
                        }
                        placeholder="Value..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                {/* Cron for scheduled trigger */}
                {triggerType === "scheduled" && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">
                      Cron expression
                    </label>
                    <input
                      type="text"
                      value={triggerCron}
                      onChange={(e) => setTriggerCron(e.target.value)}
                      placeholder="0 9 * * 1-5 (weekdays at 9am)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Format: minute hour day-of-month month day-of-week
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Actions</h3>
                <button
                  onClick={addAction}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add action
                </button>
              </div>

              {actions.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <p className="text-sm text-gray-500">No actions yet</p>
                  <button
                    onClick={addAction}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                  >
                    Add your first action
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {actions.map((action, index) => (
                    <div
                      key={index}
                      className="bg-gray-50 rounded-lg p-4 relative"
                    >
                      <button
                        onClick={() => removeAction(index)}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                          {index + 1}
                        </span>
                        <select
                          value={action.type}
                          onChange={(e) =>
                            updateAction(
                              index,
                              "type",
                              e.target.value as AutomationAction["type"]
                            )
                          }
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          {Object.entries(ACTION_TYPE_LABELS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      {/* Action-specific fields */}
                      {(action.type === "update_record" ||
                        action.type === "create_record") && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Table
                            </label>
                            <select
                              value={action.tableId}
                              onChange={(e) =>
                                updateAction(index, "tableId", e.target.value)
                              }
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            >
                              <option value="">Select table...</option>
                              {tables.map((table) => (
                                <option key={table.id} value={table.id}>
                                  {table.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              {action.type === "update_record"
                                ? "Updates (JSON)"
                                : "Data (JSON)"}
                            </label>
                            <textarea
                              value={
                                action.type === "update_record"
                                  ? action.updates
                                  : action.data
                              }
                              onChange={(e) =>
                                updateAction(
                                  index,
                                  action.type === "update_record"
                                    ? "updates"
                                    : "data",
                                  e.target.value
                                )
                              }
                              placeholder='{"fieldId": "value"}'
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono h-20"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Use {"{{record.fieldId}}"} to reference trigger record
                              fields
                            </p>
                          </div>
                        </div>
                      )}

                      {action.type === "send_message" && (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Chat ID
                            </label>
                            <input
                              type="text"
                              value={action.chatId}
                              onChange={(e) =>
                                updateAction(index, "chatId", e.target.value)
                              }
                              placeholder="Chat ID"
                              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Message
                            </label>
                            <textarea
                              value={action.messageText}
                              onChange={(e) =>
                                updateAction(index, "messageText", e.target.value)
                              }
                              placeholder="Message text..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm h-20"
                            />
                          </div>
                        </div>
                      )}

                      {action.type === "http_request" && (
                        <div className="space-y-3">
                          <div className="flex gap-3">
                            <div className="w-28">
                              <label className="block text-xs text-gray-500 mb-1">
                                Method
                              </label>
                              <select
                                value={action.method}
                                onChange={(e) =>
                                  updateAction(index, "method", e.target.value)
                                }
                                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="PATCH">PATCH</option>
                                <option value="DELETE">DELETE</option>
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs text-gray-500 mb-1">
                                URL
                              </label>
                              <input
                                type="text"
                                value={action.url}
                                onChange={(e) =>
                                  updateAction(index, "url", e.target.value)
                                }
                                placeholder="https://api.example.com/webhook"
                                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!name.trim() || actions.length === 0 || isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : isEditing ? "Update" : "Create"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

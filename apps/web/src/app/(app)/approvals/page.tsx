"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  api,
  type ApprovalRequest,
  type ApprovalTemplate,
  type ApprovalStep,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  Plus,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  Loader2,
  X,
  FileText,
} from "lucide-react";

type TabMode = "my_requests" | "pending_review" | "completed";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabMode, setTabMode] = useState<TabMode>("my_requests");
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [reqRes, tmplRes] = await Promise.all([
        api.getApprovalRequests({ limit: 100 }),
        api.getApprovalTemplates(),
      ]);
      setRequests(reqRes.requests);
      setTemplates(tmplRes.templates);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter requests by tab
  const filteredRequests = useMemo(() => {
    if (!user) return [];
    switch (tabMode) {
      case "my_requests":
        return requests.filter((r) => r.requesterId === user.id);
      case "pending_review":
        return requests.filter(
          (r) =>
            r.status === "pending" &&
            r.requesterId !== user.id &&
            r.steps?.some(
              (s) => s.status === "pending" && s.approverIds.includes(user.id)
            )
        );
      case "completed":
        return requests.filter(
          (r) => r.status === "approved" || r.status === "rejected"
        );
      default:
        return requests;
    }
  }, [requests, tabMode, user]);

  const handleSelectRequest = useCallback(
    async (req: ApprovalRequest) => {
      try {
        const res = await api.getApprovalRequest(req.id);
        setSelectedRequest(res.request);
      } catch {
        setSelectedRequest(req);
      }
    },
    []
  );

  const handleDecide = useCallback(
    async (
      requestId: string,
      stepId: string,
      decision: "approve" | "reject",
      comment?: string
    ) => {
      try {
        await api.decideApprovalStep(requestId, stepId, { decision, comment });
        await loadData();
        // Refresh selected request
        const res = await api.getApprovalRequest(requestId);
        setSelectedRequest(res.request);
      } catch {
        // ignore
      }
    },
    [loadData]
  );

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Approvals
          </h2>
        </div>
        <Button
          onClick={() => setShowSubmitForm(true)}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New request
        </Button>
      </div>

      <div className="p-2 space-y-0.5">
        <button
          onClick={() => setTabMode("my_requests")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            tabMode === "my_requests"
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <Send className="w-4 h-4" />
          My Requests
          <span className="ml-auto text-xs text-gray-400">
            {user ? requests.filter((r) => r.requesterId === user.id).length : 0}
          </span>
        </button>
        <button
          onClick={() => setTabMode("pending_review")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            tabMode === "pending_review"
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <Clock className="w-4 h-4" />
          Pending Review
          <span className="ml-auto text-xs text-gray-400">
            {user
              ? requests.filter(
                  (r) =>
                    r.status === "pending" &&
                    r.requesterId !== user.id &&
                    r.steps?.some(
                      (s) =>
                        s.status === "pending" &&
                        s.approverIds.includes(user.id)
                    )
                ).length
              : 0}
          </span>
        </button>
        <button
          onClick={() => setTabMode("completed")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            tabMode === "completed"
              ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium"
              : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <CheckCircle className="w-4 h-4" />
          Completed
          <span className="ml-auto text-xs text-gray-400">
            {requests.filter(
              (r) => r.status === "approved" || r.status === "rejected"
            ).length}
          </span>
        </button>
      </div>

      <div className="flex-1" />
    </div>
  );

  const rightPanel = selectedRequest ? (
    <ApprovalDetailPanel
      request={selectedRequest}
      currentUserId={user?.id ?? ""}
      onClose={() => setSelectedRequest(null)}
      onDecide={handleDecide}
    />
  ) : undefined;

  return (
    <AppShell sidebar={sidebar} rightPanel={rightPanel}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tabMode === "my_requests"
              ? "My Requests"
              : tabMode === "pending_review"
                ? "Pending Review"
                : "Completed"}
          </h1>
        </div>

        {/* Submit form */}
        {showSubmitForm && (
          <SubmitRequestForm
            templates={templates}
            onSubmitted={() => {
              setShowSubmitForm(false);
              loadData();
            }}
            onCancel={() => setShowSubmitForm(false)}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <ClipboardCheck className="w-10 h-10 mb-2" />
            <p className="text-sm">No approval requests</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {filteredRequests.map((req) => (
              <button
                key={req.id}
                onClick={() => handleSelectRequest(req)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors",
                  selectedRequest?.id === req.id &&
                    "bg-blue-50 dark:bg-blue-950/20"
                )}
              >
                <StatusIcon status={req.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {req.template?.name ?? "Approval Request"}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {new Date(req.createdAt).toLocaleDateString()} &middot;{" "}
                    <StatusLabel status={req.status} />
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// --- Sub-components ---

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "approved":
      return <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />;
    case "rejected":
      return <XCircle className="w-5 h-5 text-red-500 shrink-0" />;
    case "cancelled":
      return <XCircle className="w-5 h-5 text-gray-400 shrink-0" />;
    default:
      return <Clock className="w-5 h-5 text-amber-500 shrink-0" />;
  }
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  return <span>{labels[status] ?? status}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        styles[status] ?? styles.pending
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// --- Submit Request Form ---

function SubmitRequestForm({
  templates,
  onSubmitted,
  onCancel,
}: {
  templates: ApprovalTemplate[];
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Extract form fields from template formSchema
  const formFields = useMemo(() => {
    if (!selectedTemplate?.formSchema) return [];
    const schema = selectedTemplate.formSchema as Record<
      string,
      { type?: string; label?: string }
    >;
    return Object.entries(schema).map(([key, config]) => ({
      key,
      label: config?.label ?? key,
      type: config?.type ?? "text",
    }));
  }, [selectedTemplate]);

  const handleSubmit = async () => {
    if (!selectedTemplateId) return;
    try {
      setSubmitting(true);
      await api.createApprovalRequest({
        templateId: selectedTemplateId,
        formData: formData as unknown as Record<string, unknown>,
      });
      onSubmitted();
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
          Submit Approval Request
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Template selection */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Template
        </label>
        <select
          value={selectedTemplateId}
          onChange={(e) => {
            setSelectedTemplateId(e.target.value);
            setFormData({});
          }}
          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
        >
          <option value="">Select a template...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.category ? ` (${t.category})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Dynamic form fields */}
      {formFields.map((field) => (
        <div key={field.key} className="mb-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {field.label}
          </label>
          <input
            type={field.type === "number" ? "number" : "text"}
            value={formData[field.key] ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
      ))}

      <div className="flex gap-2">
        <Button
          onClick={handleSubmit}
          disabled={!selectedTemplateId || submitting}
          size="sm"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Submit
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// --- Approval Detail Panel ---

function ApprovalDetailPanel({
  request,
  currentUserId,
  onClose,
  onDecide,
}: {
  request: ApprovalRequest;
  currentUserId: string;
  onClose: () => void;
  onDecide: (
    requestId: string,
    stepId: string,
    decision: "approve" | "reject",
    comment?: string
  ) => void;
}) {
  const [comment, setComment] = useState("");
  const [decidingStepId, setDecidingStepId] = useState<string | null>(null);

  const handleDecide = async (stepId: string, decision: "approve" | "reject") => {
    setDecidingStepId(stepId);
    await onDecide(request.id, stepId, decision, comment || undefined);
    setComment("");
    setDecidingStepId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {request.template?.name ?? "Approval Request"}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Status</p>
          <StatusBadge status={request.status} />
        </div>

        {/* Submitted date */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Submitted</p>
          <p className="text-sm text-gray-900 dark:text-gray-100">
            {new Date(request.createdAt).toLocaleString()}
          </p>
        </div>

        {/* Form data */}
        {request.formData && Object.keys(request.formData).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Form Data</p>
            <div className="space-y-2 bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              {Object.entries(request.formData).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-gray-500">{key}</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {String(value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Workflow Timeline */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            Workflow Progress
          </p>
          <div className="space-y-0">
            {(request.steps ?? [])
              .sort((a, b) => a.stepIndex - b.stepIndex)
              .map((step, idx, arr) => (
                <StepTimelineItem
                  key={step.id}
                  step={step}
                  stepNumber={idx + 1}
                  isLast={idx === arr.length - 1}
                  currentUserId={currentUserId}
                  requestStatus={request.status}
                  comment={comment}
                  onCommentChange={setComment}
                  decidingStepId={decidingStepId}
                  onDecide={handleDecide}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Step Timeline Item ---

function StepTimelineItem({
  step,
  stepNumber,
  isLast,
  currentUserId,
  requestStatus,
  comment,
  onCommentChange,
  decidingStepId,
  onDecide,
}: {
  step: ApprovalStep;
  stepNumber: number;
  isLast: boolean;
  currentUserId: string;
  requestStatus: string;
  comment: string;
  onCommentChange: (v: string) => void;
  decidingStepId: string | null;
  onDecide: (stepId: string, decision: "approve" | "reject") => void;
}) {
  const canDecide =
    step.status === "pending" &&
    requestStatus === "pending" &&
    step.approverIds.includes(currentUserId);
  const isDeciding = decidingStepId === step.id;

  return (
    <div className="flex gap-3">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
            step.status === "approved"
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
              : step.status === "rejected"
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
          )}
        >
          {step.status === "approved" ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : step.status === "rejected" ? (
            <XCircle className="w-3.5 h-3.5" />
          ) : (
            stepNumber
          )}
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-0.5 flex-1 min-h-[24px]",
              step.status !== "pending"
                ? "bg-gray-300 dark:bg-gray-600"
                : "bg-gray-200 dark:bg-gray-700"
            )}
          />
        )}
      </div>

      {/* Step content */}
      <div className={cn("pb-4 flex-1", isLast && "pb-0")}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Step {stepNumber}
          </span>
          <StatusBadge status={step.status} />
          <span className="text-xs text-gray-400">
            ({step.type})
          </span>
        </div>

        <p className="text-xs text-gray-500 mb-1">
          {step.approverIds.length} approver{step.approverIds.length !== 1 && "s"}
        </p>

        {step.decidedAt && (
          <p className="text-xs text-gray-400">
            Decided: {new Date(step.decidedAt).toLocaleString()}
          </p>
        )}

        {step.comment && (
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded p-2">
            &ldquo;{step.comment}&rdquo;
          </div>
        )}

        {/* Decision buttons */}
        {canDecide && (
          <div className="mt-2 space-y-2">
            <textarea
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Add a comment (optional)"
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onDecide(step.id, "approve")}
                disabled={isDeciding}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isDeciding ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDecide(step.id, "reject")}
                disabled={isDeciding}
                className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20"
              >
                {isDeciding ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                )}
                Reject
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Send,
  X,
  FileCheck,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

// Types
type TabId = "my_requests" | "pending_review" | "completed";
type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
type StepStatus = "pending" | "approved" | "rejected";

interface ApprovalTemplate {
  id: string;
  orgId: string;
  name: string;
  formSchema: FormSchema;
  workflow: WorkflowStep[];
  category: string | null;
  createdAt: string;
}

interface FormSchema {
  fields?: FormField[];
  [key: string]: unknown;
}

interface FormField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "date";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

interface WorkflowStep {
  approver_type: "user" | "role" | "department";
  approver_id: string;
  type: "sequential" | "parallel";
}

interface ApprovalStep {
  id: string;
  requestId: string;
  stepIndex: number;
  approverIds: string[];
  type: "sequential" | "parallel";
  status: StepStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
}

interface ApprovalRequest {
  id: string;
  templateId: string;
  requesterId: string;
  formData: Record<string, unknown>;
  status: RequestStatus;
  createdAt: string;
  steps?: ApprovalStep[];
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_CONFIG: Record<
  RequestStatus,
  { label: string; color: string; bg: string; icon: typeof Clock }
> = {
  pending: {
    label: "Pending",
    color: "text-amber-600",
    bg: "bg-amber-50",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "text-green-600",
    bg: "bg-green-50",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    color: "text-red-600",
    bg: "bg-red-50",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    color: "text-gray-500",
    bg: "bg-gray-50",
    icon: AlertCircle,
  },
};

const STEP_STATUS_CONFIG: Record<
  StepStatus,
  { label: string; color: string; borderColor: string; bgColor: string }
> = {
  pending: {
    label: "Pending",
    color: "text-amber-600",
    borderColor: "border-amber-300",
    bgColor: "bg-amber-50",
  },
  approved: {
    label: "Approved",
    color: "text-green-600",
    borderColor: "border-green-400",
    bgColor: "bg-green-50",
  },
  rejected: {
    label: "Rejected",
    color: "text-red-600",
    borderColor: "border-red-400",
    bgColor: "bg-red-50",
  },
};

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("my_requests");
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [templates, setTemplates] = useState<ApprovalTemplate[]>([]);
  const [selectedRequest, setSelectedRequest] =
    useState<ApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [decisionComment, setDecisionComment] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const token = getCookie("session_token");
    if (!token) return;

    setLoading(true);
    try {
      const [reqRes, tplRes, meRes] = await Promise.all([
        fetch("/api/approvals/requests", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/approvals/templates", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (reqRes.ok) {
        const data = await reqRes.json();
        setRequests(data.requests || []);
      }
      if (tplRes.ok) {
        const data = await tplRes.json();
        setTemplates(data.templates || []);
      }
      if (meRes.ok) {
        const data = await meRes.json();
        setCurrentUserId(data.user?.id || null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchRequestDetail = async (requestId: string) => {
    const token = getCookie("session_token");
    if (!token) return;

    try {
      const res = await fetch(`/api/approvals/requests/${requestId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRequest(data.request);
      }
    } catch {
      // silent
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedTemplateId) return;
    const token = getCookie("session_token");
    if (!token) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/approvals/requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          form_data: formValues,
        }),
      });

      if (res.ok) {
        setShowSubmitForm(false);
        setSelectedTemplateId(null);
        setFormValues({});
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (
    decision: "approve" | "reject",
    stepId: string
  ) => {
    if (!selectedRequest) return;
    const token = getCookie("session_token");
    if (!token) return;

    setDeciding(true);
    try {
      const res = await fetch(
        `/api/approvals/requests/${selectedRequest.id}/steps/${stepId}/decide`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision,
            comment: decisionComment || undefined,
          }),
        }
      );

      if (res.ok) {
        setDecisionComment("");
        await fetchRequestDetail(selectedRequest.id);
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setDeciding(false);
    }
  };

  const getTemplateName = (templateId: string): string => {
    const tpl = templates.find((t) => t.id === templateId);
    return tpl?.name || "Unknown Template";
  };

  const getTemplateSchema = (
    templateId: string
  ): FormSchema => {
    const tpl = templates.find((t) => t.id === templateId);
    return (tpl?.formSchema as FormSchema) || {};
  };

  // Filter requests based on active tab
  const filteredRequests = requests.filter((req) => {
    if (activeTab === "my_requests") {
      return req.requesterId === currentUserId && req.status === "pending";
    }
    if (activeTab === "pending_review") {
      return req.status === "pending" && req.requesterId !== currentUserId;
    }
    if (activeTab === "completed") {
      return req.status === "approved" || req.status === "rejected";
    }
    return true;
  });

  const selectedTemplate = templates.find(
    (t) => t.id === selectedTemplateId
  );
  const formFields: FormField[] =
    (selectedTemplate?.formSchema as FormSchema)?.fields || [];

  const tabs: { id: TabId; label: string; count: number }[] = [
    {
      id: "my_requests",
      label: "My Requests",
      count: requests.filter(
        (r) => r.requesterId === currentUserId && r.status === "pending"
      ).length,
    },
    {
      id: "pending_review",
      label: "Pending Review",
      count: requests.filter(
        (r) => r.status === "pending" && r.requesterId !== currentUserId
      ).length,
    },
    {
      id: "completed",
      label: "Completed",
      count: requests.filter(
        (r) => r.status === "approved" || r.status === "rejected"
      ).length,
    },
  ];

  // Find the pending step that current user can approve
  const getPendingStepForUser = (
    steps: ApprovalStep[] | undefined
  ): ApprovalStep | null => {
    if (!steps || !currentUserId) return null;
    return (
      steps.find(
        (s) =>
          s.status === "pending" && s.approverIds.includes(currentUserId)
      ) || null
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileCheck className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900">Approvals</h1>
          </div>
          <button
            onClick={() => {
              setShowSubmitForm(true);
              setSelectedRequest(null);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Request
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedRequest(null);
                setShowSubmitForm(false);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Request List */}
        <div
          className={`${
            selectedRequest || showSubmitForm ? "w-1/2" : "w-full"
          } border-r border-gray-200 overflow-y-auto`}
        >
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              Loading...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <FileCheck className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm">
                {activeTab === "my_requests"
                  ? "No pending requests"
                  : activeTab === "pending_review"
                    ? "No requests awaiting your review"
                    : "No completed requests"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredRequests.map((req) => {
                const statusConfig = STATUS_CONFIG[req.status];
                const StatusIcon = statusConfig.icon;
                const isSelected = selectedRequest?.id === req.id;

                return (
                  <button
                    key={req.id}
                    onClick={() => {
                      setShowSubmitForm(false);
                      fetchRequestDetail(req.id);
                    }}
                    className={`w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 ${
                      isSelected ? "bg-blue-50" : ""
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${statusConfig.bg}`}
                    >
                      <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {getTemplateName(req.templateId)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(req.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${statusConfig.bg} ${statusConfig.color}`}
                    >
                      {statusConfig.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedRequest && !showSubmitForm && (
          <div className="w-1/2 overflow-y-auto">
            <RequestDetailPanel
              request={selectedRequest}
              templateName={getTemplateName(selectedRequest.templateId)}
              formSchema={getTemplateSchema(selectedRequest.templateId)}
              currentUserId={currentUserId}
              decisionComment={decisionComment}
              deciding={deciding}
              onDecisionCommentChange={setDecisionComment}
              onDecision={handleDecision}
              onClose={() => setSelectedRequest(null)}
              getPendingStepForUser={getPendingStepForUser}
            />
          </div>
        )}

        {/* Submit Form Panel */}
        {showSubmitForm && (
          <div className="w-1/2 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  New Approval Request
                </h2>
                <button
                  onClick={() => {
                    setShowSubmitForm(false);
                    setSelectedTemplateId(null);
                    setFormValues({});
                  }}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Template Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Template
                </label>
                {templates.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No templates available. An admin must create approval
                    templates first.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => {
                          setSelectedTemplateId(tpl.id);
                          setFormValues({});
                        }}
                        className={`w-full p-3 text-left rounded-lg border transition-colors ${
                          selectedTemplateId === tpl.id
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {tpl.name}
                        </p>
                        {tpl.category && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {tpl.category}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Form Fields */}
              {selectedTemplate && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-700">
                    Fill out request details
                  </h3>
                  {formFields.length > 0 ? (
                    formFields.map((field) => (
                      <div key={field.name}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                          {field.required && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </label>
                        {field.type === "textarea" ? (
                          <textarea
                            value={formValues[field.name] || ""}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [field.name]: e.target.value,
                              }))
                            }
                            placeholder={field.placeholder}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        ) : field.type === "select" ? (
                          <select
                            value={formValues[field.name] || ""}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [field.name]: e.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select...</option>
                            {field.options?.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                            value={formValues[field.name] || ""}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [field.name]: e.target.value,
                              }))
                            }
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">
                      This template has no form fields. Submit to start the
                      approval workflow.
                    </p>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmitRequest}
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                  >
                    <Send className="w-4 h-4" />
                    {submitting ? "Submitting..." : "Submit Request"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Detail Panel Component ---

function RequestDetailPanel({
  request,
  templateName,
  formSchema,
  currentUserId,
  decisionComment,
  deciding,
  onDecisionCommentChange,
  onDecision,
  onClose,
  getPendingStepForUser,
}: {
  request: ApprovalRequest;
  templateName: string;
  formSchema: FormSchema;
  currentUserId: string | null;
  decisionComment: string;
  deciding: boolean;
  onDecisionCommentChange: (v: string) => void;
  onDecision: (decision: "approve" | "reject", stepId: string) => void;
  onClose: () => void;
  getPendingStepForUser: (steps: ApprovalStep[] | undefined) => ApprovalStep | null;
}) {
  const statusConfig = STATUS_CONFIG[request.status];
  const StatusIcon = statusConfig.icon;
  const pendingStep = getPendingStepForUser(request.steps);
  const fields: FormField[] = formSchema?.fields || [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {templateName}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Submitted {formatDateTime(request.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full ${statusConfig.bg} ${statusConfig.color}`}
          >
            <StatusIcon className="w-4 h-4" />
            {statusConfig.label}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Form Data */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Request Details
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          {Object.keys(request.formData).length === 0 ? (
            <p className="text-sm text-gray-500">No form data submitted</p>
          ) : (
            Object.entries(request.formData).map(([key, value]) => {
              const fieldDef = fields.find((f) => f.name === key);
              return (
                <div key={key}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {fieldDef?.label || key}
                  </p>
                  <p className="text-sm text-gray-900 mt-0.5">
                    {String(value)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Workflow Progress Timeline */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Workflow Progress
        </h3>
        {request.steps && request.steps.length > 0 ? (
          <div className="space-y-0">
            {request.steps.map((step, idx) => {
              const stepConfig = STEP_STATUS_CONFIG[step.status];
              const isLast = idx === request.steps!.length - 1;

              return (
                <div key={step.id} className="flex gap-3">
                  {/* Timeline line + circle */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${stepConfig.borderColor} ${stepConfig.bgColor}`}
                    >
                      {step.status === "approved" ? (
                        <CheckCircle2
                          className={`w-4 h-4 ${stepConfig.color}`}
                        />
                      ) : step.status === "rejected" ? (
                        <XCircle className={`w-4 h-4 ${stepConfig.color}`} />
                      ) : (
                        <Clock className={`w-4 h-4 ${stepConfig.color}`} />
                      )}
                    </div>
                    {!isLast && (
                      <div className="w-0.5 h-12 bg-gray-200 my-1" />
                    )}
                  </div>

                  {/* Step content */}
                  <div className="pb-6 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        Step {step.stepIndex + 1}
                      </p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${stepConfig.bgColor} ${stepConfig.color}`}
                      >
                        {stepConfig.label}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">
                        ({step.type})
                      </span>
                    </div>
                    {step.decidedAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        Decided {formatDateTime(step.decidedAt)}
                      </p>
                    )}
                    {step.comment && (
                      <div className="mt-2 flex items-start gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg p-2">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                        <p>{step.comment}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No workflow steps defined</p>
        )}
      </div>

      {/* Decision Actions */}
      {pendingStep && request.status === "pending" && (
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Your Decision
          </h3>
          <textarea
            value={decisionComment}
            onChange={(e) => onDecisionCommentChange(e.target.value)}
            placeholder="Add a comment (optional)"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
          />
          <div className="flex gap-3">
            <button
              onClick={() => onDecision("approve", pendingStep.id)}
              disabled={deciding}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {deciding ? "Processing..." : "Approve"}
            </button>
            <button
              onClick={() => onDecision("reject", pendingStep.id)}
              disabled={deciding}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              {deciding ? "Processing..." : "Reject"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check, X, Clock, FileText, Loader2 } from "lucide-react";

interface ApprovalCardContent {
  card_type: "approval";
  approval_request_id: string;
  step_id: string;
  template_name: string;
  requester_name: string;
  form_data: Record<string, unknown>;
  status: string;
  decided_by_name?: string;
  decided_comment?: string;
}

interface ApprovalCardProps {
  content: ApprovalCardContent;
  isCurrentUserApprover: boolean;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function ApprovalCard({ content, isCurrentUserApprover }: ApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState(content.status);
  const [localDecider, setLocalDecider] = useState(content.decided_by_name);
  const [localComment, setLocalComment] = useState(content.decided_comment);

  const status = localStatus;
  const isPending = status === "pending";

  const handleDecision = async (decision: "approve" | "reject") => {
    setLoading(true);
    try {
      const token = getCookie("token");
      const res = await fetch(
        `${API_BASE}/approvals/requests/${content.approval_request_id}/steps/${content.step_id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ decision }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setLocalStatus(data.request.status);
        setLocalDecider("You");
        setLocalComment(undefined);
      }
    } catch {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  };

  // Extract key form fields to display (up to 4)
  const formEntries = Object.entries(content.form_data || {}).slice(0, 4);

  const statusConfig = {
    pending: { color: "bg-amber-50 border-amber-200", icon: Clock, iconColor: "text-amber-500", label: "Pending Approval" },
    approved: { color: "bg-green-50 border-green-200", icon: Check, iconColor: "text-green-600", label: "Approved" },
    rejected: { color: "bg-red-50 border-red-200", icon: X, iconColor: "text-red-600", label: "Rejected" },
    cancelled: { color: "bg-gray-50 border-gray-200", icon: X, iconColor: "text-gray-500", label: "Cancelled" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <div className={`rounded-lg border-2 ${config.color} p-4 max-w-sm`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-md ${status === "pending" ? "bg-amber-100" : status === "approved" ? "bg-green-100" : "bg-red-100"}`}>
          <FileText className="w-4 h-4 text-gray-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 truncate">{content.template_name}</div>
          <div className="text-xs text-gray-500">From {content.requester_name}</div>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium ${config.iconColor}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {config.label}
        </div>
      </div>

      {/* Form fields */}
      {formEntries.length > 0 && (
        <div className="bg-white/60 rounded-md p-2.5 mb-3 space-y-1.5">
          {formEntries.map(([key, value]) => (
            <div key={key} className="flex justify-between text-xs">
              <span className="text-gray-500 capitalize">{key.replace(/_/g, " ")}</span>
              <span className="text-gray-800 font-medium truncate ml-2 max-w-[60%] text-right">
                {String(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Decision info */}
      {!isPending && localDecider && (
        <div className="text-xs text-gray-600 mb-2">
          <span className="font-medium">{localDecider}</span>{" "}
          {status === "approved" ? "approved" : "rejected"} this request
          {localComment && (
            <span className="block mt-1 italic text-gray-500">&quot;{localComment}&quot;</span>
          )}
        </div>
      )}

      {/* Action buttons */}
      {isPending && isCurrentUserApprover && (
        <div className="flex gap-2">
          <button
            onClick={() => handleDecision("reject")}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            Reject
          </button>
          <button
            onClick={() => handleDecision("approve")}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Approve
          </button>
        </div>
      )}
    </div>
  );
}

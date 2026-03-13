"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Circle, CircleCheck, CircleDot, Loader2, X } from "lucide-react";

interface ReadInfo {
  userId: string;
  readAt: string;
}

export type ReadStatus = "unread" | "partial" | "all_read";

interface ReadReceiptIndicatorProps {
  messageId: string;
  readStatus: ReadStatus;
  readCount: number;
  totalMembers: number;
  senderMap?: Map<string, { displayName: string | null; avatarUrl: string | null }>;
}

export function ReadReceiptIndicator({
  messageId,
  readStatus,
  readCount,
  totalMembers,
  senderMap,
}: ReadReceiptIndicatorProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [receipts, setReceipts] = useState<ReadInfo[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (showPopover) {
      setShowPopover(false);
      return;
    }

    setShowPopover(true);
    if (!receipts) {
      setIsLoading(true);
      try {
        const data = await api.getReadReceipts(messageId);
        setReceipts(data.receipts);
      } catch {
        setReceipts([]);
      } finally {
        setIsLoading(false);
      }
    }
  }, [showPopover, receipts, messageId]);

  const icon = readStatus === "all_read" ? (
    <CircleCheck className="h-3 w-3 text-green-500" />
  ) : readStatus === "partial" ? (
    <CircleDot className="h-3 w-3 text-green-400" />
  ) : (
    <Circle className="h-3 w-3 text-gray-400" />
  );

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={handleClick}
        className="inline-flex items-center hover:opacity-80 cursor-pointer"
        title={
          readStatus === "all_read"
            ? `Read by all (${readCount})`
            : readStatus === "partial"
              ? `Read by ${readCount} of ${totalMembers}`
              : "Not yet read"
        }
      >
        {icon}
      </button>

      {showPopover && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPopover(false)}
          />
          {/* Popover */}
          <div className="absolute bottom-full right-0 mb-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[200px] max-w-[280px]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Read by {readCount} of {totalMembers}
              </span>
              <button
                onClick={() => setShowPopover(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : receipts && receipts.length > 0 ? (
                <ul className="space-y-1">
                  {receipts.map((r) => {
                    const info = senderMap?.get(r.userId);
                    return (
                      <li
                        key={r.userId}
                        className="flex items-center justify-between px-2 py-1 text-xs"
                      >
                        <span className={cn(
                          "text-gray-800 dark:text-gray-200 truncate",
                        )}>
                          {info?.displayName || `User ${r.userId.slice(0, 8)}`}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 ml-2 flex-shrink-0">
                          {new Date(r.readAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">
                  No one has read this yet
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

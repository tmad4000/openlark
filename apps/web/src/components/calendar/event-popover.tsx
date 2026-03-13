"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Clock, MapPin, X } from "lucide-react";
import type { CalendarEvent } from "@/lib/api";

interface EventPopoverProps {
  event: CalendarEvent;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onViewDetails: (event: CalendarEvent) => void;
}

export function EventPopover({
  event,
  anchorRect,
  onClose,
  onViewDetails,
}: EventPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  const start = new Date(event.startTime);
  const end = new Date(event.endTime);

  const dateStr = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const timeStr = `${start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })} - ${end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;

  // Position popover near the anchor
  const style: React.CSSProperties = {
    position: "fixed",
    top: anchorRect.bottom + 4,
    left: Math.min(anchorRect.left, window.innerWidth - 320),
    zIndex: 50,
  };

  // If popover would go below viewport, show above
  if (anchorRect.bottom + 200 > window.innerHeight) {
    style.top = anchorRect.top - 200;
  }

  return (
    <div
      ref={ref}
      style={style}
      className="w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
    >
      {/* Header */}
      <div className="flex items-start justify-between p-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start gap-2 min-w-0">
          <div className="w-3 h-3 rounded-sm bg-blue-500 mt-1 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {event.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Details */}
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <div>
            <div>{dateStr}</div>
            <div className="text-xs text-gray-500">{timeStr}</div>
          </div>
        </div>

        {event.location && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {event.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 pt-1">
            {event.description}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 pb-3">
        <button
          onClick={() => onViewDetails(event)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          View details
        </button>
      </div>
    </div>
  );
}

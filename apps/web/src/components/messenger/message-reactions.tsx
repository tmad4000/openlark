"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { SmilePlus } from "lucide-react";
import { api, type MessageReaction } from "@/lib/api";

// 5 most common quick reactions
const QUICK_EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDC4F"];

// Extended emoji palette
const EXTENDED_EMOJIS = [
  "\uD83D\uDC4D", "\uD83D\uDC4E", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDC4F",
  "\uD83C\uDF89", "\uD83D\uDD25", "\uD83D\uDCAF", "\uD83E\uDD14", "\uD83D\uDE22", "\uD83D\uDE21",
  "\uD83D\uDE0D", "\uD83D\uDE0E", "\uD83D\uDE4F", "\uD83D\uDC4C", "\uD83D\uDCAA", "\uD83D\uDE80",
  "\u2705", "\u274C", "\uD83D\uDC40", "\uD83D\uDE0A", "\uD83E\uDD17", "\uD83D\uDE33",
];

// Grouped reactions: emoji -> { count, userIds, reactedByMe }
export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  reactedByMe: boolean;
}

export function groupReactions(
  reactions: MessageReaction[],
  currentUserId: string
): ReactionGroup[] {
  const groups = new Map<string, { userIds: string[]; reactedByMe: boolean }>();

  for (const r of reactions) {
    const existing = groups.get(r.emoji);
    if (existing) {
      existing.userIds.push(r.userId);
      if (r.userId === currentUserId) existing.reactedByMe = true;
    } else {
      groups.set(r.emoji, {
        userIds: [r.userId],
        reactedByMe: r.userId === currentUserId,
      });
    }
  }

  return Array.from(groups.entries()).map(([emoji, { userIds, reactedByMe }]) => ({
    emoji,
    count: userIds.length,
    userIds,
    reactedByMe,
  }));
}

interface QuickReactionPickerProps {
  onSelect: (emoji: string) => void;
  onExpand: () => void;
}

function QuickReactionPicker({ onSelect, onExpand }: QuickReactionPickerProps) {
  return (
    <div className="flex items-center gap-0.5 bg-white dark:bg-gray-700 rounded-full shadow-lg border border-gray-200 dark:border-gray-600 px-1 py-0.5">
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full w-7 h-7 flex items-center justify-center text-base transition-colors"
        >
          {emoji}
        </button>
      ))}
      <button
        onClick={onExpand}
        className="hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full w-7 h-7 flex items-center justify-center text-gray-400 transition-colors"
      >
        <SmilePlus className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ExpandedEmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

function ExpandedEmojiPicker({ onSelect, onClose }: ExpandedEmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 p-2 grid grid-cols-6 gap-0.5 w-[210px]"
    >
      {EXTENDED_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="hover:bg-gray-100 dark:hover:bg-gray-600 rounded w-8 h-8 flex items-center justify-center text-lg transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

interface ReactionPickerProps {
  messageId: string;
  existingReactions: ReactionGroup[];
  currentUserId: string;
  onReactionToggle: (messageId: string, emoji: string, add: boolean) => void;
}

export function ReactionPicker({
  messageId,
  existingReactions,
  currentUserId,
  onReactionToggle,
}: ReactionPickerProps) {
  const [showExpanded, setShowExpanded] = useState(false);

  const handleSelect = useCallback(
    (emoji: string) => {
      const existing = existingReactions.find((r) => r.emoji === emoji);
      const alreadyReacted = existing?.reactedByMe ?? false;
      onReactionToggle(messageId, emoji, !alreadyReacted);
    },
    [messageId, existingReactions, onReactionToggle]
  );

  return (
    <div className="relative">
      {showExpanded ? (
        <ExpandedEmojiPicker
          onSelect={handleSelect}
          onClose={() => setShowExpanded(false)}
        />
      ) : (
        <QuickReactionPicker
          onSelect={handleSelect}
          onExpand={() => setShowExpanded(true)}
        />
      )}
    </div>
  );
}

interface ReactionDisplayProps {
  reactions: ReactionGroup[];
  messageId: string;
  onReactionToggle: (messageId: string, emoji: string, add: boolean) => void;
  senderMap?: Map<string, { displayName: string | null; avatarUrl: string | null }>;
}

export function ReactionDisplay({
  reactions,
  messageId,
  onReactionToggle,
  senderMap,
}: ReactionDisplayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((group) => (
        <button
          key={group.emoji}
          onClick={() =>
            onReactionToggle(messageId, group.emoji, !group.reactedByMe)
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-colors",
            group.reactedByMe
              ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300"
              : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          )}
          title={group.userIds
            .map((id) => senderMap?.get(id)?.displayName || `User ${id.slice(0, 8)}`)
            .join(", ")}
        >
          <span>{group.emoji}</span>
          <span>{group.count}</span>
        </button>
      ))}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  api,
  type MinutesInfo,
  type MeetingInfo,
  type RecordingInfo,
  type MinutesComment,
  type TranscriptSegment,
  type Chapter,
  type ActionItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  MessageSquare,
  ListChecks,
  BookOpen,
  Clock,
  CheckSquare,
  Send,
  Trash2,
  X,
  ChevronRight,
} from "lucide-react";

type TabId = "transcript" | "summary" | "chapters";

export default function MinutesPage() {
  const params = useParams();
  const minutesId = params.id as string;

  const [minutesData, setMinutesData] = useState<MinutesInfo | null>(null);
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [recording, setRecording] = useState<RecordingInfo | null>(null);
  const [comments, setComments] = useState<MinutesComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>("transcript");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [silenceSkipping, setSilenceSkipping] = useState(false);

  // Comment state
  const [commentingParagraph, setCommentingParagraph] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Task creation state
  const [creatingTask, setCreatingTask] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    loadMinutes();
  }, [minutesId]);

  async function loadMinutes() {
    try {
      setLoading(true);
      const [minutesResult, commentsResult] = await Promise.all([
        api.getMinutes(minutesId),
        api.getMinutesComments(minutesId),
      ]);
      setMinutesData(minutesResult.minutes);
      setMeeting(minutesResult.meeting);
      setRecording(minutesResult.recording);
      setComments(commentsResult.comments);
    } catch {
      setError("Failed to load minutes");
    } finally {
      setLoading(false);
    }
  }

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const changeSpeed = useCallback(() => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const idx = speeds.indexOf(playbackSpeed);
    const next = speeds[(idx + 1) % speeds.length]!;
    setPlaybackSpeed(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  }, [playbackSpeed]);

  const skip = useCallback(
    (seconds: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = Math.max(
          0,
          Math.min(audioRef.current.duration, audioRef.current.currentTime + seconds)
        );
      }
    },
    []
  );

  async function handleAddComment() {
    if (commentingParagraph === null || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const result = await api.addMinutesComment(
        minutesId,
        commentingParagraph,
        commentText.trim()
      );
      setComments((prev) => [...prev, result.comment]);
      setCommentText("");
      setCommentingParagraph(null);
    } catch {
      // ignore
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await api.deleteMinutesComment(minutesId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      // ignore
    }
  }

  async function handleCreateTask(item: ActionItem) {
    try {
      await api.createTask({
        title: item.description,
        dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : undefined,
      });
      setCreatingTask(null);
    } catch {
      // ignore
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Loading minutes...</div>
      </div>
    );
  }

  if (error || !minutesData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-500">{error || "Minutes not found"}</div>
      </div>
    );
  }

  const transcript = (minutesData.transcript ?? []) as TranscriptSegment[];
  const summary = minutesData.summary as {
    title?: string;
    overview?: string;
    keyPoints?: string[];
    decisions?: string[];
  } | null;
  const chapters = (minutesData.chapters ?? []) as Chapter[];
  const actionItems = (minutesData.actionItems ?? []) as ActionItem[];

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "transcript", label: "Transcript", icon: <BookOpen className="w-4 h-4" /> },
    { id: "summary", label: "Summary", icon: <ListChecks className="w-4 h-4" /> },
    { id: "chapters", label: "Chapters", icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {meeting?.title ?? "Meeting Minutes"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {meeting?.startedAt
            ? new Date(meeting.startedAt).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
          {minutesData.status !== "ready" && (
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              {minutesData.status}
            </span>
          )}
        </p>
      </div>

      {/* Player */}
      {recording && (
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-3 bg-gray-50 dark:bg-gray-900">
          <audio
            ref={audioRef}
            src={recording.storageUrl}
            onTimeUpdate={() => {
              if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (audioRef.current) setDuration(audioRef.current.duration);
            }}
            onEnded={() => setIsPlaying(false)}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => skip(-10)}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
              title="Back 10s"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={togglePlayback}
              className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => skip(10)}
              className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
              title="Forward 10s"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Progress bar */}
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs text-gray-500 w-10 text-right">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="flex-1 h-1 accent-blue-600"
              />
              <span className="text-xs text-gray-500 w-10">
                {formatTime(duration)}
              </span>
            </div>

            {/* Speed control */}
            <button
              onClick={changeSpeed}
              className="px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 min-w-[3rem]"
            >
              {playbackSpeed}x
            </button>

            {/* Silence skipping */}
            <button
              onClick={() => setSilenceSkipping(!silenceSkipping)}
              className={`px-2 py-1 text-xs rounded border ${
                silenceSkipping
                  ? "bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-300"
                  : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              title="Skip silence"
            >
              Skip silence
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 flex gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === "transcript" && (
          <TranscriptView
            transcript={transcript}
            comments={comments}
            currentTime={currentTime}
            commentingParagraph={commentingParagraph}
            commentText={commentText}
            submittingComment={submittingComment}
            onSeek={seekTo}
            onStartComment={setCommentingParagraph}
            onCommentTextChange={setCommentText}
            onSubmitComment={handleAddComment}
            onCancelComment={() => {
              setCommentingParagraph(null);
              setCommentText("");
            }}
            onDeleteComment={handleDeleteComment}
          />
        )}

        {activeTab === "summary" && (
          <SummaryView
            summary={summary}
            actionItems={actionItems}
            creatingTask={creatingTask}
            onCreateTask={handleCreateTask}
            onSetCreatingTask={setCreatingTask}
          />
        )}

        {activeTab === "chapters" && (
          <ChaptersView chapters={chapters} currentTime={currentTime} onSeek={seekTo} />
        )}
      </div>
    </div>
  );
}

// ============ Transcript View ============

function TranscriptView({
  transcript,
  comments,
  currentTime,
  commentingParagraph,
  commentText,
  submittingComment,
  onSeek,
  onStartComment,
  onCommentTextChange,
  onSubmitComment,
  onCancelComment,
  onDeleteComment,
}: {
  transcript: TranscriptSegment[];
  comments: MinutesComment[];
  currentTime: number;
  commentingParagraph: number | null;
  commentText: string;
  submittingComment: boolean;
  onSeek: (time: number) => void;
  onStartComment: (index: number) => void;
  onCommentTextChange: (text: string) => void;
  onSubmitComment: () => void;
  onCancelComment: () => void;
  onDeleteComment: (id: string) => void;
}) {
  if (transcript.length === 0) {
    return <div className="text-gray-500 text-sm">No transcript available.</div>;
  }

  return (
    <div className="space-y-1">
      {transcript.map((segment, idx) => {
        const isActive = currentTime >= segment.start && currentTime < segment.end;
        const paragraphComments = comments.filter((c) => c.paragraphIndex === idx);

        return (
          <div key={idx} className="group">
            <div
              className={`flex gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-blue-50 dark:bg-blue-950 border-l-2 border-blue-500"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-transparent"
              }`}
              onClick={() => onSeek(segment.start)}
            >
              <span className="text-xs text-gray-400 pt-0.5 w-10 shrink-0 text-right font-mono">
                {formatTimeShort(segment.start)}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {segment.speaker}
                </span>
                <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 leading-relaxed">
                  {segment.text}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartComment(idx);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-opacity shrink-0"
                title="Comment"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Paragraph comments */}
            {paragraphComments.length > 0 && (
              <div className="ml-16 pl-3 border-l-2 border-gray-200 dark:border-gray-700 space-y-1 mb-1">
                {paragraphComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="flex items-start gap-2 py-1 group/comment"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {comment.userName ?? "User"}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {new Date(comment.createdAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {comment.content}
                      </p>
                    </div>
                    <button
                      onClick={() => onDeleteComment(comment.id)}
                      className="opacity-0 group-hover/comment:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Comment input for this paragraph */}
            {commentingParagraph === idx && (
              <div className="ml-16 flex items-center gap-2 py-1">
                <input
                  autoFocus
                  value={commentText}
                  onChange={(e) => onCommentTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSubmitComment();
                    }
                    if (e.key === "Escape") onCancelComment();
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={onSubmitComment}
                  disabled={!commentText.trim() || submittingComment}
                  className="p-1 text-blue-600 hover:text-blue-700 disabled:text-gray-300"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onCancelComment}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ Summary View ============

function SummaryView({
  summary,
  actionItems,
  creatingTask,
  onCreateTask,
  onSetCreatingTask,
}: {
  summary: {
    title?: string;
    overview?: string;
    keyPoints?: string[];
    decisions?: string[];
  } | null;
  actionItems: ActionItem[];
  creatingTask: number | null;
  onCreateTask: (item: ActionItem) => void;
  onSetCreatingTask: (index: number | null) => void;
}) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Key Points */}
      {summary?.keyPoints && summary.keyPoints.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Key Points
          </h3>
          <ul className="space-y-1.5">
            {summary.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                <ChevronRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Overview */}
      {summary?.overview && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Overview
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {summary.overview}
          </p>
        </section>
      )}

      {/* Decisions */}
      {summary?.decisions && summary.decisions.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Decisions
          </h3>
          <ul className="space-y-1.5">
            {summary.decisions.map((decision, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                <CheckSquare className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <span>{decision}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Action Items
          </h3>
          <div className="space-y-2">
            {actionItems.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    {item.description}
                  </p>
                  <div className="flex gap-3 mt-1">
                    {item.assignee && (
                      <span className="text-xs text-gray-500">
                        Assignee: {item.assignee}
                      </span>
                    )}
                    {item.dueDate && (
                      <span className="text-xs text-gray-500">
                        Due: {new Date(item.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                {creatingTask === i ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => onCreateTask(item)}
                      className="text-xs"
                    >
                      Confirm
                    </Button>
                    <button
                      onClick={() => onSetCreatingTask(null)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSetCreatingTask(i)}
                    className="text-xs shrink-0"
                  >
                    Create Task
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {!summary && actionItems.length === 0 && (
        <div className="text-gray-500 text-sm">No summary available.</div>
      )}
    </div>
  );
}

// ============ Chapters View ============

function ChaptersView({
  chapters,
  currentTime,
  onSeek,
}: {
  chapters: Chapter[];
  currentTime: number;
  onSeek: (time: number) => void;
}) {
  if (chapters.length === 0) {
    return <div className="text-gray-500 text-sm">No chapters available.</div>;
  }

  return (
    <div className="space-y-2 max-w-3xl">
      {chapters.map((chapter, i) => {
        const isActive = currentTime >= chapter.start && currentTime < chapter.end;
        return (
          <button
            key={i}
            onClick={() => onSeek(chapter.start)}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              isActive
                ? "border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-700"
                : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-400">
                {formatTimeShort(chapter.start)}
              </span>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {chapter.title}
              </h4>
            </div>
            {chapter.summary && (
              <p className="text-xs text-gray-500 mt-1 ml-[3.5rem]">
                {chapter.summary}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

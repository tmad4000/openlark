"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  FileText,
  Brain,
  MessageSquare,
  CheckSquare,
  BookOpen,
  Send,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TranscriptParagraph {
  speaker: string;
  speakerId?: string;
  text: string;
  startTime: number;
  endTime: number;
}

interface Chapter {
  title: string;
  startTime: number;
  endTime: number;
  summary: string;
}

interface ActionItem {
  text: string;
  assignee?: string;
  assigneeId?: string;
  dueDate?: string;
}

interface Summary {
  overview: string;
  keyPoints: string[];
  decisions: string[];
}

interface MinutesData {
  id: string;
  meetingId: string;
  recordingId: string | null;
  transcript: { paragraphs: TranscriptParagraph[] } | null;
  summary: Summary | null;
  chapters: Chapter[] | null;
  actionItems: ActionItem[] | null;
  language: string;
  status: string;
  createdAt: string;
}

interface MeetingData {
  id: string;
  title: string;
  hostId: string;
  startedAt: string | null;
  endedAt: string | null;
}

interface RecordingData {
  id: string;
  storageUrl: string;
  duration: number | null;
  size: number | null;
}

interface Participant {
  userId: string;
  role: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Comment {
  id: string;
  paragraphIndex: number;
  content: string;
  createdAt: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type TabId = "transcript" | "summary" | "actions" | "chapters";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function MinutesViewerPage() {
  const router = useRouter();
  const params = useParams();
  const minutesId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [minutesData, setMinutesData] = useState<MinutesData | null>(null);
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [recording, setRecording] = useState<RecordingData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [silenceSkipping, setSilenceSkipping] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("transcript");

  // Comment state
  const [commentingParagraph, setCommentingParagraph] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Chapter expansion
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);

  // Fetch data
  useEffect(() => {
    const sessionToken = getCookie("session_token");
    if (!sessionToken) {
      router.push("/login");
      return;
    }
    setToken(sessionToken);

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/minutes/${minutesId}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (!res.ok) {
          if (res.status === 404) setError("Minutes not found");
          else setError("Failed to load minutes");
          setIsLoading(false);
          return;
        }

        const data = await res.json();
        setMinutesData(data.minutes);
        setMeeting(data.meeting);
        setRecording(data.recording);
        setParticipants(data.participants || []);
        setComments(data.comments || []);
        setIsLoading(false);
      } catch {
        setError("Failed to load minutes");
        setIsLoading(false);
      }
    };

    fetchData();
  }, [minutesId, router]);

  // Get media element (video or audio)
  const getMediaElement = useCallback((): HTMLMediaElement | null => {
    return videoRef.current || audioRef.current;
  }, []);

  // Player controls
  const togglePlay = useCallback(() => {
    const media = getMediaElement();
    if (!media) return;
    if (isPlaying) {
      media.pause();
    } else {
      media.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, getMediaElement]);

  const seekTo = useCallback((time: number) => {
    const media = getMediaElement();
    if (!media) return;
    media.currentTime = time;
    setCurrentTime(time);
  }, [getMediaElement]);

  const changeSpeed = useCallback((speed: number) => {
    const media = getMediaElement();
    if (media) {
      media.playbackRate = speed;
    }
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  }, [getMediaElement]);

  // Time update handler
  const handleTimeUpdate = useCallback(() => {
    const media = getMediaElement();
    if (!media) return;
    setCurrentTime(media.currentTime);
  }, [getMediaElement]);

  const handleLoadedMetadata = useCallback(() => {
    const media = getMediaElement();
    if (!media) return;
    setDuration(media.duration);
  }, [getMediaElement]);

  // Seek to paragraph time
  const seekToParagraph = useCallback((startTime: number) => {
    seekTo(startTime);
    const media = getMediaElement();
    if (media && !isPlaying) {
      media.play();
      setIsPlaying(true);
    }
  }, [seekTo, getMediaElement, isPlaying]);

  // Find active paragraph
  const activeParagraphIndex = minutesData?.transcript?.paragraphs.findIndex(
    (p) => currentTime >= p.startTime && currentTime < p.endTime
  ) ?? -1;

  // Submit comment
  const handleSubmitComment = useCallback(async () => {
    if (!token || commentingParagraph === null || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/minutes/${minutesId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paragraphIndex: commentingParagraph,
          content: commentText.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Re-fetch to get user info with comment
        const refetchRes = await fetch(`/api/minutes/${minutesId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (refetchRes.ok) {
          const refetchData = await refetchRes.json();
          setComments(refetchData.comments || []);
        }
        setCommentText("");
        setCommentingParagraph(null);
      }
    } catch {
      // ignore
    } finally {
      setSubmittingComment(false);
    }
  }, [token, minutesId, commentingParagraph, commentText]);

  // Create task from action item
  const handleCreateTask = useCallback(async (item: ActionItem) => {
    if (!token) return;
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: item.text,
          dueDate: item.dueDate || undefined,
        }),
      });
      alert("Task created successfully");
    } catch {
      alert("Failed to create task");
    }
  }, [token]);

  // Determine media type from URL
  const isVideo = recording?.storageUrl?.match(/\.(mp4|webm|mov|avi)(\?|$)/i);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading minutes...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white">
        <div className="text-gray-500 mb-4">{error}</div>
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!minutesData || !meeting) return null;

  const paragraphs = minutesData.transcript?.paragraphs || [];
  const summary = minutesData.summary;
  const chapters = minutesData.chapters || [];
  const actionItems = minutesData.actionItems || [];

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "transcript", label: "Transcript", icon: <FileText className="w-4 h-4" /> },
    { id: "summary", label: "Summary", icon: <Brain className="w-4 h-4" /> },
    { id: "actions", label: "Action Items", icon: <CheckSquare className="w-4 h-4" />, count: actionItems.length },
    { id: "chapters", label: "Chapters", icon: <BookOpen className="w-4 h-4" />, count: chapters.length },
  ];

  const commentsForParagraph = (idx: number) => comments.filter((c) => c.paragraphIndex === idx);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{meeting.title}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              {meeting.startedAt && (
                <span>{new Date(meeting.startedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              )}
              {participants.length > 0 && (
                <span>{participants.length} participant{participants.length !== 1 ? "s" : ""}</span>
              )}
              {recording?.duration && (
                <span>{formatTime(recording.duration)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          {minutesData.status === "processing" && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-yellow-700 bg-yellow-50 rounded-full">
              <Loader2 className="w-3 h-3 animate-spin" />
              Processing
            </span>
          )}
          {minutesData.status === "ready" && (
            <span className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-full">
              Ready
            </span>
          )}
          {minutesData.status === "failed" && (
            <span className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 rounded-full">
              Failed
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left side: Player + Tabs content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Media Player */}
          {recording && (
            <div className="border-b border-gray-200 bg-gray-50">
              {/* Video/Audio element */}
              <div className="relative">
                {isVideo ? (
                  <video
                    ref={videoRef}
                    src={recording.storageUrl}
                    className="w-full max-h-64 bg-black"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />
                ) : (
                  <audio
                    ref={audioRef}
                    src={recording.storageUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />
                )}
              </div>

              {/* Playback controls */}
              <div className="px-4 py-2 flex items-center gap-3">
                {/* Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-full hover:bg-gray-200 transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-gray-700" />
                  ) : (
                    <Play className="w-5 h-5 text-gray-700" />
                  )}
                </button>

                {/* Time display */}
                <span className="text-sm text-gray-600 font-mono min-w-[80px]">
                  {formatTime(currentTime)} / {formatTime(duration || recording.duration || 0)}
                </span>

                {/* Progress bar */}
                <div className="flex-1 relative group">
                  <input
                    type="range"
                    min={0}
                    max={duration || recording.duration || 100}
                    value={currentTime}
                    onChange={(e) => seekTo(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>

                {/* Speed control */}
                <div className="relative">
                  <button
                    onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                    className="px-2 py-1 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
                  >
                    {playbackSpeed}x
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
                      {PLAYBACK_SPEEDS.map((speed) => (
                        <button
                          key={speed}
                          onClick={() => changeSpeed(speed)}
                          className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 ${
                            speed === playbackSpeed ? "text-blue-600 font-medium" : "text-gray-700"
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Silence skipping toggle */}
                <button
                  onClick={() => setSilenceSkipping(!silenceSkipping)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    silenceSkipping
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:bg-gray-200"
                  }`}
                  title="Skip silence"
                >
                  Skip Silence
                </button>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {/* Transcript tab */}
            {activeTab === "transcript" && (
              <div className="p-4 space-y-1">
                {paragraphs.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">No transcript available</div>
                ) : (
                  paragraphs.map((paragraph, idx) => {
                    const isActive = idx === activeParagraphIndex;
                    const paraComments = commentsForParagraph(idx);

                    return (
                      <div key={idx} className="group">
                        <div
                          className={`flex gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            isActive ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50"
                          }`}
                          onClick={() => seekToParagraph(paragraph.startTime)}
                        >
                          {/* Timestamp */}
                          <span className="text-xs text-gray-400 font-mono mt-0.5 min-w-[52px] flex-shrink-0">
                            {formatTime(paragraph.startTime)}
                          </span>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-gray-700">
                                {paragraph.speaker}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed">
                              {paragraph.text}
                            </p>
                          </div>

                          {/* Comment button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCommentingParagraph(commentingParagraph === idx ? null : idx);
                            }}
                            className={`self-start p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                              paraComments.length > 0 ? "opacity-100 text-blue-500" : "text-gray-400 hover:text-gray-600"
                            }`}
                            title="Comment on this paragraph"
                          >
                            <MessageSquare className="w-4 h-4" />
                            {paraComments.length > 0 && (
                              <span className="text-xs ml-0.5">{paraComments.length}</span>
                            )}
                          </button>
                        </div>

                        {/* Comments for this paragraph */}
                        {paraComments.length > 0 && (
                          <div className="ml-[68px] mr-4 mb-2 space-y-1">
                            {paraComments.map((comment) => (
                              <div key={comment.id} className="flex gap-2 p-2 bg-gray-50 rounded text-sm">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0">
                                  {(comment.displayName || "U").charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <span className="font-medium text-gray-700 text-xs">
                                    {comment.displayName || "User"}
                                  </span>
                                  <p className="text-gray-600 text-xs mt-0.5">{comment.content}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Comment input */}
                        {commentingParagraph === idx && (
                          <div className="ml-[68px] mr-4 mb-2 flex gap-2">
                            <input
                              type="text"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              placeholder="Add a comment..."
                              className="flex-1 text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSubmitComment();
                                }
                                if (e.key === "Escape") {
                                  setCommentingParagraph(null);
                                  setCommentText("");
                                }
                              }}
                            />
                            <button
                              onClick={handleSubmitComment}
                              disabled={!commentText.trim() || submittingComment}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setCommentingParagraph(null);
                                setCommentText("");
                              }}
                              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Summary tab */}
            {activeTab === "summary" && (
              <div className="p-6 max-w-3xl">
                {!summary ? (
                  <div className="text-center text-gray-500 py-8">No summary available</div>
                ) : (
                  <div className="space-y-6">
                    {/* Overview */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Overview</h3>
                      <p className="text-sm text-gray-700 leading-relaxed">{summary.overview}</p>
                    </div>

                    {/* Key Points */}
                    {summary.keyPoints && summary.keyPoints.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Key Points</h3>
                        <ul className="space-y-2">
                          {summary.keyPoints.map((point, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <span className="text-blue-500 mt-1 flex-shrink-0">&#8226;</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Decisions */}
                    {summary.decisions && summary.decisions.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Decisions</h3>
                        <ul className="space-y-2">
                          {summary.decisions.map((decision, i) => (
                            <li key={i} className="flex gap-2 text-sm text-gray-700">
                              <CheckSquare className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                              <span>{decision}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Action Items tab */}
            {activeTab === "actions" && (
              <div className="p-6 max-w-3xl">
                {actionItems.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">No action items</div>
                ) : (
                  <div className="space-y-3">
                    {actionItems.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                      >
                        <CheckSquare className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800">{item.text}</p>
                          <div className="flex items-center gap-3 mt-1">
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
                        <button
                          onClick={() => handleCreateTask(item)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 rounded transition-colors flex-shrink-0"
                        >
                          <CheckSquare className="w-3 h-3" />
                          Create Task
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Chapters tab */}
            {activeTab === "chapters" && (
              <div className="p-6 max-w-3xl">
                {chapters.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">No chapters available</div>
                ) : (
                  <div className="space-y-2">
                    {chapters.map((chapter, i) => (
                      <div
                        key={i}
                        className="border border-gray-200 rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedChapter(expandedChapter === i ? null : i)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          {expandedChapter === i ? (
                            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          <span
                            className="text-xs text-blue-600 font-mono cursor-pointer hover:underline flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              seekToParagraph(chapter.startTime);
                            }}
                          >
                            {formatTime(chapter.startTime)}
                          </span>
                          <span className="text-sm font-medium text-gray-800 flex-1">
                            {chapter.title}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatTime(chapter.endTime - chapter.startTime)}
                          </span>
                        </button>
                        {expandedChapter === i && (
                          <div className="px-4 pb-3 pl-11">
                            <p className="text-sm text-gray-600 leading-relaxed">
                              {chapter.summary}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

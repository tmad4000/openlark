"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { MeetingInfo } from "@/lib/api";
import {
  LiveKitRoom,
  GridLayout,
  CarouselLayout,
  FocusLayout,
  FocusLayoutContainer,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  TrackLoop,
  useTracks,
  useParticipants,
  useRoomContext,
  Chat,
  ChatToggle,
  TrackToggle,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent } from "livekit-client";
import {
  Users,
  Grid3X3,
  Monitor,
  MonitorOff,
  MessageSquare,
  Timer,
  X,
  Maximize2,
  LayoutGrid,
} from "lucide-react";

const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

type ViewMode = "gallery" | "speaker";

function MeetingHeader({
  title,
  startTime,
}: {
  title: string;
  startTime: Date;
}) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    function updateTimer() {
      const diff = Math.floor((Date.now() - startTime.getTime()) / 1000);
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      if (hours > 0) {
        setElapsed(
          `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        );
      } else {
        setElapsed(
          `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        );
      }
    }
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between bg-gray-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-white font-semibold text-sm">{title}</h1>
        <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full">
          <Timer className="w-3 h-3" />
          <span className="font-mono">{elapsed}</span>
        </div>
      </div>
    </div>
  );
}

function ParticipantListPanel({ onClose }: { onClose: () => void }) {
  const participants = useParticipants();

  return (
    <div className="w-72 border-l border-gray-800 bg-gray-900 flex flex-col">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-white">
            Participants ({participants.length})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {participants.map((p) => (
          <div
            key={p.identity}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800/50"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium shrink-0">
              {(p.name || p.identity).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">
                {p.name || p.identity}
                {p.isLocal && (
                  <span className="text-xs text-gray-500 ml-1">(You)</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {p.isSpeaking && (
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-80 border-l border-gray-800 bg-gray-900 flex flex-col">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-white">Chat</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <Chat style={{ height: "100%" }} />
      </div>
    </div>
  );
}

function MeetingStage({
  viewMode,
  setViewMode,
  showParticipants,
  setShowParticipants,
  showChat,
  setShowChat,
}: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  showParticipants: boolean;
  setShowParticipants: (show: boolean) => void;
  showChat: boolean;
  setShowChat: (show: boolean) => void;
}) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const room = useRoomContext();
  const screenShareTracks = tracks.filter(
    (t) => t.source === Track.Source.ScreenShare
  );
  const isScreenSharing = screenShareTracks.length > 0;
  const effectiveView = isScreenSharing ? "speaker" : viewMode;

  // Determine the presenter info
  const presenterTrack = screenShareTracks[0];
  const presenterName = presenterTrack?.participant?.name || presenterTrack?.participant?.identity || "Someone";
  const isLocalSharing = presenterTrack?.participant?.isLocal ?? false;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* View toggle bar */}
      <div className="flex items-center justify-center gap-1 py-1.5 bg-gray-900/50">
        <button
          onClick={() => setViewMode("gallery")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            effectiveView === "gallery"
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Gallery
        </button>
        <button
          onClick={() => setViewMode("speaker")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
            effectiveView === "speaker"
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Speaker
        </button>
      </div>

      {/* Presenter indicator */}
      {isScreenSharing && (
        <div className="flex items-center justify-center gap-3 py-1.5 bg-blue-600/20 border-b border-blue-600/30">
          <div className="flex items-center gap-2 text-xs text-blue-300">
            <Monitor className="w-3.5 h-3.5" />
            <span>
              <span className="font-medium text-blue-200">{presenterName}</span>
              {isLocalSharing ? " (You) " : " "}
              is sharing their screen
            </span>
          </div>
          {isLocalSharing && (
            <button
              onClick={() => {
                room.localParticipant.setScreenShareEnabled(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
            >
              <MonitorOff className="w-3 h-3" />
              Stop Sharing
            </button>
          )}
        </div>
      )}

      {/* Video area */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 p-2">
          {effectiveView === "gallery" ? (
            <GridLayout
              tracks={tracks}
              style={{ height: "100%" }}
            >
              <ParticipantTile />
            </GridLayout>
          ) : (
            <FocusLayoutContainer style={{ height: "100%" }}>
              {screenShareTracks.length > 0 ? (
                <>
                  <FocusLayout
                    trackRef={screenShareTracks[0]}
                  />
                  <CarouselLayout
                    tracks={tracks.filter(
                      (t) => t.source !== Track.Source.ScreenShare
                    )}
                  >
                    <ParticipantTile />
                  </CarouselLayout>
                </>
              ) : (
                <>
                  {tracks.length > 0 && (
                    <FocusLayout trackRef={tracks[0]} />
                  )}
                  {tracks.length > 1 && (
                    <CarouselLayout
                      tracks={tracks.slice(1)}
                    >
                      <ParticipantTile />
                    </CarouselLayout>
                  )}
                </>
              )}
            </FocusLayoutContainer>
          )}
        </div>

        {showParticipants && (
          <ParticipantListPanel
            onClose={() => setShowParticipants(false)}
          />
        )}
        {showChat && <ChatPanel onClose={() => setShowChat(false)} />}
      </div>

      {/* Bottom controls toolbar */}
      <div className="border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2 py-2 px-4">
          <ControlBar
            variation="minimal"
            controls={{
              microphone: true,
              camera: true,
              screenShare: true,
              leave: true,
              chat: false,
              settings: false,
            }}
          />
          <div className="w-px h-8 bg-gray-700 mx-1" />
          <button
            onClick={() => setShowChat(!showChat)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
              showChat
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
            title="Toggle chat"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
              showParticipants
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
            title="Toggle participants"
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MeetingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    async function joinMeeting() {
      try {
        const result = await api.joinMeeting(meetingId);
        setMeeting(result.meeting);
        setToken(result.token);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to join meeting"
        );
      } finally {
        setLoading(false);
      }
    }
    joinMeeting();
  }, [meetingId]);

  const handleDisconnect = useCallback(() => {
    router.push("/messenger");
  }, [router]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <div className="text-gray-400">Joining meeting...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => router.push("/messenger")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!token || !meeting) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <div className="text-gray-400">Unable to join meeting</div>
      </div>
    );
  }

  const startTime = meeting.startedAt
    ? new Date(meeting.startedAt)
    : new Date();

  return (
    <div className="h-full flex flex-col bg-gray-950" data-lk-theme="default">
      <MeetingHeader title={meeting.title} startTime={startTime} />
      <LiveKitRoom
        serverUrl={LIVEKIT_URL}
        token={token}
        connect={true}
        onDisconnected={handleDisconnect}
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
      >
        <MeetingStage
          viewMode={viewMode}
          setViewMode={setViewMode}
          showParticipants={showParticipants}
          setShowParticipants={setShowParticipants}
          showChat={showChat}
          setShowChat={setShowChat}
        />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

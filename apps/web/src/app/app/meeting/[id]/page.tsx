"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Monitor,
  MonitorOff,
  Users,
  MessageSquare,
  Loader2,
  LayoutGrid,
  Maximize2,
  X,
} from "lucide-react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder, TrackReference } from "@livekit/components-react";
import { isTrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { Participant } from "livekit-client";
import "@livekit/components-styles";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

interface MeetingData {
  id: string;
  title: string;
  hostId: string;
  status: string;
  roomId: string;
  startedAt: string | null;
}

interface ParticipantInfo {
  userId: string;
  role: string;
  joinedAt: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export default function MeetingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const joinMeeting = useCallback(async () => {
    const sessionToken = getCookie("session_token");
    if (!sessionToken) {
      router.push("/login");
      return;
    }

    try {
      const res = await fetch(`/api/meetings/${meetingId}/join`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to join meeting");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setMeeting(data.meeting);
      setToken(data.token);
      setLivekitUrl(data.livekitUrl);
      if (data.participants) {
        setParticipants(data.participants);
      }
      setLoading(false);
    } catch {
      setError("Failed to connect to meeting");
      setLoading(false);
    }
  }, [meetingId, router]);

  useEffect(() => {
    joinMeeting();
  }, [joinMeeting]);

  const handleDisconnected = useCallback(() => {
    router.push("/app/messenger");
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-400">Joining meeting...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button
            onClick={() => router.push("/app/messenger")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Messenger
          </button>
        </div>
      </div>
    );
  }

  if (!token || !livekitUrl) {
    return null;
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      onDisconnected={handleDisconnected}
      data-lk-theme="default"
      style={{ height: "100vh" }}
    >
      <MeetingUI
        meeting={meeting}
        serverParticipants={participants}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

type ViewMode = "gallery" | "speaker";

function MeetingUI({
  meeting,
  serverParticipants,
}: {
  meeting: MeetingData | null;
  serverParticipants: ParticipantInfo[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const isMuted = !localParticipant.isMicrophoneEnabled;
  const isCameraOff = !localParticipant.isCameraEnabled;
  const isScreenSharing = localParticipant.isScreenShareEnabled;

  const toggleMic = () => {
    localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled);
  };

  const toggleCamera = () => {
    localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled);
  };

  const toggleScreenShare = () => {
    localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled);
  };

  const room = useRoomContext();
  const leaveMeeting = () => {
    room.disconnect();
  };

  // Find screen share tracks
  const screenShareTracks = tracks.filter(
    (t) => t.source === Track.Source.ScreenShare && t.publication?.track
  );

  // Find camera tracks
  const cameraTracks = tracks.filter(
    (t) => t.source === Track.Source.Camera
  );

  // Track which participants are presenting (screen sharing)
  const presenterIdentities = new Set(
    screenShareTracks.map((t) => t.participant.identity)
  );

  // Auto-switch to speaker view when someone shares screen
  useEffect(() => {
    if (screenShareTracks.length > 0 && viewMode === "gallery") {
      setViewMode("speaker");
    }
  }, [screenShareTracks.length, viewMode]);

  // Find the active speaker or screen share for speaker view
  const activeSpeakerTrack: TrackReferenceOrPlaceholder | undefined =
    screenShareTracks[0] ||
    cameraTracks.find((t) => t.participant.isSpeaking) ||
    cameraTracks[0];

  const sidebarTracks =
    viewMode === "speaker"
      ? cameraTracks.filter((t) => t !== activeSpeakerTrack)
      : [];

  return (
    <div className="h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 shrink-0 justify-between">
        <div className="flex items-center">
          <h1 className="text-white font-medium text-sm">
            {meeting?.title || "Meeting"}
          </h1>
          <MeetingTimer startedAt={meeting?.startedAt || null} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === "gallery" ? "speaker" : "gallery")}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title={viewMode === "gallery" ? "Speaker view" : "Gallery view"}
          >
            {viewMode === "gallery" ? (
              <Maximize2 className="w-4 h-4" />
            ) : (
              <LayoutGrid className="w-4 h-4" />
            )}
          </button>
          <span className="text-gray-500 text-xs">
            {participants.length} participant{participants.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-h-0 flex">
        {/* Video area */}
        <div className="flex-1 min-w-0 p-2">
          {viewMode === "gallery" ? (
            <GalleryView tracks={cameraTracks} screenShareTracks={screenShareTracks} presenterIdentities={presenterIdentities} />
          ) : (
            <SpeakerView
              activeTrack={activeSpeakerTrack}
              sidebarTracks={sidebarTracks}
              presenterIdentities={presenterIdentities}
            />
          )}
        </div>

        {/* Participant panel */}
        {showParticipants && (
          <div className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
            <div className="h-12 flex items-center justify-between px-4 border-b border-gray-800">
              <h2 className="text-white text-sm font-medium">
                Participants ({participants.length})
              </h2>
              <button
                onClick={() => setShowParticipants(false)}
                className="p-1 rounded hover:bg-gray-800 text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {participants.map((p) => (
                <ParticipantListItem
                  key={p.identity}
                  participant={p}
                  serverInfo={serverParticipants}
                  isPresenting={presenterIdentities.has(p.identity)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Chat panel */}
        {showChat && (
          <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
            <div className="h-12 flex items-center justify-between px-4 border-b border-gray-800">
              <h2 className="text-white text-sm font-medium">Meeting Chat</h2>
              <button
                onClick={() => setShowChat(false)}
                className="p-1 rounded hover:bg-gray-800 text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500 text-sm">Chat messages will appear here</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="h-16 bg-gray-900 border-t border-gray-800 flex items-center justify-center gap-3 shrink-0 px-4">
        <ToolbarButton
          onClick={toggleMic}
          active={!isMuted}
          danger={isMuted}
          icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          label={isMuted ? "Unmute" : "Mute"}
        />
        <ToolbarButton
          onClick={toggleCamera}
          active={!isCameraOff}
          danger={isCameraOff}
          icon={isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          label={isCameraOff ? "Start Video" : "Stop Video"}
        />
        <ToolbarButton
          onClick={toggleScreenShare}
          active={isScreenSharing}
          icon={isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          label={isScreenSharing ? "Stop Share" : "Share Screen"}
        />
        <div className="w-px h-8 bg-gray-700 mx-1" />
        <ToolbarButton
          onClick={() => { setShowChat(!showChat); if (!showChat) setShowParticipants(false); }}
          active={showChat}
          icon={<MessageSquare className="w-5 h-5" />}
          label="Chat"
        />
        <ToolbarButton
          onClick={() => { setShowParticipants(!showParticipants); if (!showParticipants) setShowChat(false); }}
          active={showParticipants}
          icon={<Users className="w-5 h-5" />}
          label="Participants"
        />
        <div className="w-px h-8 bg-gray-700 mx-1" />
        <button
          onClick={leaveMeeting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
          Leave
        </button>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  danger,
  icon,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors min-w-[56px] ${
        danger
          ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
          : active
          ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
          : "text-gray-400 hover:bg-gray-800 hover:text-white"
      }`}
      title={label}
    >
      {icon}
      <span className="text-[10px]">{label}</span>
    </button>
  );
}

function GalleryView({
  tracks,
  screenShareTracks,
  presenterIdentities,
}: {
  tracks: TrackReferenceOrPlaceholder[];
  screenShareTracks: TrackReferenceOrPlaceholder[];
  presenterIdentities: Set<string>;
}) {
  const allTracks = [...screenShareTracks, ...tracks];
  const count = allTracks.length;

  // Calculate grid dimensions
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;

  return (
    <div
      className="h-full grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: "1fr",
      }}
    >
      {allTracks.map((trackRef) => (
        <VideoTile
          key={`${trackRef.participant.identity}-${trackRef.source}`}
          trackRef={trackRef}
          isScreenShare={trackRef.source === Track.Source.ScreenShare}
          isPresenter={trackRef.source === Track.Source.Camera && presenterIdentities.has(trackRef.participant.identity)}
        />
      ))}
      {count === 0 && (
        <div className="flex items-center justify-center text-gray-500">
          <p>Waiting for participants...</p>
        </div>
      )}
    </div>
  );
}

function SpeakerView({
  activeTrack,
  sidebarTracks,
  presenterIdentities,
}: {
  activeTrack: TrackReferenceOrPlaceholder | undefined;
  sidebarTracks: TrackReferenceOrPlaceholder[];
  presenterIdentities: Set<string>;
}) {
  return (
    <div className="h-full flex gap-2">
      {/* Main active speaker / screen share */}
      <div className="flex-1 min-w-0">
        {activeTrack ? (
          <VideoTile
            trackRef={activeTrack}
            isScreenShare={activeTrack.source === Track.Source.ScreenShare}
            isPresenter={activeTrack.source === Track.Source.Camera && presenterIdentities.has(activeTrack.participant.identity)}
            large
          />
        ) : (
          <div className="h-full rounded-lg bg-gray-900 flex items-center justify-center">
            <p className="text-gray-500">No active speaker</p>
          </div>
        )}
      </div>

      {/* Sidebar thumbnails */}
      {sidebarTracks.length > 0 && (
        <div className="w-48 flex flex-col gap-2 overflow-y-auto shrink-0">
          {sidebarTracks.map((trackRef) => (
            <div key={`${trackRef.participant.identity}-${trackRef.source}`} className="h-32 shrink-0">
              <VideoTile
                trackRef={trackRef}
                isPresenter={presenterIdentities.has(trackRef.participant.identity)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoTile({
  trackRef,
  isScreenShare,
  isPresenter,
  large,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  isScreenShare?: boolean;
  isPresenter?: boolean;
  large?: boolean;
}) {
  const { participant, publication } = trackRef;
  const hasVideo = isTrackReference(trackRef) && publication?.track && !publication.isMuted;
  const isSpeaking = participant.isSpeaking;

  return (
    <div
      className={`relative h-full rounded-lg overflow-hidden bg-gray-900 ${
        isSpeaking ? "ring-2 ring-blue-500" : ""
      }`}
    >
      {hasVideo && isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef}
          style={{
            width: "100%",
            height: "100%",
            objectFit: isScreenShare ? "contain" : "cover",
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800">
          <div
            className={`rounded-full bg-gray-700 flex items-center justify-center text-white font-semibold ${
              large ? "w-20 h-20 text-2xl" : "w-12 h-12 text-lg"
            }`}
          >
            {getInitials(participant.name || participant.identity)}
          </div>
        </div>
      )}

      {/* Presenter indicator badge */}
      {isPresenter && (
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/90 text-white text-[10px] font-medium">
          <Monitor className="w-3 h-3" />
          Presenting
        </div>
      )}

      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div className="flex items-center gap-1.5">
          {participant.isMicrophoneEnabled === false && (
            <MicOff className="w-3 h-3 text-red-400 shrink-0" />
          )}
          <span className="text-white text-xs truncate">
            {participant.name || participant.identity}
            {participant.isLocal && " (You)"}
          </span>
          {isScreenShare && (
            <span className="text-blue-400 text-[10px] ml-auto shrink-0">Screen</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ParticipantListItem({
  participant,
  serverInfo,
  isPresenting,
}: {
  participant: Participant;
  serverInfo: ParticipantInfo[];
  isPresenting?: boolean;
}) {
  const info = serverInfo.find((s) => s.userId === participant.identity);

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800">
      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-medium shrink-0">
        {getInitials(participant.name || participant.identity)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm truncate">
          {participant.name || participant.identity}
          {participant.isLocal && (
            <span className="text-gray-500 text-xs ml-1">(You)</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {info?.role === "host" && (
            <span className="text-blue-400 text-xs">Host</span>
          )}
          {isPresenting && (
            <span className="text-green-400 text-xs flex items-center gap-0.5">
              <Monitor className="w-3 h-3" />
              Presenting
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!participant.isMicrophoneEnabled && (
          <MicOff className="w-3.5 h-3.5 text-red-400" />
        )}
        {!participant.isCameraEnabled && (
          <VideoOff className="w-3.5 h-3.5 text-gray-500" />
        )}
      </div>
    </div>
  );
}

function MeetingTimer({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    if (!startedAt) return;

    const start = new Date(startedAt).getTime();

    const update = () => {
      const diff = Math.floor((Date.now() - start) / 1000);
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
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span className="ml-3 text-gray-500 text-xs font-mono">{elapsed}</span>
  );
}

function getInitials(name: string): string {
  return name
    .split(/[\s@]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

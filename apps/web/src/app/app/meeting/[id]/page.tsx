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
  Users,
  Loader2,
} from "lucide-react";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useRoomContext,
  useTracks,
  useParticipants,
} from "@livekit/components-react";
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
    <div className="h-screen bg-gray-950 flex flex-col">
      {/* Meeting header */}
      <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 shrink-0">
        <h1 className="text-white font-medium text-sm">{meeting?.title || "Meeting"}</h1>
        <MeetingTimer startedAt={meeting?.startedAt || null} />
      </div>

      {/* LiveKit Room */}
      <div className="flex-1 min-h-0">
        <LiveKitRoom
          token={token}
          serverUrl={livekitUrl}
          connect={true}
          onDisconnected={handleDisconnected}
          data-lk-theme="default"
          style={{ height: "100%" }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
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
        setElapsed(`${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
      } else {
        setElapsed(`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`);
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

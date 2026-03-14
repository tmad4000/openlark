"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { MeetingInfo } from "@/lib/api";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";

const LIVEKIT_URL =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

export default function MeetingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="h-full flex flex-col bg-gray-950" data-lk-theme="default">
      <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
        <h1 className="text-white font-medium">{meeting.title}</h1>
        <span className="text-xs text-gray-400 uppercase">{meeting.status}</span>
      </div>
      <div className="flex-1 min-h-0">
        <LiveKitRoom
          serverUrl={LIVEKIT_URL}
          token={token}
          connect={true}
          onDisconnected={handleDisconnect}
          style={{ height: "100%" }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </div>
  );
}

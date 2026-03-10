"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface WebSocketMessage {
  type: string;
  payload?: unknown;
  userId?: string;
  orgId?: string | null;
  // For typing events
  chatId?: string;
  displayName?: string;
  isTyping?: boolean;
  // For presence events
  isOnline?: boolean;
}

export interface TypingEvent {
  chatId: string;
  userId: string;
  displayName: string;
  isTyping: boolean;
}

export interface PresenceEvent {
  userId: string;
  displayName: string;
  isOnline: boolean;
}

interface UseWebSocketOptions {
  token: string | null;
  onMessage?: (message: WebSocketMessage) => void;
  onTyping?: (event: TypingEvent) => void;
  onPresence?: (event: PresenceEvent) => void;
  onConnected?: (data: { userId: string; orgId: string | null }) => void;
  onDisconnected?: () => void;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  send: (message: unknown) => void;
  reconnect: () => void;
  sendTypingStart: (chatId: string) => void;
  sendTypingStop: (chatId: string) => void;
  sendHeartbeat: () => void;
}

const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds
const MAX_RETRIES = 10;

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { token, onMessage, onTyping, onPresence, onConnected, onDisconnected } = options;

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountingRef = useRef(false);

  // Store callbacks in refs to avoid reconnection on callback change
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  const onPresenceRef = useRef(onPresence);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onTypingRef.current = onTyping;
    onPresenceRef.current = onPresence;
    onConnectedRef.current = onConnected;
    onDisconnectedRef.current = onDisconnected;
  }, [onMessage, onTyping, onPresence, onConnected, onDisconnected]);

  const cleanup = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (isUnmountingRef.current) return;

    const sessionToken = token || getCookie("session_token");
    if (!sessionToken) {
      setStatus("disconnected");
      return;
    }

    // Clean up any existing connection
    cleanup();

    setStatus(retryCountRef.current > 0 ? "reconnecting" : "connecting");

    // Determine WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/ws?token=${encodeURIComponent(sessionToken)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Connection established, but wait for "connected" message for full confirmation
      retryCountRef.current = 0;

      // Set up ping interval to keep connection alive
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000); // Ping every 30 seconds

      // Set up heartbeat interval for presence (every 30 seconds)
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;

        if (message.type === "connected") {
          setStatus("connected");
          onConnectedRef.current?.({
            userId: message.userId || "",
            orgId: message.orgId ?? null,
          });
        } else if (message.type === "pong" || message.type === "heartbeat_ack") {
          // Ignore pong and heartbeat_ack responses
        } else if (message.type === "typing") {
          // Handle typing events
          onTypingRef.current?.({
            chatId: message.chatId || "",
            userId: message.userId || "",
            displayName: message.displayName || "Unknown",
            isTyping: message.isTyping ?? false,
          });
        } else if (message.type === "presence") {
          // Handle presence events
          onPresenceRef.current?.({
            userId: message.userId || "",
            displayName: message.displayName || "Unknown",
            isOnline: message.isOnline ?? false,
          });
        } else {
          // Forward other messages to the handler
          onMessageRef.current?.(message);
        }
      } catch {
        // Ignore invalid JSON
      }
    };

    ws.onclose = (event) => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (isUnmountingRef.current) {
        setStatus("disconnected");
        return;
      }

      // Don't reconnect on auth errors
      if (event.code === 4001) {
        setStatus("disconnected");
        onDisconnectedRef.current?.();
        return;
      }

      // Attempt to reconnect with exponential backoff
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(2, retryCountRef.current),
          MAX_RETRY_DELAY
        );
        retryCountRef.current++;
        setStatus("reconnecting");

        retryTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        setStatus("disconnected");
        onDisconnectedRef.current?.();
      }
    };

    ws.onerror = () => {
      // Error will trigger onclose, no need to handle separately
    };
  }, [token, cleanup]);

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        typeof message === "string" ? message : JSON.stringify(message)
      );
    }
  }, []);

  const sendTypingStart = useCallback((chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing_start", chatId }));
    }
  }, []);

  const sendTypingStop = useCallback((chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing_stop", chatId }));
    }
  }, []);

  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "heartbeat" }));
    }
  }, []);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    connect();
  }, [connect]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    isUnmountingRef.current = false;
    connect();

    return () => {
      isUnmountingRef.current = true;
      cleanup();
    };
  }, [connect, cleanup]);

  return { status, send, reconnect, sendTypingStart, sendTypingStop, sendHeartbeat };
}

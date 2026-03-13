"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api, type Message } from "@/lib/api";

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

export type WebSocketStatus = "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

export interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

export interface NewMessageEvent {
  chatId: string;
  message: Message;
}

export interface MessageEditedEvent {
  chatId: string;
  message: Message;
}

export interface MessageRecalledEvent {
  chatId: string;
  messageId: string;
}

export interface TypingEvent {
  chatId: string;
  userId: string;
  isTyping: boolean;
}

export interface PresenceEvent {
  userId: string;
  status: "online" | "offline";
}

interface UseWebSocketOptions {
  onMessage?: (event: NewMessageEvent) => void;
  onMessageEdited?: (event: MessageEditedEvent) => void;
  onMessageRecalled?: (event: MessageRecalledEvent) => void;
  onTyping?: (event: TypingEvent) => void;
  onPresence?: (event: PresenceEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const optionsRef = useRef(options);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const handleMessage = useCallback((data: WebSocketMessage) => {
    switch (data.type) {
      case "connected":
        break;

      case "subscribed":
        break;

      case "pong":
        break;

      case "message:new": {
        const event: NewMessageEvent = {
          chatId: data.chatId as string,
          message: data.message as Message,
        };
        optionsRef.current.onMessage?.(event);
        break;
      }

      case "message:edited": {
        const event: MessageEditedEvent = {
          chatId: data.chatId as string,
          message: data.message as Message,
        };
        optionsRef.current.onMessageEdited?.(event);
        break;
      }

      case "message:recalled": {
        const event: MessageRecalledEvent = {
          chatId: data.chatId as string,
          messageId: data.messageId as string,
        };
        optionsRef.current.onMessageRecalled?.(event);
        break;
      }

      case "typing:start": {
        const event: TypingEvent = {
          chatId: data.chatId as string,
          userId: data.userId as string,
          isTyping: true,
        };
        optionsRef.current.onTyping?.(event);
        break;
      }

      case "typing:stop": {
        const event: TypingEvent = {
          chatId: data.chatId as string,
          userId: data.userId as string,
          isTyping: false,
        };
        optionsRef.current.onTyping?.(event);
        break;
      }

      case "presence:online": {
        const event: PresenceEvent = {
          userId: data.userId as string,
          status: "online",
        };
        optionsRef.current.onPresence?.(event);
        break;
      }

      case "presence:offline": {
        const event: PresenceEvent = {
          userId: data.userId as string,
          status: "offline",
        };
        optionsRef.current.onPresence?.(event);
        break;
      }

      default:
        console.log("WebSocket: Unknown message type", data.type);
    }
  }, []);

  const connect = useCallback(() => {
    const token = api.getToken();
    if (!token) {
      console.log("WebSocket: No token available, skipping connection");
      return;
    }

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus(reconnectAttempts.current > 0 ? "reconnecting" : "connecting");

    const wsUrl = `${WS_BASE_URL}/api/v1/messenger/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setStatus("connected");
      reconnectAttempts.current = 0;
      startHeartbeat();
      optionsRef.current.onConnected?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage;
        handleMessage(data);
      } catch (err) {
        console.error("WebSocket: Failed to parse message", err);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed", event.code, event.reason);
      setStatus("disconnected");
      stopHeartbeat();
      optionsRef.current.onDisconnected?.();

      // Don't reconnect if auth failed
      if (event.code === 4001) {
        console.log("WebSocket: Auth failed, not reconnecting");
        return;
      }

      // Attempt to reconnect with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };

    ws.onerror = (event) => {
      console.error("WebSocket error", event);
      setStatus("error");
    };

    wsRef.current = ws;
  }, [handleMessage, startHeartbeat, stopHeartbeat]);

  const disconnect = useCallback(() => {
    stopHeartbeat();
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
  }, [stopHeartbeat]);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: isTyping ? "typing:start" : "typing:stop",
          chatId,
        })
      );
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    connect,
    disconnect,
    sendTyping,
    isConnected: status === "connected",
  };
}

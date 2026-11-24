export type RealtimeMessage = {
  type:
    | "LAB_STATE"
    | "PLAYERS_UPDATE"
    | "SCORES_UPDATE"
    | "LAB_COMMAND"
    | "PLAYER_UPSERT"
    | "PLAYERS_RESET"
    | "SCORE_UPSERT";
  payload: unknown;
};

export type RealtimeClient = {
  send: (message: RealtimeMessage) => void;
  close: () => void;
};

function realtimeUrl() {
  const configured = import.meta.env.VITE_REALTIME_URL as string | undefined;
  if (configured) return configured;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname === "localhost"
    ? "127.0.0.1"
    : window.location.hostname;
  return `${protocol}//${hostname}:8787`;
}

export function connectRealtime(onMessage: (message: RealtimeMessage) => void): RealtimeClient {
  let socket: WebSocket | null = null;
  let closed = false;
  let retryTimer = 0;
  let retryAttempt = 0;
  const pending: string[] = [];

  const scheduleReconnect = () => {
    if (closed || retryTimer) return;
    const delay = Math.min(5000, 250 * 2 ** retryAttempt++);
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      connect();
    }, delay);
  };

  const connect = () => {
    if (closed) return;
    try {
      socket = new WebSocket(realtimeUrl());
      socket.onopen = () => {
        retryAttempt = 0;
        while (pending.length > 0) {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(pending.shift()!);
          } else {
            break;
          }
        }
      };
      socket.onmessage = (event) => {
        try {
          onMessage(JSON.parse(event.data as string) as RealtimeMessage);
        } catch {
          // Ignore malformed server messages and keep local fallback active.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = scheduleReconnect;
    } catch {
      scheduleReconnect();
    }
  };

  connect();

  return {
    send(message) {
      if (closed) return;
      const serialized = JSON.stringify(message);
      if (socket?.readyState === WebSocket.OPEN) socket.send(serialized);
      else pending.push(serialized);
    },
    close() {
      closed = true;
      pending.length = 0;
      window.clearTimeout(retryTimer);
      socket?.close();
    },
  };
}

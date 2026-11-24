import { WebSocketServer } from "ws";

const port = Number(process.env.REALTIME_PORT || 8787);
const host = process.env.REALTIME_HOST || "0.0.0.0";
const state = {
  lab: { status: "aguardando", durationSeconds: 90 * 60 },
  players: [],
  scores: [],
};

const server = new WebSocketServer({ port, host });

function send(socket, type, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

function broadcast(type, payload) {
  for (const socket of server.clients) send(socket, type, payload);
}

function uniquePlayers(players) {
  const byName = new Map();
  for (const player of players) {
    if (player?.nome) {
      byName.set(player.nome, {
        ...player,
        registradoEm: player.registradoEm || Date.now(),
      });
    }
  }
  return [...byName.values()];
}

function upsertPlayer(player) {
  if (!player?.nome) return;
  const index = state.players.findIndex((current) => current.nome === player.nome);
  const previous = index >= 0 ? state.players[index] : undefined;
  const next = {
    ...previous,
    ...player,
    id: previous?.id || player.id,
    registradoEm: previous?.registradoEm || player.registradoEm || Date.now(),
  };
  if (index >= 0) state.players[index] = next;
  else state.players.push(next);
  broadcast("PLAYERS_UPDATE", state.players);
}

function upsertScore(score) {
  if (!score?.nome || typeof score.pts !== "number") return;
  const key = (entry) => JSON.stringify(entry);
  const index = state.scores.findIndex((entry) => key(entry) === key(score));
  if (index >= 0) state.scores[index] = score;
  else state.scores.push(score);
  state.scores.sort((a, b) => b.pts - a.pts);
  state.scores = state.scores.slice(0, 8);
  broadcast("SCORES_UPDATE", state.scores);
}

server.on("connection", (socket) => {
  send(socket, "LAB_STATE", state.lab);
  send(socket, "PLAYERS_UPDATE", state.players);
  send(socket, "SCORES_UPDATE", state.scores);

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "LAB_COMMAND" && message.payload?.action) {
        const command = message.payload;
        const allowedActions = ["start", "reset", "finish"];
        if (!allowedActions.includes(command.action)) {
          console.error(`Invalid LAB_COMMAND action: ${command.action}`);
          return;
        }
        // Authorization check
        if (command.adminOperator !== "ADMIN") {
          console.error(`Unauthorized LAB_COMMAND from ${command.adminOperator}`);
          return;
        }
        // Validate durationSeconds for start command
        if (command.action === "start") {
          const duration = Number(command.durationSeconds);
          if (typeof duration !== "number" || duration <= 0) {
            console.error("Invalid durationSeconds for start command");
            return;
          }
        }
        // Execute action
        if (command.action === "start") {
          state.lab = {
            status: "em_andamento",
            startTime: Date.now(),
            durationSeconds: Number(command.durationSeconds) || 90 * 60,
            adminOperator: command.adminOperator || "ADMIN",
          };
        } else if (command.action === "reset") {
          state.lab = { status: "aguardando", durationSeconds: 90 * 60 };
        } else if (command.action === "finish") {
          state.lab = { ...state.lab, status: "finalizado" };
        }
        broadcast("LAB_STATE", state.lab);
      }
      if (message.type === "PLAYER_UPSERT") upsertPlayer(message.payload);
      if (message.type === "PLAYERS_RESET") {
        state.players = [];
        broadcast("PLAYERS_UPDATE", state.players);
      }
      if (message.type === "SCORE_UPSERT") upsertScore(message.payload);
      if (message.type === "LAB_STATE" && message.payload) {
        const payload = message.payload;
        if (payload.status === "em_andamento") {
          // Ensure startTime exists
          if (payload.startTime === undefined || typeof payload.startTime !== "number") {
            payload.startTime = Date.now();
          }
        }
        state.lab = payload;
        broadcast("LAB_STATE", state.lab);
      }
      if (message.type === "PLAYERS_UPDATE" && Array.isArray(message.payload)) {
        state.players = uniquePlayers(message.payload);
        broadcast("PLAYERS_UPDATE", state.players);
      }
      if (message.type === "SCORES_UPDATE" && Array.isArray(message.payload)) {
        state.scores = message.payload;
        broadcast("SCORES_UPDATE", state.scores);
      }
    } catch (err) {
      console.error("Error parsing LAB message:", err);
    }
  });
});

console.log(`INITIUM realtime server listening on ws://localhost:${port}`);

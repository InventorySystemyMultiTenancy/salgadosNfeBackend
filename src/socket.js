import { Server } from "socket.io";
import { getFrontendUrl } from "./config.js";

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: getFrontendUrl() },
  });

  io.on("connection", (socket) => {
    socket.join("kitchen");
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.io ainda não foi inicializado.");
  }
  return io;
}

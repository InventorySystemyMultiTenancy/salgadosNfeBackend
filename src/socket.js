import { Server } from "socket.io";

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || "http://localhost:5173" },
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

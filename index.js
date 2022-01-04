const app = require("express")();
require("./startup")(app);
const server = require("http").createServer(app);
const { randomUUID } = require("crypto");
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
const sessions = require("./session");

const port = process.env.PORT || 5000;

io.use((socket, next) => {
  const sessionId = socket.handshake.auth.sessionId;

  if (sessionId) {
    const session = sessions[sessionId];
    if (session) {
      socket.sessionId = sessionId;
      socket.userId = session.userId;
      socket.username = session.username;
      return next();
    }
  }
  const username = socket.handshake.auth.username;
  if (!username) {
    return next(new Error("Username is invalid."));
  }
  socket.username = username;
  socket.sessionId = randomUUID();
  socket.userId = randomUUID();
  sessions[socket.sessionId] = {
    userId: socket.userId,
    username: socket.username,
    connected: false,
  };

  return next();
});

io.on("connection", (socket) => {
  socket.join(socket.userId);
  socket.emit("session", {
    sessionId: socket.sessionId,
    userId: socket.userId,
  });

  const users = [];

  for (let [id, socket] of io.of("/").sockets) {
    users.push({
      userId: socket.userId,
      username: socket.username,
    });
  }

  socket.emit(
    "user",
    users.filter(
      (user, index) =>
        users.findIndex((obj) => obj.userId === user.userId) === index
    )
  );

  socket.broadcast.emit("user connected", {
    userId: socket.userId,
    username: socket.username,
  });

  socket.on("disconnect", async () => {
    const matchingSockets = await io.in(socket.userId).allSockets();
    const notConnected = matchingSockets.size === 0;
    if (notConnected) {
      socket.broadcast.emit("user disconnected", {
        userId: socket.userId,
      });

      sessions[socket.sessionId] = {
        userId: socket.userId,
        username: socket.username,
        connected: false,
      };
    }
  });

  socket.on("private message", ({ content, to }) => {
    socket.to(to).emit("private message", {
      content,
      from: socket.userId,
    });
  });
});

server.listen(port, () => {
  console.log(`Connected to port ${port}`);
});

/**
 * Mego-style video chat MVP server
 * - Serves the frontend (public/)
 * - Handles matchmaking (interest-based, falls back to random)
 * - Relays WebRTC signaling (offer/answer/ICE candidates)
 * - Relays text chat messages between matched pairs
 *
 * Run: npm install && npm start
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // tighten this in production to your real domain
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- In-memory state (fine for MVP; use Redis if you scale to multiple server instances) ----

// Users waiting to be matched: array of { socketId, interests: string[] }
let waitingQueue = [];

// Map socketId -> partnerSocketId, so we know who is paired with whom
const activePairs = new Map();

// Map socketId -> { interests }
const userProfiles = new Map();

function removeFromQueue(socketId) {
  waitingQueue = waitingQueue.filter((u) => u.socketId !== socketId);
}

function findMatch(newUser) {
  // 1. Try to find someone with at least one shared interest tag
  if (newUser.interests && newUser.interests.length > 0) {
    const idx = waitingQueue.findIndex((u) =>
      u.interests.some((tag) => newUser.interests.includes(tag))
    );
    if (idx !== -1) return waitingQueue.splice(idx, 1)[0];
  }
  // 2. Fall back to random: just take whoever has been waiting longest
  if (waitingQueue.length > 0) return waitingQueue.shift();
  return null;
}

function pairUsers(socketA, socketB) {
  activePairs.set(socketA, socketB);
  activePairs.set(socketB, socketA);

  const roomId = `room_${socketA}_${socketB}`;
  io.sockets.sockets.get(socketA)?.join(roomId);
  io.sockets.sockets.get(socketB)?.join(roomId);

  // Tell socketA to be the "initiator" (creates the WebRTC offer)
  io.to(socketA).emit('matched', { roomId, initiator: true });
  io.to(socketB).emit('matched', { roomId, initiator: false });
}

function handleDisconnectOrSkip(socketId) {
  removeFromQueue(socketId);
  const partnerId = activePairs.get(socketId);
  if (partnerId) {
    io.to(partnerId).emit('partner-left');
    activePairs.delete(socketId);
    activePairs.delete(partnerId);
  }
}

io.on('connection', (socket) => {
  console.log(`connected: ${socket.id}`);

  // Client sends their chosen interest tags (can be empty array for pure random match)
  socket.on('find-match', (interests = []) => {
    userProfiles.set(socket.id, { interests });
    handleDisconnectOrSkip(socket.id); // clean up any previous state

    const partner = findMatch({ socketId: socket.id, interests });
    if (partner) {
      pairUsers(socket.id, partner.socketId);
    } else {
      waitingQueue.push({ socketId: socket.id, interests });
      socket.emit('waiting');
    }
  });

  // --- WebRTC signaling relay: just forward to the partner ---
  socket.on('signal', ({ roomId, data }) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('signal', { data });
  });

  // --- Text chat relay ---
  socket.on('chat-message', (message) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('chat-message', { message, fromSelf: false });
  });

  // User clicks "Next" / "Skip"
  socket.on('skip', () => {
    handleDisconnectOrSkip(socket.id);
    // Immediately try to find a new match with their last-used interests
    const profile = userProfiles.get(socket.id) || { interests: [] };
    const partner = findMatch({ socketId: socket.id, interests: profile.interests });
    if (partner) {
      pairUsers(socket.id, partner.socketId);
    } else {
      waitingQueue.push({ socketId: socket.id, interests: profile.interests });
      socket.emit('waiting');
    }
  });

  socket.on('disconnect', () => {
    console.log(`disconnected: ${socket.id}`);
    handleDisconnectOrSkip(socket.id);
    userProfiles.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

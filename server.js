/**
 * Mego-style video chat MVP server — now with auth + block/report
 * - Serves the frontend (public/)
 * - Email/password auth (sessions via express-session)
 * - Handles matchmaking (interest-based, falls back to random), skipping blocked users
 * - Relays WebRTC signaling (offer/answer/ICE candidates)
 * - Relays text chat messages between matched pairs
 * - Block + Report a partner (persisted in SQLite)
 *
 * Run: npm install && npm start
 */

const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const { Server } = require('socket.io');

const db = require('./db');
const authRoutes = require('./auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // tighten this in production to your real domain
});

// ---- Session setup (shared between Express routes and Socket.IO) ----
// Set SESSION_SECRET as an environment variable in production (e.g. on Render).
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
});

app.use(express.json());
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware); // lets Socket.IO read the same session/cookie

app.use('/api', authRoutes);

// Serve CSS/JS assets, but don't auto-serve index.html (we gate it below)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- In-memory matchmaking state ----
// { socketId, userId, username, interests }
let waitingQueue = [];
const activePairs = new Map(); // socketId -> partnerSocketId
const userProfiles = new Map(); // socketId -> profile

function isBlocked(userIdA, userIdB) {
  const row = db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
    )
    .get(userIdA, userIdB, userIdB, userIdA);
  return !!row;
}

function removeFromQueue(socketId) {
  waitingQueue = waitingQueue.filter((u) => u.socketId !== socketId);
}

function findMatch(newUser) {
  const candidates = waitingQueue.filter((u) => !isBlocked(u.userId, newUser.userId));

  if (newUser.interests && newUser.interests.length > 0) {
    const idx = candidates.findIndex((u) =>
      u.interests.some((tag) => newUser.interests.includes(tag))
    );
    if (idx !== -1) {
      const match = candidates[idx];
      removeFromQueue(match.socketId);
      return match;
    }
  }

  if (candidates.length > 0) {
    const match = candidates[0];
    removeFromQueue(match.socketId);
    return match;
  }

  return null;
}

function pairUsers(a, b) {
  activePairs.set(a.socketId, b.socketId);
  activePairs.set(b.socketId, a.socketId);

  const roomId = `room_${a.socketId}_${b.socketId}`;
  io.sockets.sockets.get(a.socketId)?.join(roomId);
  io.sockets.sockets.get(b.socketId)?.join(roomId);

  io.to(a.socketId).emit('matched', { roomId, initiator: true, partnerName: b.username });
  io.to(b.socketId).emit('matched', { roomId, initiator: false, partnerName: a.username });
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
  const httpSession = socket.request.session;

  // Reject any socket that doesn't have a valid logged-in session
  if (!httpSession || !httpSession.userId) {
    socket.emit('auth-required');
    socket.disconnect(true);
    return;
  }

  const userId = httpSession.userId;
  const username = httpSession.username;

  socket.on('find-match', (interests = []) => {
    const me = { socketId: socket.id, userId, username, interests };
    userProfiles.set(socket.id, me);
    handleDisconnectOrSkip(socket.id);

    const partner = findMatch(me);
    if (partner) {
      pairUsers(me, partner);
    } else {
      waitingQueue.push(me);
      socket.emit('waiting');
    }
  });

  socket.on('signal', ({ data }) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('signal', { data });
  });

  socket.on('chat-message', (message) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) io.to(partnerId).emit('chat-message', { message });
  });

  socket.on('skip', () => {
    handleDisconnectOrSkip(socket.id);
    const profile = userProfiles.get(socket.id) || { socketId: socket.id, userId, username, interests: [] };
    const partner = findMatch(profile);
    if (partner) {
      pairUsers(profile, partner);
    } else {
      waitingQueue.push(profile);
      socket.emit('waiting');
    }
  });

  // Block the current partner: saved to DB so they'll never be matched again
  socket.on('block-partner', () => {
    const partnerId = activePairs.get(socket.id);
    const partnerProfile = userProfiles.get(partnerId);
    if (partnerProfile) {
      db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)').run(
        userId,
        partnerProfile.userId
      );
    }
    handleDisconnectOrSkip(socket.id);
  });

  // Report the current partner: logged to DB with an optional reason
  socket.on('report-partner', (reason) => {
    const partnerId = activePairs.get(socket.id);
    const partnerProfile = userProfiles.get(partnerId);
    if (partnerProfile) {
      db.prepare('INSERT INTO reports (reporter_id, reported_id, reason) VALUES (?, ?, ?)').run(
        userId,
        partnerProfile.userId,
        reason || ''
      );
    }
  });

  socket.on('disconnect', () => {
    handleDisconnectOrSkip(socket.id);
    userProfiles.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

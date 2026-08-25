// ---- Config ----
// Free public STUN server. For production at scale, you'll likely also need a TURN
// server (not free) so calls work behind strict NATs/firewalls. See README.
const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// ---- DOM refs ----
const setupScreen = document.getElementById('setup-screen');
const callScreen = document.getElementById('call-screen');
const interestsInput = document.getElementById('interests');
const startBtn = document.getElementById('start-btn');
const skipBtn = document.getElementById('skip-btn');
const endBtn = document.getElementById('end-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const statusBadge = document.getElementById('status-badge');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

// ---- State ----
const socket = io();
let localStream = null;
let peerConnection = null;
let currentRoomId = null;

function setStatus(text, cls) {
  statusBadge.textContent = text;
  statusBadge.className = `status ${cls}`;
}

function addChatMessage(text, type) {
  const div = document.createElement('div');
  div.className = type === 'system' ? 'system' : `msg ${type}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function getLocalMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

function createPeerConnection() {
  const pc = new RTCPeerConnection(ICE_SERVERS);

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { roomId: currentRoomId, data: { candidate: event.candidate } });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') setStatus('কানেক্টেড', 'connected');
  };

  return pc;
}

async function startAsInitiator() {
  peerConnection = createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('signal', { roomId: currentRoomId, data: { sdp: offer } });
}

function startAsReceiver() {
  peerConnection = createPeerConnection();
}

function cleanupCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  chatMessages.innerHTML = '';
}

// ---- Socket events ----
socket.on('waiting', () => {
  setStatus('ম্যাচ খোঁজা হচ্ছে...', 'waiting');
});

socket.on('matched', async ({ roomId, initiator }) => {
  currentRoomId = roomId;
  setStatus('কানেক্ট হচ্ছে...', 'waiting');
  addChatMessage('একজন Stranger-এর সাথে কানেক্ট হয়েছে!', 'system');
  if (initiator) {
    await startAsInitiator();
  } else {
    startAsReceiver();
  }
});

socket.on('signal', async ({ data }) => {
  if (!peerConnection) return;
  if (data.sdp) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === 'offer') {
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', { roomId: currentRoomId, data: { sdp: answer } });
    }
  } else if (data.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error('Error adding ICE candidate', err);
    }
  }
});

socket.on('partner-left', () => {
  addChatMessage('Stranger চলে গেছে। নতুন ম্যাচ খোঁজা হচ্ছে...', 'system');
  cleanupCall();
  setStatus('ম্যাচ খোঁজা হচ্ছে...', 'waiting');
});

socket.on('chat-message', ({ message }) => {
  addChatMessage(message, 'other');
});

// ---- UI events ----
startBtn.addEventListener('click', async () => {
  try {
    await getLocalMedia();
  } catch (err) {
    alert('ক্যামেরা/মাইক্রোফোন পারমিশন দরকার। ব্রাউজার সেটিংস চেক করুন।');
    return;
  }
  setupScreen.classList.add('hidden');
  callScreen.classList.remove('hidden');

  const interests = interestsInput.value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  socket.emit('find-match', interests);
});

skipBtn.addEventListener('click', () => {
  cleanupCall();
  setStatus('ম্যাচ খোঁজা হচ্ছে...', 'waiting');
  socket.emit('skip');
});

endBtn.addEventListener('click', () => {
  cleanupCall();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  socket.disconnect();
  callScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  setStatus('অফলাইন', 'idle');
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat-message', text);
  addChatMessage(text, 'self');
  chatInput.value = '';
});

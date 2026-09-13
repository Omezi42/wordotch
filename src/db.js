import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, set, get, update, remove, onValue, off,
  push, onDisconnect, serverTimestamp, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { makeCard } from "./words.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function getPlayerId() {
  let id = localStorage.getItem("wordotch_pid");
  if (!id) {
    id = "p" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("wordotch_pid", id);
  }
  return id;
}

function randomRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export async function createRoom(playerName) {
  const playerId = getPlayerId();
  let roomId = randomRoomCode();
  // 衝突があれば作り直す
  for (let i = 0; i < 5; i++) {
    const snap = await get(ref(db, `rooms/${roomId}`));
    if (!snap.exists()) break;
    roomId = randomRoomCode();
  }
  await set(ref(db, `rooms/${roomId}`), {
    createdAt: serverTimestamp(),
    hostId: playerId,
    status: "lobby",
    players: {
      [playerId]: { name: playerName, score: 0, connected: true, joinedOrder: 0 },
    },
    playerOrder: [playerId],
  });
  attachPresence(roomId, playerId);
  return { roomId, playerId };
}

export async function joinRoom(roomId, playerName) {
  roomId = roomId.trim().toUpperCase();
  const playerId = getPlayerId();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snap = await get(roomRef);
  if (!snap.exists()) {
    throw new Error("その部屋番号は見つかりませんでした");
  }
  const room = snap.val();
  if (!room.players || !room.players[playerId]) {
    const order = room.playerOrder ? room.playerOrder.length : 0;
    await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
      name: playerName, score: 0, connected: true, joinedOrder: order,
    });
    const newOrder = [...(room.playerOrder || []), playerId];
    await set(ref(db, `rooms/${roomId}/playerOrder`), newOrder);
  } else {
    await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
      name: playerName, connected: true,
    });
  }
  attachPresence(roomId, playerId);
  return { roomId, playerId };
}

function attachPresence(roomId, playerId) {
  const connRef = ref(db, `rooms/${roomId}/players/${playerId}/connected`);
  set(connRef, true);
  onDisconnect(connRef).set(false);
}

export function listenRoom(roomId, callback) {
  const roomRef = ref(db, `rooms/${roomId}`);
  onValue(roomRef, (snap) => callback(snap.val()));
  return () => off(roomRef);
}

export async function leaveRoom(roomId, playerId) {
  await remove(ref(db, `rooms/${roomId}/players/${playerId}`));
}

// ---- ゲーム進行 ----

export async function startGame(roomId, room) {
  await update(ref(db, `rooms/${roomId}`), { status: "playing" });
  await startRound(roomId, room, 1, room.playerOrder[0]);
}

export async function startRound(roomId, room, roundNumber, oyaId) {
  const order = room.playerOrder;
  const children = order.filter((id) => id !== oyaId);
  const hands = {};

  for (const childId of children) {
    let card = makeCard();
    hands[childId] = card;
  }
  const oyaCards = [makeCard(), makeCard()];

  await set(ref(db, `rooms/${roomId}/round`), {
    number: roundNumber,
    oyaId,
    oyaCards,
    hands,
    phase: "choosing",
    chosenCriteria: null,
    champion: null,
    usedWords: {},
    queue: {},
    finalEntries: {},
    finalRevealed: false,
    winnerId: null,
    winningWord: null,
  });
}

export async function oyaChooseCriteria(roomId, cardIndex, championWord) {
  const roundRef = ref(db, `rooms/${roomId}/round`);
  const snap = await get(roundRef);
  const round = snap.val();
  const criteria = round.oyaCards[cardIndex].criteria;
  await update(roundRef, {
    chosenCriteria: criteria,
    phase: "investigate",
    champion: { word: championWord, ownerName: "親" },
  });
  await set(ref(db, `rooms/${roomId}/round/usedWords/${championWord}`), true);
}

export async function submitWord(roomId, playerId, playerName, word) {
  const newRef = push(ref(db, `rooms/${roomId}/round/queue`));
  await set(newRef, {
    playerId, playerName, word, status: "pending", ts: serverTimestamp(),
  });
  return newRef.key;
}

export async function judgeSubmission(roomId, subId, challengerWins) {
  const roundRef = ref(db, `rooms/${roomId}/round`);
  const snap = await get(roundRef);
  const round = snap.val();
  const sub = round.queue[subId];

  await update(ref(db, `rooms/${roomId}/round/queue/${subId}`), {
    status: challengerWins ? "won" : "lost",
  });
  await set(ref(db, `rooms/${roomId}/round/usedWords/${sub.word}`), true);

  if (challengerWins) {
    await update(roundRef, {
      champion: { word: sub.word, ownerName: sub.playerName, ownerId: sub.playerId },
    });
  }
}

export async function endInvestigation(roomId) {
  await update(ref(db, `rooms/${roomId}/round`), { phase: "final" });
}

export async function submitFinal(roomId, playerId, word) {
  await set(ref(db, `rooms/${roomId}/round/finalEntries/${playerId}`), word);
}

export async function revealFinal(roomId) {
  await update(ref(db, `rooms/${roomId}/round`), { finalRevealed: true });
}

export async function pickWinner(roomId, room, winnerId, winningWord) {
  const roundRef = ref(db, `rooms/${roomId}/round`);
  await update(roundRef, { phase: "reveal", winnerId, winningWord });
  if (winnerId) {
    const scoreRef = ref(db, `rooms/${roomId}/players/${winnerId}/score`);
    await runTransaction(scoreRef, (cur) => (cur || 0) + 1);
  }
}

export async function nextRound(roomId, room) {
  const order = room.playerOrder;
  const prevOyaId = room.round.oyaId;
  const prevIdx = order.indexOf(prevOyaId);
  const nextOyaId = order[(prevIdx + 1) % order.length];
  await startRound(roomId, room, room.round.number + 1, nextOyaId);
}

export async function backToLobby(roomId) {
  await update(ref(db, `rooms/${roomId}`), { status: "lobby", round: null });
}

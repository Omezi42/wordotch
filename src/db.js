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
  const roomSnap = await get(ref(db, `rooms/${roomId}`));
  if (!roomSnap.exists()) {
    throw new Error("その部屋番号は見つかりませんでした");
  }

  // 複数人がほぼ同時に参加しても取りこぼさないよう、
  // playerOrderへの追加はトランザクションで行う
  const orderRef = ref(db, `rooms/${roomId}/playerOrder`);
  const txResult = await runTransaction(orderRef, (currentOrder) => {
    currentOrder = currentOrder || [];
    if (!currentOrder.includes(playerId)) currentOrder.push(playerId);
    return currentOrder;
  });
  const order = txResult.snapshot.val() || [];
  const joinedOrder = order.indexOf(playerId);

  const existingPlayerSnap = await get(ref(db, `rooms/${roomId}/players/${playerId}`));
  if (existingPlayerSnap.exists()) {
    await update(ref(db, `rooms/${roomId}/players/${playerId}`), {
      name: playerName, connected: true,
    });
  } else {
    await set(ref(db, `rooms/${roomId}/players/${playerId}`), {
      name: playerName, score: 0, connected: true, joinedOrder,
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
  const roomSnap = await get(ref(db, `rooms/${roomId}`));
  if (!roomSnap.exists()) return;
  const room = roomSnap.val();

  const txResult = await runTransaction(ref(db, `rooms/${roomId}/playerOrder`), (currentOrder) => {
    currentOrder = currentOrder || [];
    return currentOrder.filter((id) => id !== playerId);
  });
  const newOrder = txResult.snapshot.val() || [];

  await remove(ref(db, `rooms/${roomId}/players/${playerId}`));

  if (newOrder.length === 0) {
    await remove(ref(db, `rooms/${roomId}`));
    return;
  }

  const updates = {};
  if (room.hostId === playerId) {
    updates.hostId = newOrder[0];
  }
  const wasPlaying = room.status === "playing" && room.round;
  const oyaLeft = wasPlaying && room.round.oyaId === playerId;
  if (wasPlaying && (oyaLeft || newOrder.length < 3)) {
    // 親が抜けた、または3人未満になった場合はラウンドを継続できないためロビーに戻す
    updates.status = "lobby";
    updates.round = null;
  }
  if (Object.keys(updates).length > 0) {
    await update(ref(db, `rooms/${roomId}`), updates);
  }
}

// ---- ゲーム進行 ----

export async function startGame(roomId, room, oyaId) {
  await update(ref(db, `rooms/${roomId}`), { status: "playing" });
  const startingOyaId = oyaId && room.players[oyaId] ? oyaId : room.playerOrder[0];
  await startRound(roomId, room, 1, startingOyaId);
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
  await set(ref(db, `rooms/${roomId}/history/${room.round.number}`), {
    number: room.round.number,
    criteria: room.round.chosenCriteria,
    oyaName: room.players[room.round.oyaId]?.name || "",
    winningWord,
    winnerName: winnerId ? (room.players[winnerId]?.name || "") : "",
  });
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

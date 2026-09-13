import {
  getPlayerId, createRoom, joinRoom, listenRoom, leaveRoom,
  startGame, oyaChooseCriteria, submitWord, judgeSubmission,
  endInvestigation, submitFinal, revealFinal, pickWinner, nextRound, backToLobby,
} from "./db.js";

const app = document.getElementById("app");

const state = {
  roomId: null,
  playerId: getPlayerId(),
  room: null,
};

// 再描画されても消えてほしくない、送信前の一時的な選択状態
const ui = {
  name: localStorage.getItem("wordotch_name") || "",
  joinCode: "",
  errorMsg: "",
  selectedCardIndex: null,
  championWord: null,
  wordInput: "",
  finalInput: "",
};

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function setScreen(html) {
  app.innerHTML = html;
}

// ---------- ホーム画面 ----------

function renderHome() {
  setScreen(`
    <div class="panel">
      <h2>友達と遊ぶ</h2>
      <div class="field">
        <label>あなたの名前</label>
        <input type="text" id="name-input" maxlength="12" placeholder="例：たろう" value="${esc(ui.name)}">
      </div>
      <div class="btn-row">
        <button id="create-btn">部屋を作る</button>
      </div>
    </div>
    <div class="panel">
      <h2>部屋に入る</h2>
      <div class="field">
        <label>部屋番号（4文字）</label>
        <input type="text" id="join-code-input" maxlength="4" placeholder="例：AB3D" value="${esc(ui.joinCode)}" style="text-transform:uppercase;letter-spacing:0.2em;font-weight:800;">
      </div>
      <div class="btn-row">
        <button id="join-btn" class="secondary">この部屋に入る</button>
      </div>
    </div>
    ${ui.errorMsg ? `<p class="error-msg">${esc(ui.errorMsg)}</p>` : ""}
    <div class="panel">
      <h2 style="margin-bottom:6px;">ルール早見表</h2>
      <p class="muted">
        3〜8人で遊ぶ会話ゲームです。親が秘密の「キジュン」を選び、みんなが言うワードをキジュンに沿って判定していきます。
        最後にみんなで「親が選びそうな優勝ワード」を予想し、当てた人が勝ちです。
      </p>
    </div>
  `);

  document.getElementById("name-input").addEventListener("input", (e) => {
    ui.name = e.target.value;
    localStorage.setItem("wordotch_name", ui.name);
  });
  document.getElementById("join-code-input").addEventListener("input", (e) => {
    ui.joinCode = e.target.value.toUpperCase();
  });
  document.getElementById("create-btn").addEventListener("click", async () => {
    ui.errorMsg = "";
    const name = ui.name.trim();
    if (!name) { ui.errorMsg = "名前を入力してください"; renderHome(); return; }
    try {
      const { roomId, playerId } = await createRoom(name);
      enterRoom(roomId, playerId);
    } catch (e) {
      ui.errorMsg = "部屋の作成に失敗しました。Firebaseの設定を確認してください。";
      renderHome();
      console.error(e);
    }
  });
  document.getElementById("join-btn").addEventListener("click", async () => {
    ui.errorMsg = "";
    const name = ui.name.trim();
    const code = ui.joinCode.trim();
    if (!name) { ui.errorMsg = "名前を入力してください"; renderHome(); return; }
    if (code.length !== 4) { ui.errorMsg = "部屋番号は4文字です"; renderHome(); return; }
    try {
      const { roomId, playerId } = await joinRoom(code, name);
      enterRoom(roomId, playerId);
    } catch (e) {
      ui.errorMsg = e.message || "参加に失敗しました";
      renderHome();
    }
  });
}

function enterRoom(roomId, playerId) {
  state.roomId = roomId;
  state.playerId = playerId;
  history.replaceState(null, "", `?room=${roomId}`);
  listenRoom(roomId, (room) => {
    if (!room) {
      state.room = null;
      ui.errorMsg = "部屋が見つかりませんでした（解散した可能性があります）";
      state.roomId = null;
      history.replaceState(null, "", location.pathname);
      renderHome();
      return;
    }
    state.room = room;
    render();
  });
}

// ---------- ロビー画面 ----------

function renderLobby() {
  const room = state.room;
  const players = room.playerOrder.map((id) => ({ id, ...room.players[id] }));
  const isHost = room.hostId === state.playerId;

  setScreen(`
    <div class="panel center">
      <h2>部屋番号</h2>
      <div class="room-code">${esc(state.roomId)}</div>
      <p class="muted">この番号を友達に伝えて「部屋に入る」から参加してもらいましょう</p>
    </div>
    <div class="panel">
      <h2>参加者（${players.length}人）</h2>
      <ul class="player-list">
        ${players.map((p) => `
          <li>
            <span>${esc(p.name)} ${p.id === room.hostId ? '<span class="tag">ホスト</span>' : ""}</span>
            <span>${p.connected === false ? '<span class="tag offline">オフライン</span>' : ""}</span>
          </li>
        `).join("")}
      </ul>
      ${isHost ? `
        <div class="btn-row">
          <button id="start-btn" ${players.length < 3 ? "disabled" : ""}>ゲーム開始</button>
        </div>
        ${players.length < 3 ? '<p class="muted">3人以上集まったら開始できます</p>' : ""}
      ` : `<p class="muted">ホストがゲームを開始するのを待っています…</p>`}
    </div>
    <div class="btn-row">
      <button id="leave-btn" class="ghost small">この部屋から退出する</button>
    </div>
  `);

  if (isHost) {
    document.getElementById("start-btn")?.addEventListener("click", () => {
      startGame(state.roomId, room);
    });
  }
  document.getElementById("leave-btn").addEventListener("click", async () => {
    await leaveRoom(state.roomId, state.playerId);
    location.href = location.pathname;
  });
}

// ---------- ゲーム画面共通 ----------

function scoreboardHtml(room) {
  const players = room.playerOrder.map((id) => ({ id, ...room.players[id] }));
  players.sort((a, b) => (b.score || 0) - (a.score || 0));
  return `
    <div class="panel">
      <div class="btn-row" style="justify-content:space-between;align-items:center;">
        <strong>ラウンド ${room.round.number}</strong>
        <span class="muted">親：${esc(room.players[room.round.oyaId]?.name || "")}</span>
      </div>
      <ul class="player-list">
        ${players.map((p) => `
          <li>
            <span>${esc(p.name)} ${p.id === room.round.oyaId ? '<span class="tag">親</span>' : ""}</span>
            <span class="score-pill">${p.score || 0}点</span>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function usedWordsHtml(round) {
  const used = Object.keys(round.usedWords || {});
  if (used.length === 0) return "";
  return `
    <div class="used-words">
      <div>使用済みワード：</div>
      <div class="word-row">${used.map((w) => `<span class="word-card used">${esc(w)}</span>`).join("")}</div>
    </div>
  `;
}

function render() {
  const room = state.room;
  if (!room) { renderHome(); return; }
  if (room.status === "lobby" || !room.round) { renderLobby(); return; }

  const phase = room.round.phase;
  if (phase === "choosing") renderChoosing();
  else if (phase === "investigate") renderInvestigate();
  else if (phase === "final") renderFinal();
  else if (phase === "reveal") renderReveal();
  else renderLobby();
}

// ---------- フェイズ：親がキジュンを選ぶ ----------

function renderChoosing() {
  const room = state.room;
  const round = room.round;
  const isOya = round.oyaId === state.playerId;

  if (!isOya) {
    setScreen(`
      ${scoreboardHtml(room)}
      <div class="panel center">
        <h2>親がキジュンを選んでいます…</h2>
        <p class="muted">親が2枚のカードから今回の「キジュン」を1つ選び、最初のワードを発表します。少々お待ちください。</p>
        <div class="word-row" style="justify-content:center;">
          ${(round.hands[state.playerId]?.words || []).map((w) => `<span class="word-card">${esc(w)}</span>`).join("")}
        </div>
        <p class="muted">↑あなたの手札（この中から後でワードを出せます）</p>
      </div>
    `);
    return;
  }

  const cards = round.oyaCards;
  setScreen(`
    ${scoreboardHtml(room)}
    <div class="panel">
      <h2>あなたが親です</h2>
      <p class="secret-note">この内容はあなただけに見えています。秘密にしておきましょう。</p>
      <p class="muted">2枚のカードのうち、今回の「キジュン」として使う方を選んでください。</p>
      <div class="vs-row">
        ${cards.map((c, i) => `
          <div class="vs-card" style="${ui.selectedCardIndex === i ? "border-color: var(--accent); background:#fff3d6;" : ""} cursor:pointer;" data-card="${i}">
            <div class="criteria-box" style="margin-bottom:8px;">
              <span class="label">キジュン案${i + 1}</span>
              ${esc(c.criteria)}
            </div>
            <div class="word-row">${c.words.map((w) => `<span class="word-card">${esc(w)}</span>`).join("")}</div>
          </div>
        `).join("")}
      </div>
      ${ui.selectedCardIndex !== null ? `
        <h3>最初の「暫定チャンピオン」ワードを選んでください</h3>
        <div class="word-row">
          ${cards[ui.selectedCardIndex].words.map((w) => `
            <span class="word-card ${ui.championWord === w ? "selected" : ""}" data-word="${esc(w)}">${esc(w)}</span>
          `).join("")}
        </div>
      ` : ""}
      <div class="btn-row">
        <button id="confirm-choosing" ${ui.selectedCardIndex === null || !ui.championWord ? "disabled" : ""}>この内容で決定する</button>
      </div>
    </div>
  `);

  document.querySelectorAll("[data-card]").forEach((elCard) => {
    elCard.addEventListener("click", () => {
      const idx = Number(elCard.dataset.card);
      ui.selectedCardIndex = idx;
      ui.championWord = null;
      render();
    });
  });
  document.querySelectorAll("[data-word]").forEach((elWord) => {
    elWord.addEventListener("click", () => {
      ui.championWord = elWord.dataset.word;
      render();
    });
  });
  document.getElementById("confirm-choosing")?.addEventListener("click", async () => {
    await oyaChooseCriteria(state.roomId, ui.selectedCardIndex, ui.championWord);
    ui.selectedCardIndex = null;
    ui.championWord = null;
  });
}

// ---------- フェイズ：調査 ----------

function renderInvestigate() {
  const room = state.room;
  const round = room.round;
  const isOya = round.oyaId === state.playerId;
  const champion = round.champion;

  const pendingEntries = Object.entries(round.queue || {})
    .filter(([, v]) => v.status === "pending")
    .sort((a, b) => a[0].localeCompare(b[0]));
  const judgedEntries = Object.entries(round.queue || {})
    .filter(([, v]) => v.status !== "pending")
    .sort((a, b) => a[0].localeCompare(b[0]));

  const championHtml = `
    <div class="champion-box">
      <div class="muted">現在の暫定チャンピオン</div>
      <div class="champion-word">${esc(champion.word)}</div>
      <div class="champion-owner">${esc(champion.ownerName)}</div>
    </div>
  `;

  if (isOya) {
    const current = pendingEntries[0];
    setScreen(`
      ${scoreboardHtml(room)}
      <div class="panel">
        <p class="secret-note">キジュン（あなただけに見えています）：<strong>${esc(round.chosenCriteria)}</strong></p>
        ${championHtml}
        ${current ? `
          <h3>判定してください</h3>
          <div class="vs-row">
            <div class="vs-card">${esc(champion.word)}<div class="muted" style="font-weight:400;">(現チャンピオン)</div></div>
            <div class="vs-versus">VS</div>
            <div class="vs-card">${esc(current[1].word)}<div class="muted" style="font-weight:400;">${esc(current[1].playerName)}</div></div>
          </div>
          <div class="btn-row">
            <button id="challenger-wins" class="secondary">「${esc(current[1].word)}」の勝ち</button>
            <button id="champion-wins">「${esc(champion.word)}」のまま</button>
          </div>
        ` : `<p class="muted">新しいワードが出てくるのを待っています…</p>`}
        ${judgedEntries.length ? `
          <h3>これまでの判定</h3>
          ${judgedEntries.map(([, v]) => `
            <div class="queue-item judged ${v.status}">
              <span class="word">${esc(v.word)}（${esc(v.playerName)}）</span>
              <span class="result-badge ${v.status}">${v.status === "won" ? "勝ち" : "負け"}</span>
            </div>
          `).join("")}
        ` : ""}
        ${usedWordsHtml(round)}
        <div class="btn-row">
          <button id="end-investigate-btn" class="secondary">決選フェイズに進む</button>
        </div>
      </div>
    `);

    document.getElementById("challenger-wins")?.addEventListener("click", () => {
      judgeSubmission(state.roomId, current[0], true);
    });
    document.getElementById("champion-wins")?.addEventListener("click", () => {
      judgeSubmission(state.roomId, current[0], false);
    });
    document.getElementById("end-investigate-btn").addEventListener("click", () => {
      endInvestigation(state.roomId);
    });
    return;
  }

  const myHand = round.hands[state.playerId]?.words || [];
  const used = round.usedWords || {};
  const myPending = pendingEntries.filter(([, v]) => v.playerId === state.playerId);

  setScreen(`
    ${scoreboardHtml(room)}
    <div class="panel">
      ${championHtml}
      <p class="muted">キジュンに合いそうなワードを自由に投げかけましょう。親が判定します。</p>
      <h3>手札から出す</h3>
      <div class="word-row">
        ${myHand.map((w) => `
          <span class="word-card ${used[w] ? "used" : ""}" ${used[w] ? "" : `data-quickword="${esc(w)}"`}>${esc(w)}</span>
        `).join("")}
      </div>
      <h3>自由に入力する</h3>
      <div class="field">
        <input type="text" id="word-input" maxlength="20" placeholder="ワードを入力" value="${esc(ui.wordInput)}">
      </div>
      <div class="btn-row">
        <button id="submit-word-btn">このワードを出す</button>
      </div>
      ${myPending.length ? `<p class="muted">${myPending.length}件、親の判定待ちです</p>` : ""}
      ${judgedEntries.length ? `
        <h3>これまでの判定</h3>
        ${judgedEntries.slice().reverse().map(([, v]) => `
          <div class="queue-item judged ${v.status}">
            <span class="word">${esc(v.word)}（${esc(v.playerName)}）</span>
            <span class="result-badge ${v.status}">${v.status === "won" ? "勝ち" : "負け"}</span>
          </div>
        `).join("")}
      ` : ""}
      ${usedWordsHtml(round)}
    </div>
  `);

  const input = document.getElementById("word-input");
  input.addEventListener("input", (e) => { ui.wordInput = e.target.value; });
  const doSubmit = async (word) => {
    word = (word || "").trim();
    if (!word) return;
    if (used[word]) { ui.errorMsg = "そのワードは使用済みです"; render(); return; }
    ui.wordInput = "";
    await submitWord(state.roomId, state.playerId, state.room.players[state.playerId].name, word);
    render();
  };
  document.getElementById("submit-word-btn").addEventListener("click", () => doSubmit(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSubmit(input.value); });
  document.querySelectorAll("[data-quickword]").forEach((elWord) => {
    elWord.addEventListener("click", () => doSubmit(elWord.dataset.quickword));
  });
}

// ---------- フェイズ：決選 ----------

function renderFinal() {
  const room = state.room;
  const round = room.round;
  const isOya = round.oyaId === state.playerId;
  const children = room.playerOrder.filter((id) => id !== round.oyaId);
  const entries = round.finalEntries || {};
  const allSubmitted = children.every((id) => entries[id]);

  if (isOya) {
    setScreen(`
      ${scoreboardHtml(room)}
      <div class="panel">
        <p class="secret-note">キジュン（あなただけに見えています）：<strong>${esc(round.chosenCriteria)}</strong></p>
        <h2>決選フェイズ</h2>
        <p class="muted">全員が「優勝ワード」を予想して入力中です。（${Object.keys(entries).length}/${children.length}人 提出済み）</p>
        ${usedWordsHtml(round)}
        ${!round.finalRevealed ? `
          <div class="btn-row">
            <button id="reveal-final-btn" ${allSubmitted ? "" : ""}>${allSubmitted ? "全員の予想を見る" : "まだ全員そろっていませんが見る"}</button>
          </div>
        ` : `
          <h3>一番ふさわしいワードを選んでください</h3>
          <ul class="final-entry-list">
            ${Object.entries(entries).map(([pid, word]) => `
              <li data-winner="${pid}" data-word="${esc(word)}">
                <span class="word">${esc(word)}</span>
                <span class="muted"> — ${esc(room.players[pid]?.name || "")}</span>
              </li>
            `).join("")}
          </ul>
        `}
      </div>
    `);
    document.getElementById("reveal-final-btn")?.addEventListener("click", () => revealFinal(state.roomId));
    document.querySelectorAll("[data-winner]").forEach((li) => {
      li.addEventListener("click", () => {
        pickWinner(state.roomId, room, li.dataset.winner, li.dataset.word);
      });
    });
    return;
  }

  const myHand = round.hands[state.playerId]?.words || [];
  const used = round.usedWords || {};
  const mySubmitted = entries[state.playerId];

  setScreen(`
    ${scoreboardHtml(room)}
    <div class="panel">
      <h2>決選フェイズ</h2>
      <p class="muted">これまでに出ていないワードの中から、親が選びそうな「優勝ワード」を1つ予想して送りましょう。</p>
      ${mySubmitted ? `
        <div class="champion-box">
          <div class="muted">あなたの予想</div>
          <div class="champion-word">${esc(mySubmitted)}</div>
        </div>
        <p class="muted">他のプレイヤーが提出するのを待っています…</p>
      ` : `
        <h3>手札から選ぶ</h3>
        <div class="word-row">
          ${myHand.map((w) => `
            <span class="word-card ${used[w] ? "used" : ""}" ${used[w] ? "" : `data-quickword="${esc(w)}"`}>${esc(w)}</span>
          `).join("")}
        </div>
        <h3>自由に入力する</h3>
        <div class="field">
          <input type="text" id="final-input" maxlength="20" placeholder="優勝ワードの予想" value="${esc(ui.finalInput)}">
        </div>
        <div class="btn-row">
          <button id="submit-final-btn">この予想で送る</button>
        </div>
      `}
      ${usedWordsHtml(round)}
    </div>
  `);

  if (!mySubmitted) {
    const input = document.getElementById("final-input");
    input.addEventListener("input", (e) => { ui.finalInput = e.target.value; });
    const doSubmit = async (word) => {
      word = (word || "").trim();
      if (!word) return;
      if (used[word]) { ui.errorMsg = "そのワードは既に使われています"; render(); return; }
      ui.finalInput = "";
      await submitFinal(state.roomId, state.playerId, word);
    };
    document.getElementById("submit-final-btn").addEventListener("click", () => doSubmit(input.value));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSubmit(input.value); });
    document.querySelectorAll("[data-quickword]").forEach((elWord) => {
      elWord.addEventListener("click", () => doSubmit(elWord.dataset.quickword));
    });
  }
}

// ---------- フェイズ：結果発表 ----------

function renderReveal() {
  const room = state.room;
  const round = room.round;
  const isHost = room.hostId === state.playerId;
  const winnerName = round.winnerId ? room.players[round.winnerId]?.name : "（該当なし）";

  setScreen(`
    ${scoreboardHtml(room)}
    <div class="winner-banner">
      <div class="muted">優勝ワード</div>
      <div class="win-word">${esc(round.winningWord || "-")}</div>
      <div class="win-name">${esc(winnerName)} さんの勝ち！</div>
    </div>
    <div class="panel">
      <div class="criteria-box">
        <span class="label">今回のキジュンは…</span>
        ${esc(round.chosenCriteria)}
      </div>
      <p class="muted">みんなで感想を話し合いましょう！</p>
      ${isHost ? `
        <div class="btn-row">
          <button id="next-round-btn">次のラウンドへ</button>
          <button id="end-game-btn" class="ghost small">ロビーに戻る</button>
        </div>
      ` : `<p class="muted">ホストが次のラウンドを開始するのを待っています…</p>`}
    </div>
  `);

  document.getElementById("next-round-btn")?.addEventListener("click", () => {
    nextRound(state.roomId, room);
  });
  document.getElementById("end-game-btn")?.addEventListener("click", () => {
    backToLobby(state.roomId);
  });
}

// ---------- 起動 ----------

function init() {
  const params = new URLSearchParams(location.search);
  const roomFromUrl = params.get("room");
  if (roomFromUrl) {
    ui.joinCode = roomFromUrl.toUpperCase();
  }
  renderHome();
}

init();

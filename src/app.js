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
  startingOyaId: null,
};

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// ---------- ルール説明用イラスト（SVG） ----------

const ICONS = {
  cards: `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="18" width="30" height="40" rx="4" transform="rotate(-12 10 18)" fill="var(--sub)" stroke="var(--accent-dark)" stroke-width="2"/>
      <rect x="20" y="14" width="30" height="40" rx="4" fill="#fff" stroke="var(--accent-dark)" stroke-width="2"/>
      <circle cx="35" cy="26" r="4" fill="var(--accent)"/>
      <line x1="27" y1="38" x2="43" y2="38" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
      <line x1="27" y1="44" x2="43" y2="44" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  duel: `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="17" cy="26" rx="15" ry="12" fill="#fff" stroke="var(--accent-dark)" stroke-width="2"/>
      <path d="M10 36 L6 46 L18 38 Z" fill="#fff" stroke="var(--accent-dark)" stroke-width="2"/>
      <ellipse cx="47" cy="26" rx="15" ry="12" fill="var(--sub)" stroke="var(--accent-dark)" stroke-width="2"/>
      <path d="M54 36 L58 46 L46 38 Z" fill="var(--sub)" stroke="var(--accent-dark)" stroke-width="2"/>
      <text x="32" y="31" font-size="14" font-weight="800" fill="var(--accent-dark)" text-anchor="middle">VS</text>
    </svg>`,
  guess: `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="26" r="16" fill="var(--sub)" stroke="var(--accent-dark)" stroke-width="2"/>
      <rect x="26" y="40" width="12" height="10" rx="2" fill="#fff" stroke="var(--accent-dark)" stroke-width="2"/>
      <line x1="26" y1="46" x2="38" y2="46" stroke="var(--accent-dark)" stroke-width="2"/>
      <path d="M32 14 a10 10 0 0 1 6 18 c-2 1.5 -2 3 -2 4 h-8 c0 -1 0 -2.5 -2 -4 a10 10 0 0 1 6 -18 Z" fill="#fff9e8"/>
      <text x="32" y="50" font-size="0" ></text>
      <path d="M20 50 q12 10 24 0" stroke="var(--accent)" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`,
  trophy: `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 14 h24 v14 a12 12 0 0 1 -24 0 Z" fill="var(--sub)" stroke="var(--accent-dark)" stroke-width="2"/>
      <path d="M20 16 h-8 a2 2 0 0 0 -2 2 c0 8 5 12 10 13" fill="none" stroke="var(--accent-dark)" stroke-width="2"/>
      <path d="M44 16 h8 a2 2 0 0 1 2 2 c0 8 -5 12 -10 13" fill="none" stroke="var(--accent-dark)" stroke-width="2"/>
      <rect x="28" y="40" width="8" height="8" fill="var(--accent-dark)"/>
      <rect x="22" y="48" width="20" height="6" rx="2" fill="var(--accent)"/>
      <circle cx="14" cy="10" r="2" fill="var(--accent)"/>
      <circle cx="50" cy="8" r="2" fill="var(--accent)"/>
      <circle cx="52" cy="18" r="1.6" fill="var(--sub)"/>
    </svg>`,
  crown: `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 42 L10 24 L22 34 L32 18 L42 34 L54 24 L52 42 Z" fill="var(--sub)" stroke="var(--accent-dark)" stroke-width="2" stroke-linejoin="round"/>
      <rect x="12" y="42" width="40" height="8" rx="2" fill="var(--accent)" stroke="var(--accent-dark)" stroke-width="2"/>
    </svg>`,
  speech: `
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 16 h44 a4 4 0 0 1 4 4 v18 a4 4 0 0 1 -4 4 H26 l-10 10 v-10 h-6 a4 4 0 0 1 -4 -4 V20 a4 4 0 0 1 4 -4 Z" fill="#fff" stroke="var(--accent-dark)" stroke-width="2"/>
      <circle cx="22" cy="29" r="2.5" fill="var(--accent)"/>
      <circle cx="32" cy="29" r="2.5" fill="var(--accent)"/>
      <circle cx="42" cy="29" r="2.5" fill="var(--accent)"/>
    </svg>`,
};

function ruleStep(icon, title, desc) {
  return `
    <div class="rule-step">
      <div class="rule-icon">${ICONS[icon]}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </div>
  `;
}

function setScreen(html) {
  app.innerHTML = html;
}

// ---------- ホーム画面 ----------

function renderHome() {
  setScreen(`
    <div class="hero-panel">
      <div class="hero-icon">${ICONS.guess}</div>
      <h2 class="hero-title">キジュンを読んで、みんなを驚かせろ！</h2>
      <p class="hero-sub">親だけが知る「なぞのキジュン」を、言葉のバトルから読み解く会話ゲームです。</p>
    </div>

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
      <h2 style="margin-bottom:4px;">遊び方は4ステップ</h2>
      <p class="muted" style="margin-top:0;">3〜8人向け。1ラウンドはだいたい3〜5分です。</p>
      <div class="rules-steps">
        ${ruleStep("cards", "① 親を決めてカードを配る", "親には2枚のカードが配られます。カードの裏には「キジュン」が書かれていて、親はそれを見て今回使う方をこっそり選びます。")}
        ${ruleStep("duel", "② ワードを出し合って判定", "親がまず1つワードを発表。あとはみんな自由にワードを出していき、親がキジュンに沿って「今のチャンピオン vs 新しいワード」を判定します。")}
        ${ruleStep("guess", "③ 優勝ワードをみんなで予想", "頃合いを見て親が調査を打ち切り、決選フェイズへ。まだ出ていないワードの中から「親が選びそうな1つ」をこっそり考えて、せーので発表します。")}
        ${ruleStep("trophy", "④ 親が優勝ワードを選んで発表", "親が一番ふさわしいと思ったワードを選び、それを出した人の勝ち。最後にキジュンを公開して、答え合わせをみんなで楽しみましょう。")}
      </div>
      <div class="role-row">
        <div class="role-chip">
          <span class="role-icon">${ICONS.crown}</span>
          <div>
            <strong>親</strong>
            <p>キジュンを選び、ワード対決を判定する審判役。ラウンドごとに持ち回りです。</p>
          </div>
        </div>
        <div class="role-chip">
          <span class="role-icon">${ICONS.speech}</span>
          <div>
            <strong>子</strong>
            <p>ワードを出して親の判定を受ける挑戦者役。決選フェイズでは予想もします。</p>
          </div>
        </div>
      </div>
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

  if (!ui.startingOyaId || !room.players[ui.startingOyaId]) {
    ui.startingOyaId = room.hostId;
  }

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
        <h3 style="margin-bottom:6px;">最初の親を選ぶ</h3>
        <p class="muted" style="margin-top:0;">指定しなければあなた（ホスト）が最初の親になります。2ラウンド目以降は自動で持ち回りです。</p>
        <div class="word-row">
          ${players.map((p) => `
            <span class="word-card ${ui.startingOyaId === p.id ? "selected" : ""}" data-oya="${p.id}">${esc(p.name)}</span>
          `).join("")}
        </div>
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
    document.querySelectorAll("[data-oya]").forEach((elP) => {
      elP.addEventListener("click", () => {
        ui.startingOyaId = elP.dataset.oya;
        render();
      });
    });
    document.getElementById("start-btn")?.addEventListener("click", () => {
      startGame(state.roomId, room, ui.startingOyaId);
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
  if (!room.playerOrder || !room.players) {
    // 複数人がほぼ同時に参加した瞬間など、ごく短時間だけ
    // Firebaseから不完全なスナップショットが届くことがあるための保険
    setScreen('<p class="loading">読み込み中...</p>');
    return;
  }
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

  const current = pendingEntries[0];
  const judgingHtml = current ? `
    <h3>親が今判定している勝負</h3>
    <div class="vs-row">
      <div class="vs-card">${esc(champion.word)}<div class="muted" style="font-weight:400;">(現チャンピオン)</div></div>
      <div class="vs-versus">VS</div>
      <div class="vs-card">${esc(current[1].word)}<div class="muted" style="font-weight:400;">${esc(current[1].playerName)}</div></div>
    </div>
  ` : "";

  if (isOya) {
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
          ${judgedEntries.slice().reverse().map(([, v]) => `
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
      ${judgingHtml}
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

  const survivorHtml = `
    <div class="champion-box">
      <div class="muted">調査フェイズを勝ち残ったワード</div>
      <div class="champion-word">${esc(round.champion.word)}</div>
      <div class="champion-owner">${esc(round.champion.ownerName)}</div>
    </div>
  `;

  if (isOya) {
    setScreen(`
      ${scoreboardHtml(room)}
      <div class="panel">
        <p class="secret-note">キジュン（あなただけに見えています）：<strong>${esc(round.chosenCriteria)}</strong></p>
        <h2>決選フェイズ</h2>
        ${survivorHtml}
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
      ${survivorHtml}
      <p class="muted">これまでに出ていないワードの中から、親が選びそうな「優勝ワード」を1つ予想して送りましょう。</p>
      ${round.finalRevealed ? `
        <h3>みんなの予想</h3>
        <ul class="final-entry-list readonly">
          ${Object.entries(entries).map(([pid, word]) => `
            <li>
              <span class="word">${esc(word)}</span>
              <span class="muted"> — ${esc(room.players[pid]?.name || "")}${pid === state.playerId ? "（あなた）" : ""}</span>
            </li>
          `).join("")}
        </ul>
        <p class="muted">親が優勝ワードを選んでいます…</p>
      ` : mySubmitted ? `
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

  if (!mySubmitted && !round.finalRevealed) {
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

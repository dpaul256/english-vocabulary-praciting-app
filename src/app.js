const els = {
  total: document.querySelector('#total'),
  done: document.querySelector('#done'),
  wrongCount: document.querySelector('#wrongCount'),
  learnedCount: document.querySelector('#learnedCount'),
  mode: document.querySelector('#mode'),
  type: document.querySelector('#type'),
  repeatLimit: document.querySelector('#repeatLimit'),
  prepareRepeatBtn: document.querySelector('#prepareRepeatBtn'),
  nextBtn: document.querySelector('#nextBtn'),
  skipBtn: document.querySelector('#skipBtn'),
  resetBtn: document.querySelector('#resetBtn'),
  prompt: document.querySelector('#prompt'),
  hint: document.querySelector('#hint'),
  options: document.querySelector('#options'),
  result: document.querySelector('#result'),
  example: document.querySelector('#example'),
  typingForm: document.querySelector('#typingForm'),
  typedAnswer: document.querySelector('#typedAnswer'),
  wrongList: document.querySelector('#wrongList'),
  repeatPanel: document.querySelector('#repeatPanel'),
  repeatTitle: document.querySelector('#repeatTitle'),
  repeatIntro: document.querySelector('#repeatIntro'),
  repeatVocabList: document.querySelector('#repeatVocabList'),
  startRepeatBtn: document.querySelector('#startRepeatBtn'),
  cancelRepeatBtn: document.querySelector('#cancelRepeatBtn'),
  quizBadge: document.querySelector('#quizBadge')
};

const DEFAULT_STATE = {
  done: 0,
  wrongBook: [],
  wordStats: {},
  repeat: null
};
let vocabCache = [];
let current = null;
let answeringLocked = false;
let state = loadState();
dedupeWrongBook();
save();

function loadState() {
  const raw = JSON.parse(localStorage.getItem('toeicQuizState') || 'null');
  if (!raw) return structuredClone(DEFAULT_STATE);

  if (Array.isArray(raw.wrong) && !Array.isArray(raw.wrongBook)) {
    raw.wrongBook = raw.wrong.map(w => ({
      id: w.id || w.word,
      word: w.word,
      pos: w.pos,
      meaning: w.meaning,
      addedAt: Date.now(),
      reason: 'wrong'
    }));
    delete raw.wrong;
  }
  return {
    ...structuredClone(DEFAULT_STATE),
    ...raw,
    wrongBook: Array.isArray(raw.wrongBook) ? raw.wrongBook : [],
    wordStats: raw.wordStats || {},
    repeat: raw.repeat || null
  };
}

function save() {
  localStorage.setItem('toeicQuizState', JSON.stringify(state));
}

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normalizeEnglish(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function splitAnswers(text) {
  return String(text || '')
    .split(/[；;、，,\/]/)
    .map(x => normalize(x))
    .filter(Boolean);
}

function isCorrectAnswer(userAnswer, correctAnswer, mode) {
  if (mode === 'zh-to-en') {
    return normalizeEnglish(userAnswer) === normalizeEnglish(correctAnswer);
  }
  else {
    if (userAnswer === correctAnswer) {
      return true;
    }
  }

  const user = normalize(userAnswer);
  const answers = splitAnswers(correctAnswer);
  console.log('Checking answer:', answers, 'against user input:', user);
  
  return answers.includes(user);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getStats(id) {
  const key = String(id);
  if (!state.wordStats[key]) state.wordStats[key] = { correct: 0, wrong: 0, streak: 0, learned: false };
  return state.wordStats[key];
}
function accuracyText(id) {
  const s = getStats(id);
  const total = s.correct + s.wrong;
  return total ? `${Math.round((s.correct / total) * 100)}%` : '尚未作答';
}
function learnedIds() {
  return Object.entries(state.wordStats)
    .filter(([, s]) => s && s.learned)
    .map(([id]) => id);
}
function wrongIds() {
  return state.wrongBook.map(w => String(w.id));
}
function dedupeWrongBook() {
  const seen = new Set();
  state.wrongBook = state.wrongBook.filter(w => {
    const id = String(w.id || w.word);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    w.id = id;
    return true;
  });
}
function isRepeatPreparing() {
  return state.repeat && state.repeat.phase === 'prepare';
}
function isRepeatTesting() {
  return state.repeat && state.repeat.phase === 'test';
}

function renderStats() {
  const learned = learnedIds().length;
  els.done.textContent = state.done;
  els.wrongCount.textContent = state.wrongBook.length;
  els.learnedCount.textContent = learned;

  if (!state.wrongBook.length) {
    els.wrongList.className = 'wrong-list empty';
    els.wrongList.textContent = '目前沒有錯題。';
  } else {
    els.wrongList.className = 'wrong-list';
    els.wrongList.innerHTML = state.wrongBook.slice().reverse().map(w => {
      const s = getStats(w.id);
      return `
        <div class="wrong-item">
          <b>${escapeHtml(w.word)} ${w.pos ? `<small>(${escapeHtml(w.pos)})</small>` : ''}</b>
          <span>${escapeHtml(w.meaning)}</span>
          <div class="meta-row">
            <small>單字答對率：${accuracyText(w.id)}</small>
            <small>連對：${s.streak}/3</small>
            ${s.learned ? '<small class="learned">已學會</small>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  const need = Number(els.repeatLimit.value || 10);
  if (els.prepareRepeatBtn) {
    els.prepareRepeatBtn.disabled = Boolean(state.repeat) || state.wrongBook.length === 0;
    els.prepareRepeatBtn.textContent = state.wrongBook.length >= need
      ? `從錯題簿隨機抽 ${need} 題重測`
      : `錯題不足 ${need} 題，先抽 ${state.wrongBook.length} 題重測`;
  }
  renderRepeatPanel();
}

function addToWrongBook(item, reason = 'wrong') {
  const id = String(item.id);
  const existing = state.wrongBook.find(w => String(w.id) === id);
  if (existing) {
    existing.reason = reason;
    existing.lastSeenAt = Date.now();
    return;
  }
  state.wrongBook.push({
    id,
    word: item.word,
    pos: item.pos,
    meaning: item.meaning,
    addedAt: Date.now(),
    reason
  });
}

function updateWordStats(item, ok) {
  const s = getStats(item.id);
  if (ok) {
    s.correct += 1;
    s.streak += 1;
    if (s.streak >= 3) {
      s.learned = true;
      // 已學會後，也從錯題簿移除，避免一般模式再出現。
      state.wrongBook = state.wrongBook.filter(w => String(w.id) !== String(item.id));
    }
  } else {
    s.wrong += 1;
    s.streak = 0;
    s.learned = false;
  }
}

function makeEnglishHint(word) {
  const clean = String(word || '').trim();
  if (!clean) return '';
  if (clean.length <= 2) return clean;
  const first = clean[0];
  const last = clean[clean.length - 1];
  const middle = clean.slice(1, -1).replace(/[A-Za-z]/g, '_');
  return `${first}${middle}${last}（${clean.length} 個字母）`;
}

function normalizeEnglish(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[，。；;、,.!！?？()（）\[\]{}]/g, ' ')
    .replace(/[^a-z\-\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadMeta() {
  vocabCache = Array.isArray(window.VOCAB) ? window.VOCAB : [];
  els.total.textContent = vocabCache.length;
}

function makeQuestion() {
  const mode = els.mode.value || 'en-to-zh';
  const basePool = vocabCache.filter(v => v.word && v.meaning);

  let pool = basePool;

  if (isRepeatTesting()) {
    const ids = state.repeat.ids || [];
    const index = state.repeat.index || 0;
    const currentId = String(ids[index] || ids[0] || '');
    pool = basePool.filter(v => String(v.id) === currentId);
  } else {
    const exclude = new Set(learnedIds().map(String));
    pool = basePool.filter(v => !exclude.has(String(v.id)));
  }

  if (!pool.length) {
    return { error: '全部可練習單字都已學會，或目前題組沒有可出的題目。' };
  }

  const answer = pool[Math.floor(Math.random() * pool.length)];
  let wrongPool;
  let prompt;
  let correct;
  let hint = '';

  if (mode === 'zh-to-en') {
    prompt = answer.meaning;
    correct = answer.word;
    hint = makeEnglishHint(answer.word);
    wrongPool = basePool.filter(v => v.word !== answer.word).map(v => v.word);
  } else {
    prompt = `${answer.word}${answer.pos ? ' (' + answer.pos + ')' : ''}`;
    correct = answer.meaning;
    wrongPool = basePool.filter(v => v.meaning !== answer.meaning).map(v => v.meaning);
  }

  const options = shuffle([correct, ...shuffle(wrongPool).slice(0, 3)]);

  return {
    id: answer.id,
    mode,
    prompt,
    hint,
    options,
    answer: correct,
    word: answer.word,
    pos: answer.pos,
    meaning: answer.meaning,
    example: answer.example || ''
  };
}

function checkAnswerLocally(userAnswer, isTyping) {
  const item = vocabCache.find(v => String(v.id) === String(current.id));

  if (!item) {
    throw new Error('Question not found');
  }

  const correct = current.mode === 'zh-to-en'
    ? item.word
    : item.meaning;

  const answer = userAnswer;

  const ok = current.mode === 'zh-to-en'
    ? normalizeEnglish(answer) === normalizeEnglish(correct)
    : isCorrectAnswer(answer, correct);

  return {
    ok,
    correct,
    item
  };
}
async function nextQuestion() {
  if (isRepeatPreparing()) {
    renderRepeatPanel();
    return;
  }

  answeringLocked = false;
  els.result.textContent = '';
  els.result.className = 'result';
  els.example.textContent = '';
  els.options.innerHTML = '';
  els.typedAnswer.value = '';
  els.hint.textContent = '';
  els.hint.classList.add('hidden');
  els.skipBtn.disabled = false;

  current = makeQuestion();

  if (current.error) {
    els.prompt.textContent = '目前沒有可出的題目';
    els.result.textContent = current.error;
    els.typingForm.classList.add('hidden');
    els.options.classList.add('hidden');
    return;
  }

  const badge = isRepeatTesting()
    ? `錯題重測 ${state.repeat.index + 1}/${state.repeat.ids.length}`
    : '一般練習';
  els.quizBadge.textContent = badge;
  els.prompt.textContent = current.prompt;

  const isTyping = els.type.value === 'typing';
  if (isTyping && current.mode === 'zh-to-en' && current.hint) {
    els.hint.textContent = `提示：${current.hint}`;
    els.hint.classList.remove('hidden');
  }

  if (isTyping) {
    els.options.classList.add('hidden');
    els.typingForm.classList.remove('hidden');
    els.typedAnswer.placeholder = current.mode === 'zh-to-en'
      ? '輸入英文單字後按 Enter'
      : '輸入中文意思後按 Enter';
    setTimeout(() => els.typedAnswer.focus(), 50);
  } else {
    els.options.classList.remove('hidden');
    els.typingForm.classList.add('hidden');
    current.options.forEach(option => {
      const btn = document.createElement('button');
      btn.className = 'option';
      btn.textContent = option;
      btn.onclick = () => check(option, btn, false);
      els.options.appendChild(btn);
    });
  }
}

async function check(userAnswer, btn = null, isTyping = els.type.value === 'typing') {
  if (!current || answeringLocked) return;
  answeringLocked = true;
  els.skipBtn.disabled = true;
  els.result.textContent = '';
  els.result.className = 'result';

  const data = checkAnswerLocally(userAnswer, isTyping);
  state.done += 1;
  updateWordStats(data.item, data.ok);

  if (data.ok) {
    const s = getStats(data.item.id);
    els.result.textContent = s.learned ? '✅ 正確，已連續答對 3 次，標記為已學會' : `✅ 正確，${data.correct}，連對 ${s.streak}/3`;
    els.result.className = 'result ok';
    if (btn) btn.classList.add('correct');
  } else {
    els.result.textContent = `❌ 錯，答案是：${data.correct}`;
    els.result.className = 'result no';
    if (!isRepeatTesting()) addToWrongBook(data.item, 'wrong');
    if (btn) btn.classList.add('wrong');
    document.querySelectorAll('.option').forEach(b => {
      if (normalize(b.textContent) === normalize(data.correct)) b.classList.add('correct');
    });
  }


  els.example.textContent = data.item.example ? `例句：${data.item.example}` : '';
  document.querySelectorAll('.option').forEach(b => b.disabled = true);

  if (isRepeatTesting()) {
    advanceRepeat(data.ok, data.item.id);
  }

  save();
  renderStats();
}

function skipQuestion() {
  if (!current || answeringLocked) return;
  answeringLocked = true;
  state.done += 1;
  updateWordStats(current, false);
  if (!isRepeatTesting()) addToWrongBook(current, 'skip');

  els.result.textContent = `⏭️ 已跳過，加入錯題簿。答案是：${current.answer}`;
  els.result.className = 'result no';
  els.example.textContent = current.example ? `例句：${current.example}` : '';
  els.skipBtn.disabled = true;
  document.querySelectorAll('.option').forEach(b => b.disabled = true);

  if (isRepeatTesting()) {
    advanceRepeat(false, current.id);
  }
  save();
  renderStats();
}

function enterRepeatPrepare(limit) {
  dedupeWrongBook();
  const picked = shuffle(state.wrongBook).slice(0, Math.min(limit, state.wrongBook.length));
  const ids = picked.map(w => String(w.id));
  if (!ids.length) {
    els.result.textContent = '錯題簿目前沒有題目，先練習並累積錯題。';
    els.result.className = 'result no';
    return;
  }
  state.repeat = { phase: 'prepare', ids, index: 0, startedAt: Date.now() };
  save();
  renderStats();
}

function renderRepeatPanel() {
  if (!state.repeat) {
    els.repeatPanel.classList.add('hidden');
    els.quizBadge.textContent = '一般練習';
    return;
  }

  els.repeatPanel.classList.remove('hidden');
  const ids = state.repeat.ids || [];
  const items = ids
    .map(id =>
      vocabCache.find(v => String(v.id) === String(id)) ||
      state.wrongBook.find(w => String(w.id) === String(id))
    )
    .filter(Boolean);

  if (state.repeat.phase === 'prepare') {
    els.repeatTitle.textContent = `本次從錯題簿抽出 ${ids.length} 題，先背這批`;
    els.repeatIntro.textContent = '下面先放大列出「單字 / 詞性 / 中文」。背完按開始，只會考這批；答對的題目會從錯題簿移除。';
    els.startRepeatBtn.classList.remove('hidden');
    els.cancelRepeatBtn.textContent = '先不要重測';
    els.quizBadge.textContent = '錯題背誦模式';

    // 只有 prepare 階段顯示單字列表
    els.repeatVocabList.classList.remove('hidden');
    els.repeatVocabList.innerHTML = items.map(item => `
      <div class="repeat-card">
        <strong>${escapeHtml(item.word)}</strong>
        <em>${escapeHtml(item.pos || '')}</em>
        <span>${escapeHtml(item.meaning)}</span>
      </div>
    `).join('');
  } else {
    els.repeatTitle.textContent = `錯題重測進行中 ${state.repeat.index + 1}/${ids.length}`;
    els.repeatIntro.textContent = '目前只會考這批錯題；答對的題目會從錯題簿移除，答錯或跳過的題目會保留。';
    els.startRepeatBtn.classList.add('hidden');
    els.cancelRepeatBtn.textContent = '取消重測';
    els.quizBadge.textContent = '錯題重測模式';

    // test 階段隱藏 prepare 的單字列表
    els.repeatVocabList.classList.add('hidden');
    els.repeatVocabList.innerHTML = '';
  }
}

function startRepeatTest() {
  if (!state.repeat) return;
  state.repeat.phase = 'test';
  state.repeat.ids = shuffle(state.repeat.ids || []);
  state.repeat.index = 0;
  state.repeat.correctIds = [];
  save();
  renderRepeatPanel();
  nextQuestion();
}

function advanceRepeat(wasCorrect = false, itemId = null) {
  if (!state.repeat) return;

  if (!Array.isArray(state.repeat.correctIds)) {
    state.repeat.correctIds = [];
  }

  if (wasCorrect && itemId !== null) {
    const id = String(itemId);
    if (!state.repeat.correctIds.includes(id)) {
      state.repeat.correctIds.push(id);
    }
  }

  state.repeat.index += 1;

  if (state.repeat.index >= state.repeat.ids.length) {
    const correctIds = new Set((state.repeat.correctIds || []).map(String));
    const removedCount = correctIds.size;

    state.wrongBook = state.wrongBook.filter(w => !correctIds.has(String(w.id)));
    state.repeat = null;

    setTimeout(() => {
      els.result.textContent = `🎉 錯題重測完成，答對的 ${removedCount} 題已從錯題簿移除，答錯或跳過的題目會保留。`;
      els.result.className = 'result ok';
      save();
      renderStats();
      nextQuestion();
    }, 450);
  }
}

function cancelRepeat() {
  if (!state.repeat) return;
  if (state.repeat.phase === 'test') {
    state.repeat.phase = 'prepare';
    save();
    renderStats();
    nextQuestion();
  }
  else if (state.repeat.phase === 'prepare') {
    save();
    state.repeat = null;
    renderStats();
    nextQuestion();
    return;
  }
  
}

els.nextBtn.addEventListener('click', nextQuestion);
els.prepareRepeatBtn.addEventListener('click', () => enterRepeatPrepare(Number(els.repeatLimit.value || 10)));
els.skipBtn.addEventListener('click', skipQuestion);
els.mode.addEventListener('change', nextQuestion);
els.type.addEventListener('change', nextQuestion);
els.repeatLimit.addEventListener('change', renderStats);
els.startRepeatBtn.addEventListener('click', startRepeatTest);
els.cancelRepeatBtn.addEventListener('click', cancelRepeat);
els.resetBtn.addEventListener('click', () => {
  state = structuredClone(DEFAULT_STATE);
  save();
  renderStats();
  nextQuestion();
});
els.typingForm.addEventListener('submit', e => {
  e.preventDefault();
  check(els.typedAnswer.value, null, true);
});

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') nextQuestion();
});

(async function init() {
  await loadMeta();
  renderStats();
  nextQuestion();
})();

// G検定対策アプリ MVP:
// 分野選択 / 今日の復習 → 出題 → 回答 → 即時採点 → FSRS-4.5による次回復習日の算出
// オフライン動作前提のため fetch を使わず、他スクリプトのグローバル値をそのまま利用する。

(function () {
  "use strict";

  let sessionQuestions = [];
  let currentMode = { type: "all" };
  let currentIndex = 0;
  let correctCount = 0;
  let answered = false;

  const els = {
    categoryScreen: document.getElementById("category-screen"),
    categoryList: document.getElementById("category-list"),
    examDateInput: document.getElementById("exam-date-input"),
    examDateHint: document.getElementById("exam-date-hint"),
    dueReviewBtn: document.getElementById("due-review-btn"),
    dueCountLabel: document.getElementById("due-count-label"),
    progress: document.getElementById("progress-bar"),
    syllabusTag: document.getElementById("syllabus-tag"),
    questionText: document.getElementById("question-text"),
    choices: document.getElementById("choices"),
    feedback: document.getElementById("feedback"),
    gradeBox: document.getElementById("grade-box"),
    nextDueInfo: document.getElementById("next-due-info"),
    nextBtn: document.getElementById("next-btn"),
    quizCard: document.getElementById("quiz-card"),
    resultCard: document.getElementById("result-card"),
    resultText: document.getElementById("result-text"),
    restartBtn: document.getElementById("restart-btn"),
    backToCategoryBtn: document.getElementById("back-to-category-btn"),
  };

  // ---- 試験日設定 ----

  function loadExamDateIntoUI() {
    const settings = Storage.loadSettings();
    if (settings.examDate) {
      els.examDateInput.value = settings.examDate;
    }
    updateExamDateHint(settings.examDate);
  }

  function updateExamDateHint(examDate) {
    if (!examDate) {
      els.examDateHint.textContent = "未設定（目標保持率90%固定で運用）";
      return;
    }
    const today = Schedule.todayStr();
    const days = Schedule.daysBetween(today, examDate);
    els.examDateHint.textContent = days >= 0
      ? `試験まであと${days}日（間に合わないカードのみ保持率を自動的に引き上げます）`
      : "試験日が過去日になっています";
  }

  els.examDateInput.addEventListener("change", () => {
    const value = els.examDateInput.value || null;
    Storage.saveSettings({ examDate: value });
    updateExamDateHint(value);
    renderCategoryScreen(); // 「今日の復習」件数の再計算は不要だが表示を最新化
  });

  function getExamDate() {
    return Storage.loadSettings().examDate;
  }

  // ---- FSRS due 判定 ----

  function isDue(questionId, today) {
    const state = Storage.getCardState(questionId);
    if (!state) return true; // 未学習カードは常に「今日の復習」対象
    return state.dueAt <= today;
  }

  function computeDueQuestions() {
    const today = Schedule.todayStr();
    return QUESTIONS
      .filter((q) => isDue(q.id, today))
      .slice()
      .sort((a, b) => {
        const stateA = Storage.getCardState(a.id);
        const stateB = Storage.getCardState(b.id);
        const dueA = stateA ? stateA.dueAt : today;
        const dueB = stateB ? stateB.dueAt : today;
        return dueA < dueB ? -1 : dueA > dueB ? 1 : 0;
      });
  }

  // ---- 分野選択画面 ----

  function shuffle(array) {
    const result = array.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function countByCategory(categoryId) {
    return QUESTIONS.filter((q) => q.categoryId === categoryId).length;
  }

  function renderCategoryScreen() {
    const dueCount = computeDueQuestions().length;
    els.dueCountLabel.textContent = `${dueCount}問`;
    els.dueReviewBtn.disabled = dueCount === 0;

    els.categoryList.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "category-btn all-category";
    allBtn.innerHTML = `<span>全分野からランダム練習</span><span class="count">${QUESTIONS.length}問</span>`;
    allBtn.addEventListener("click", () => startQuiz({ type: "all" }));
    els.categoryList.appendChild(allBtn);

    let lastDomain = null;
    CATEGORIES.forEach((cat) => {
      if (cat.domain !== lastDomain) {
        const groupLabel = document.createElement("div");
        groupLabel.className = "category-group-label";
        groupLabel.textContent = `【${cat.domain}分野】`;
        els.categoryList.appendChild(groupLabel);
        lastDomain = cat.domain;
      }

      const count = countByCategory(cat.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "category-btn";
      btn.innerHTML = `<span>${cat.label}</span><span class="count">${count}問</span>`;
      if (count === 0) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => startQuiz({ type: "category", id: cat.id }));
      }
      els.categoryList.appendChild(btn);
    });
  }

  els.dueReviewBtn.addEventListener("click", () => startQuiz({ type: "due" }));

  // ---- 出題セッション ----

  function buildPool(mode) {
    if (mode.type === "due") return computeDueQuestions(); // 既にdueAt順
    if (mode.type === "category") return shuffle(QUESTIONS.filter((q) => q.categoryId === mode.id));
    return shuffle(QUESTIONS);
  }

  function startQuiz(mode) {
    const pool = buildPool(mode);
    if (pool.length === 0) {
      backToCategoryScreen(); // 件数表示を更新した上で分野選択画面に戻す
      return;
    }

    currentMode = mode;
    sessionQuestions = pool;
    currentIndex = 0;
    correctCount = 0;

    els.categoryScreen.hidden = true;
    els.progress.hidden = false;
    els.quizCard.hidden = false;
    els.resultCard.hidden = true;

    renderQuestion();
  }

  function renderQuestion() {
    answered = false;
    const q = sessionQuestions[currentIndex];

    els.progress.textContent = `問題 ${currentIndex + 1} / ${sessionQuestions.length}　正解数 ${correctCount}`;
    els.syllabusTag.textContent = `${q.syllabusSection}（syllabusVersion: ${q.syllabusVersion}）`;
    els.questionText.textContent = q.question;

    els.choices.innerHTML = "";
    // 選択肢の「元のインデックス（データ上の位置）」をシャッフルして表示順に使う。
    // 問題データ側で正解が特定の位置に偏っていても、表示は毎回ランダムな順序になる。
    const displayOrder = shuffle(q.choices.map((_, idx) => idx));
    displayOrder.forEach((originalIdx) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = q.choices[originalIdx];
      btn.dataset.originalIndex = String(originalIdx);
      btn.addEventListener("click", () => handleAnswer(originalIdx));
      li.appendChild(btn);
      els.choices.appendChild(li);
    });

    els.feedback.hidden = true;
    els.feedback.textContent = "";
    els.feedback.className = "feedback";
    els.gradeBox.hidden = true;
    els.nextDueInfo.hidden = true;
    els.nextBtn.hidden = true;
  }

  function handleAnswer(selectedIndex) {
    if (answered) return;
    answered = true;

    const q = sessionQuestions[currentIndex];
    const buttons = els.choices.querySelectorAll(".choice-btn");
    const isCorrect = selectedIndex === q.correctIndex;

    buttons.forEach((btn) => {
      const btnIdx = Number(btn.dataset.originalIndex);
      btn.disabled = true;
      if (btnIdx === selectedIndex && btnIdx === q.correctIndex) {
        btn.classList.add("selected-correct");
      } else if (btnIdx === selectedIndex && btnIdx !== q.correctIndex) {
        btn.classList.add("selected-incorrect");
      } else if (btnIdx === q.correctIndex) {
        btn.classList.add("reveal-correct");
      }
    });

    if (isCorrect) correctCount++;

    // 回答直後に進捗表示を即時更新する（次の問題に進むまで古い正解数が
    // 表示され続け、最終結果と数字が食い違って見えるバグの修正）
    els.progress.textContent = `問題 ${currentIndex + 1} / ${sessionQuestions.length}　正解数 ${correctCount}`;

    els.feedback.hidden = false;
    els.feedback.classList.add(isCorrect ? "correct" : "incorrect");

    const sourcesHtml = (q.sourceUrls && q.sourceUrls.length)
      ? `<div class="sources">根拠資料: ${q.sourceUrls
          .map((u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
          .join(" / ")}</div>`
      : "";

    els.feedback.innerHTML = `
      <strong>${isCorrect ? "正解" : "不正解"}</strong>
      <div class="explanation">${q.explanation}</div>
      ${sourcesHtml}
    `;

    if (isCorrect) {
      // 正解時はHard/Good/Easyの自己申告を待ってからFSRS更新する
      els.gradeBox.hidden = false;
    } else {
      // 不正解は自動的に Again(1) として即時更新する
      applyGrade(1);
      els.nextBtn.hidden = false;
    }
  }

  els.gradeBox.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const grade = Number(btn.dataset.grade);
      applyGrade(grade);
      els.gradeBox.hidden = true;
      els.nextBtn.hidden = false;
    });
  });

  // grade: 1=Again 2=Hard 3=Good 4=Easy
  function applyGrade(grade) {
    const q = sessionQuestions[currentIndex];

    try {
      const today = Schedule.todayStr();
      const prevState = Storage.getCardState(q.id);

      let difficulty, stability;
      if (prevState) {
        const elapsedDays = Math.max(0, Schedule.daysBetween(prevState.lastReviewedAt, today));
        const result = FSRS.scheduleReview(prevState.difficulty, prevState.stability, elapsedDays, grade);
        difficulty = result.difficulty;
        stability = result.stability;
      } else {
        const result = FSRS.scheduleNewCard(grade);
        difficulty = result.difficulty;
        stability = result.stability;
      }

      if (!Number.isFinite(difficulty) || !Number.isFinite(stability)) {
        throw new Error(`FSRS計算結果が不正です（difficulty=${difficulty}, stability=${stability}）`);
      }

      const examDate = getExamDate();
      const r = Schedule.desiredRetention(stability, examDate, today);
      const intervalDays = FSRS.nextIntervalDays(r, stability);

      if (!Number.isFinite(intervalDays)) {
        throw new Error(`次回間隔の計算結果が不正です（r=${r}, stability=${stability}, intervalDays=${intervalDays}）`);
      }

      const dueAt = Schedule.addDays(today, intervalDays);

      const newState = {
        difficulty,
        stability,
        dueAt,
        lastReviewedAt: today,
        reps: (prevState ? prevState.reps : 0) + 1,
        lapses: (prevState ? prevState.lapses : 0) + (grade === 1 ? 1 : 0),
      };
      Storage.setCardState(q.id, newState);

      // 保存直後に読み直して、実際にlocalStorageへ反映されたことを確認する
      const verify = Storage.getCardState(q.id);
      if (!verify || verify.dueAt !== dueAt) {
        throw new Error("localStorageへの保存を読み直したところ内容が一致しませんでした");
      }

      els.nextDueInfo.hidden = false;
      els.nextDueInfo.className = "next-due-info";
      els.nextDueInfo.textContent =
        `次回復習予定: ${dueAt}（約${intervalDays}日後 / 目標保持率${Math.round(r * 100)}%）`;
    } catch (e) {
      console.error("applyGrade失敗:", e);
      els.nextDueInfo.hidden = false;
      els.nextDueInfo.className = "next-due-info error";
      els.nextDueInfo.textContent =
        `復習スケジュールの保存に失敗しました（${e.message}）。F12でコンソールを確認してください。`;
    }
  }

  function nextQuestion() {
    if (currentIndex < sessionQuestions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      showResult();
    }
  }

  function showResult() {
    els.quizCard.hidden = true;
    els.progress.hidden = true;
    els.resultCard.hidden = false;
    els.resultText.textContent = `${sessionQuestions.length}問中 ${correctCount}問 正解しました。`;
  }

  function backToCategoryScreen() {
    els.resultCard.hidden = true;
    els.quizCard.hidden = true;
    els.progress.hidden = true;
    els.categoryScreen.hidden = false;
    renderCategoryScreen();
  }

  els.nextBtn.addEventListener("click", nextQuestion);
  els.restartBtn.addEventListener("click", () => startQuiz(currentMode));
  els.backToCategoryBtn.addEventListener("click", backToCategoryScreen);

  loadExamDateIntoUI();
  renderCategoryScreen();
})();

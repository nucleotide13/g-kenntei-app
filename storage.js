// localStorage を使った学習状態の永続化。
// 「AI添削のみオンライン必須。それ以外はローカルで完結させる」方針に基づき、
// 復習スケジュールはすべてブラウザのlocalStorageに保存する（サーバー通信なし）。

const Storage = (function () {
  "use strict";

  const CARD_STATES_KEY = "gkentei.cardStates.v1";
  const SETTINGS_KEY = "gkentei.settings.v1";

  function safeParse(json, fallback) {
    if (!json) return fallback;
    try {
      return JSON.parse(json);
    } catch (e) {
      console.warn("Storage: JSON解析に失敗したため既定値を使用します", e);
      return fallback;
    }
  }

  // カード状態: { [questionId]: { difficulty, stability, dueAt, lastReviewedAt, reps, lapses } }
  function loadCardStates() {
    try {
      return safeParse(localStorage.getItem(CARD_STATES_KEY), {});
    } catch (e) {
      console.error("Storage: localStorageの読み込みに失敗しました", e);
      return {};
    }
  }

  function saveCardStates(states) {
    try {
      localStorage.setItem(CARD_STATES_KEY, JSON.stringify(states));
    } catch (e) {
      console.error("Storage: localStorageへの書き込みに失敗しました（file://での実行時はブラウザの設定で無効化されている場合があります）", e);
      throw e;
    }
  }

  function getCardState(questionId) {
    const states = loadCardStates();
    return states[questionId] || null;
  }

  function setCardState(questionId, state) {
    const states = loadCardStates();
    states[questionId] = state;
    saveCardStates(states);
  }

  // 設定: { examDate: "YYYY-MM-DD" | null }
  function loadSettings() {
    return safeParse(localStorage.getItem(SETTINGS_KEY), { examDate: null });
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  return {
    loadCardStates,
    saveCardStates,
    getCardState,
    setCardState,
    loadSettings,
    saveSettings,
  };
})();

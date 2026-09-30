// FSRS-4.5 コアロジック
//
// 【重要】CLAUDE.md「復習アルゴリズムは FSRS-4.5。自作しない」に従い、
// 公開されている FSRS-4.5 の正式な数式・デフォルトパラメータをそのまま実装したもの。
// 独自のスコアリングや間隔計算は一切含まない。
//
// 一次資料（2026-08-29 に確認）：
//   https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
//   （FSRS v4 / v4.5 共通の数式セクション。FSRS-4.5はFACTOR/DECAYのみv4と異なる）
//
// grade（評価）の対応：1=Again（不正解） 2=Hard 3=Good 4=Easy
// このアプリでは「不正解→Again」「正解→ユーザーがHard/Good/Easyを自己申告」で運用する。

const FSRS = (function () {
  "use strict";

  // FSRS-4.5 デフォルトパラメータ w[0]〜w[16]（17個）
  // 出典: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
  const W = [
    0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031,
    1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755
  ];

  // FSRS-4.5 の忘却曲線パラメータ（v4は FACTOR=1/9, DECAY=-1 だが 4.5 で変更された）
  const FACTOR = 19 / 81;
  const DECAY = -0.5;

  const MIN_DIFFICULTY = 1;
  const MAX_DIFFICULTY = 10;
  const MIN_STABILITY = 0.01;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // S0(G) = w[G-1]
  function initStability(grade) {
    return W[grade - 1];
  }

  // D0(G) = w4 - (G-3)*w5 、[1,10]にクランプ
  function initDifficulty(grade) {
    const d = W[4] - (grade - 3) * W[5];
    return clamp(d, MIN_DIFFICULTY, MAX_DIFFICULTY);
  }

  // D'(D,G) = w7*D0(3) + (1-w7)*(D - w6*(G-3)) 、[1,10]にクランプ（mean reversion）
  function nextDifficulty(prevDifficulty, grade) {
    const d0Good = initDifficulty(3);
    const d = W[7] * d0Good + (1 - W[7]) * (prevDifficulty - W[6] * (grade - 3));
    return clamp(d, MIN_DIFFICULTY, MAX_DIFFICULTY);
  }

  // R(t,S) = (1 + FACTOR * t/S) ^ DECAY
  function retrievability(elapsedDays, stability) {
    return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
  }

  // 復習成功時（Hard/Good/Easy）:
  // S'_r(D,S,R,G) = S * ( e^w8 * (11-D) * S^-w9 * (e^(w10*(1-R)) - 1) * hardPenalty * easyBonus + 1 )
  function nextStabilityOnRecall(prevDifficulty, prevStability, r, grade) {
    const hardPenalty = grade === 2 ? W[15] : 1;
    const easyBonus = grade === 4 ? W[16] : 1;
    const s = prevStability * (
      Math.exp(W[8]) *
        (11 - prevDifficulty) *
        Math.pow(prevStability, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus +
      1
    );
    return Math.max(s, MIN_STABILITY);
  }

  // 忘却時（Again）: S'_f(D,S,R) = w11 * D^-w12 * ((S+1)^w13 - 1) * e^(w14*(1-R))
  function nextStabilityOnForget(prevDifficulty, prevStability, r) {
    const s =
      W[11] *
      Math.pow(prevDifficulty, -W[12]) *
      (Math.pow(prevStability + 1, W[13]) - 1) *
      Math.exp(W[14] * (1 - r));
    return Math.max(s, MIN_STABILITY);
  }

  // I(r,S) = (S/FACTOR) * (r^(1/DECAY) - 1)
  // 目標保持率 r と安定度 S から、次回復習までの間隔（日数）を求める。
  function nextIntervalDays(desiredRetention, stability) {
    const interval = (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1);
    return Math.max(1, Math.round(interval));
  }

  // カードの初回学習（レビュー履歴なし）。
  function scheduleNewCard(grade) {
    return {
      difficulty: initDifficulty(grade),
      stability: initStability(grade),
    };
  }

  // 既存カードの復習後の更新。elapsedDays は前回レビューからの経過日数。
  function scheduleReview(prevDifficulty, prevStability, elapsedDays, grade) {
    const r = retrievability(Math.max(elapsedDays, 0), prevStability);
    const difficulty = nextDifficulty(prevDifficulty, grade);
    const stability =
      grade === 1
        ? nextStabilityOnForget(prevDifficulty, prevStability, r)
        : nextStabilityOnRecall(prevDifficulty, prevStability, r, grade);
    return { difficulty, stability, retrievabilityAtReview: r };
  }

  return {
    W,
    FACTOR,
    DECAY,
    initStability,
    initDifficulty,
    nextDifficulty,
    retrievability,
    nextStabilityOnRecall,
    nextStabilityOnForget,
    nextIntervalDays,
    scheduleNewCard,
    scheduleReview,
  };
})();

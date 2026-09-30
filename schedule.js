// 試験日から逆算した目標保持率の動的調整。
//
// 設計根拠: learning-science エージェント委任結果（2026-08-29）より。
//   通常時は目標保持率 r=0.90（py-fsrs / FSRS4Anki tutorial のデフォルトに準拠）。
//   カードの安定度 S が、試験日までの残日数 D を上回る場合のみ（＝そのまま
//   放置すると試験日より後に復習が来てしまうカードのみ）、
//   I(r,S) = D を r について逆算した r' = sqrt(81S / (81S + 19D)) を適用する。
//   r' は S=D のとき 0.90、S>D で 0.90 を超えて上昇する（数式の性質上、
//   下限0.90は自然に満たされるため追加のfloor処理は不要）。
//   上限は FSRS4Anki tutorial が「これを超えると間隔反復ではなく集中学習になる」
//   と明記する 0.97 でキャップする。
//
// 【要確認事項（learning-science報告より）】このキャップにより、試験直前で
// S が非常に大きいカードは「試験日に必ず間に合う」保証が失われる場合がある。

const Schedule = (function () {
  "use strict";

  const DEFAULT_RETENTION = 0.9;
  const MAX_RETENTION = 0.97;

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // "YYYY-MM-DD" 文字列同士の日数差（b - a）。DSTの影響を避けるためUTC正午基準で計算。
  function daysBetween(aStr, bStr) {
    const a = new Date(`${aStr}T12:00:00Z`);
    const b = new Date(`${bStr}T12:00:00Z`);
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  }

  function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // 試験日設定と安定度 S から、このカードに適用する目標保持率を決める。
  function desiredRetention(stability, examDate, today) {
    if (!examDate) return DEFAULT_RETENTION;

    const daysUntilExam = daysBetween(today, examDate);
    if (daysUntilExam <= 0) {
      // 試験当日または試験日を過ぎている場合は最大キャップを適用（詰め込み相当）
      return MAX_RETENTION;
    }
    if (stability <= daysUntilExam) {
      // 通常のr=0.90運用でも試験日までに復習が来る＝調整不要
      return DEFAULT_RETENTION;
    }

    const r = Math.sqrt((81 * stability) / (81 * stability + 19 * daysUntilExam));
    return Math.min(r, MAX_RETENTION);
  }

  return {
    DEFAULT_RETENTION,
    MAX_RETENTION,
    todayStr,
    daysBetween,
    addDays,
    desiredRetention,
  };
})();

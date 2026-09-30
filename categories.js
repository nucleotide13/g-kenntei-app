// G検定 出題分野マスタ
//
// ユーザー提示の10分野構成をそのまま採用。
// 公式シラバスとの照合は syllabus-watch エージェントに確認依頼中（未確定）。
// 確認が取れ次第、各分野の label / 対応バージョンをここで更新すること。

const CATEGORIES = [
  { id: "intro",                  label: "人工知能とは",                 domain: "技術" },
  { id: "trend",                  label: "人工知能をめぐる動向",         domain: "技術" },
  { id: "ml-overview",            label: "機械学習の概要",               domain: "技術" },
  { id: "dl-overview",            label: "ディープラーニングの概要",     domain: "技術" },
  { id: "dl-elements",            label: "ディープラーニングの要素技術", domain: "技術" },
  { id: "dl-applications",        label: "ディープラーニングの応用例",   domain: "技術" },
  { id: "social-implementation",  label: "AIの社会実装に向けて",         domain: "技術" },
  { id: "math-stats",             label: "AIに必要な数理・統計知識",     domain: "技術" },
  { id: "law-contract",           label: "AIに関する法律と契約",         domain: "法律・倫理" },
  { id: "ethics-governance",      label: "AI倫理・AIガバナンス",         domain: "法律・倫理" },
];

const ALL_CATEGORY_ID = "all";

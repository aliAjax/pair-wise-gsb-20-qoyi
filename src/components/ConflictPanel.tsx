import type { Draft } from "../types";
import type { DBState, FieldDiff } from "../logic";
import { diffBatchAgainst } from "../logic";
import { fmtTimeFull } from "../utils";

/**
 * 版本冲突对照面板：
 * 后保存一方被拦在此处，必须对照新版本（对方的保存结果）后显式选择，
 * 任何路径都不会直接覆盖对方已保存的染色备注/重点结构。
 */
export function ConflictPanel({
  db,
  draft,
  onMerge,
  onAdoptTheirs,
  onCancel,
}: {
  db: DBState;
  draft: Draft;
  onMerge: () => void;
  onAdoptTheirs: () => void;
  onCancel: () => void;
}) {
  const diffs: FieldDiff[] = diffBatchAgainst(db, draft);
  const batch = db.batches.find((b) => b.id === draft.batchId);

  return (
    <div className="conflict-panel">
      <div className="conflict-head">
        <h3>⚠ 检测到版本冲突</h3>
        <p>
          你进入编辑时批次为 <b>v{draft.baseVersion}</b>，
          当前已被推进到 <b>v{batch?.version}</b>。
          你的保存已被拦下，<b>对方的内容没有被覆盖</b>。请逐字段对照后选择如何处理。
        </p>
      </div>

      <div className="diff-table">
        <div className="diff-row diff-header">
          <span>字段</span>
          <span>你进入时（v{draft.baseVersion}）</span>
          <span>你的草稿</span>
          <span>当前新版本 v{batch?.version}（对方已保存）</span>
        </div>
        {diffs.length === 0 && (
          <div className="diff-row">
            <span className="diff-label">无字段变化</span>
            <span className="diff-empty">字段内容无变化，差异来自批次状态或版本（如对方刚确认了批次）。</span>
          </div>
        )}
        {diffs.map((d, i) => (
          <div className="diff-row" key={i}>
            <span className="diff-label">{d.label}</span>
            <span className="diff-base">{d.base || "—"}</span>
            <span className="diff-mine">{d.draft || "—"}</span>
            <span className="diff-theirs">
              {d.current || "—"}
              {d.newerObservation && (
                <em className="diff-author">{d.newerObservation.author} · {fmtTimeFull(d.newerObservation.savedAt)}</em>
              )}
            </span>
          </div>
        ))}
      </div>
      <p className="diff-note">
        观察记录采用追加制：对方的重点结构记录已保留在正式列表中，不会被任何人的保存覆盖。
      </p>

      <div className="conflict-actions">
        <button className="primary-action" onClick={onMerge}>
          以我的修改为准合入（在 v{batch?.version} 基础上重放，回编辑后再确认一次）
        </button>
        <button onClick={onAdoptTheirs}>
          保留对方新版本（我的染色改动作废，观察内容仍可保存）
        </button>
        <button className="ghost-btn" onClick={onCancel}>返回再看看</button>
      </div>
    </div>
  );
}

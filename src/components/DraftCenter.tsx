import { discardDraft, fmtTime, getBatchById, getSampleById, useDrafts } from "../store";
import type { Draft } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onRestore: (draft: Draft) => void;
}

/**
 * 浏览器关闭重开后的恢复入口：
 * 只恢复“未确认草稿”，标明所属批次与版本；草稿永远不与正式记录混排。
 */
export default function DraftCenter({ open, onClose, onRestore }: Props) {
  const drafts = useDrafts();
  if (!open) return null;

  return (
    <div className="drawer-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <header className="drawer-head">
          <div>
            <p className="eyebrow">本地未确认内容</p>
            <h2>草稿箱</h2>
            <p className="hint">
              草稿只存在本机本浏览器，<b>不是正式记录</b>；保存成功或批次确认后会自动清理。
            </p>
          </div>
          <button className="ghost-btn" onClick={onClose}>×</button>
        </header>

        {drafts.length === 0 ? (
          <div className="empty-box">当前没有未确认草稿。</div>
        ) : (
          <ul className="draft-list">
            {drafts.map((d) => {
              const batch = getBatchById(d.batchId);
              const sample = batch ? getSampleById(batch.sampleId) : undefined;
              const stale = batch ? batch.version !== d.baseVersion : false;
              const confirmed = batch?.confirmed;
              return (
                <li key={d.id} className="draft-item">
                  <div className="draft-flags">
                    <span className="flag-draft">未确认草稿 · 非正式</span>
                    {!batch && <span className="flag-danger">批次已不存在</span>}
                    {confirmed && <span className="flag-danger">批次已确认 · 只能转补录</span>}
                    {!confirmed && stale && (
                      <span className="flag-warn">版本已过期 v{d.baseVersion} → v{batch?.version}</span>
                    )}
                  </div>
                  <h3>{sample?.name ?? "未知样本"} · {batch?.code ?? "批次缺失"}</h3>
                  <p className="draft-line">{d.keyStructure || "（重点结构未填）"}</p>
                  {d.stainNote && <p className="draft-line dim">{d.stainNote}</p>}
                  <p className="draft-meta">
                    所属批次 {batch?.code ?? "—"} · 染色 {batch?.stain ?? "—"} · 基于版本 v{d.baseVersion}
                    <br />
                    记录人 {d.person} · 窗口 {d.windowId} · 自动保存于 {fmtTime(d.savedAt ?? d.baseTime)}
                  </p>
                  <div className="draft-actions">
                    <button
                      className="primary-action"
                      disabled={!batch}
                      onClick={() => onRestore(d)}
                    >
                      {confirmed
                        ? "恢复并转补录对照"
                        : stale
                        ? "恢复并对照新版本"
                        : "恢复编辑"}
                    </button>
                    <button className="ghost-btn" onClick={() => discardDraft(d.id)}>丢弃</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}

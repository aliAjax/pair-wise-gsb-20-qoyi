import type { Draft } from "../types";
import type { DBState } from "../logic";
import { fmtAge } from "../utils";

/**
 * 未确认草稿待办：浏览器重开后草稿只出现在这里。
 * 明确标注所属批次、进入时版本与当前版本的差距，
 * 不存在“草稿被当正式记录”的路径。
 */
export function DraftTray({
  db,
  drafts,
  onResume,
  onDiscard,
}: {
  db: DBState;
  drafts: Draft[];
  onResume: (draft: Draft) => void;
  onDiscard: (id: string) => void;
}) {
  if (drafts.length === 0) return null;

  return (
    <section className="draft-tray panel">
      <div className="section-heading">
        <div>
          <p className="tray-eyebrow">未确认草稿 · 非正式记录</p>
          <h2>待办草稿（{drafts.length}）</h2>
        </div>
        <p className="tray-note">浏览器关闭后恢复：这些内容尚未确认保存，只属于草稿工作区</p>
      </div>
      <div className="draft-grid">
        {drafts.map((d) => {
          const batch = db.batches.find((b) => b.id === d.batchId);
          const stale = batch ? batch.version > d.baseVersion : false;
          return (
            <article key={d.id} className={stale ? "draft-card stale" : "draft-card"}>
              <div className="draft-card-head">
                <strong>{d.batchCode}</strong>
                <em className={stale ? "pill stale" : "pill"}>
                  {stale ? `进入时 v${d.baseVersion} → 当前 v${batch!.version}` : `基于 v${d.baseVersion}`}
                </em>
              </div>
              <p className="draft-who">
                {d.author} · 更新于 {fmtAge(d.updatedAt)}
                {batch?.status === "confirmed" && <em className="pill confirmed">批次已确认·补录</em>}
              </p>
              <p className="draft-preview">
                {[d.magnification, d.keyStructure, d.description].filter(Boolean).join(" · ") ||
                  "（尚未填写观察内容）"}
              </p>
              {stale && <p className="stale-warn">批次已被他人保存推进版本，继续后需对照新版本，不能直接覆盖</p>}
              <div className="draft-actions">
                <button className="primary-action" onClick={() => onResume(d)}>继续编辑</button>
                <button className="ghost-btn" onClick={() => {
                  if (window.confirm("丢弃这份未确认草稿？")) onDiscard(d.id);
                }}>丢弃</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

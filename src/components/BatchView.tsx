import { useState } from "react";
import type { StainBatch } from "../types";
import type { DBState } from "../logic";
import { batchObservations, confirmBatch } from "../logic";
import { mutate } from "../db";
import { fmtTime, fmtTimeFull } from "../utils";

export function BatchView({
  db,
  batch,
  operator,
  onNewObservation,
}: {
  db: DBState;
  batch: StainBatch;
  operator: string;
  onNewObservation: () => void;
}) {
  const sample = db.samples.find((s) => s.id === batch.sampleId);
  const observations = batchObservations(db, batch.id);
  const [conclusion, setConclusion] = useState(batch.conclusion);
  const [editingConclusion, setEditingConclusion] = useState(false);

  const frozen = batch.status === "confirmed";
  const supplementCount = observations.filter((o) => o.isSupplement).length;

  return (
    <section className="batch-view panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{sample?.name ?? "未知样本"} · {sample?.type}</p>
          <h2>
            {batch.code}
            <em className={frozen ? "pill confirmed big" : "pill open big"}>
              {frozen ? "已确认（可补录）" : "观察中"}
            </em>
          </h2>
          <p className="batch-sub">
            开批 {batch.openedBy} · {fmtTime(batch.openedAt)} · 当前版本 v{batch.version}
            {frozen && batch.confirmedAt && <> · 确认 {batch.confirmedBy} · {fmtTimeFull(batch.confirmedAt)}</>}
          </p>
        </div>
        <button className="primary-action" onClick={onNewObservation}>
          {frozen ? "补录观察记录" : "＋ 新增观察记录"}
        </button>
      </div>

      <div className="stain-block">
        <h3>染色批次信息</h3>
        <dl className="stain-grid">
          <div>
            <dt>染色方式</dt>
            <dd>{batch.stainMethod}</dd>
          </div>
          <div className="span-2">
            <dt>染色备注</dt>
            <dd>{batch.stainNote || "（无）"}</dd>
          </div>
        </dl>
        <p className="edit-hint">染色方式与备注可在“新增观察记录”时一并修改，保存同样按批次版本核对</p>
      </div>

      {frozen ? (
        <div className="conclusion-block frozen">
          <div className="conclusion-head">
            <h3>确认时冻结结论</h3>
            <span className="lock-note">🔒 补录不会改变此结论</span>
          </div>
          <p>{batch.conclusion || "（确认时未填写结论）"}</p>
        </div>
      ) : (
        <div className="conclusion-block">
          <div className="conclusion-head">
            <h3>批次结论（确认时冻结）</h3>
            <button className="link-btn" onClick={() => {
              if (!operator) return window.alert("请先在右上角输入当前操作人姓名。");
              setEditingConclusion((v) => !v);
            }}>
              {editingConclusion ? "取消" : "编辑并确认"}
            </button>
          </div>
          {editingConclusion ? (
            <div className="confirm-form">
              <textarea
                rows={3}
                value={conclusion}
                onChange={(e) => setConclusion(e.target.value)}
                placeholder="汇总结论，例如：结构完整，可归档为示范片"
              />
              <button
                className="primary-action"
                disabled={!conclusion.trim()}
                onClick={() => {
                  mutate((d) => confirmBatch(d, batch.id, operator, conclusion));
                  setEditingConclusion(false);
                }}
              >
                确认批次（{observations.length} 条记录将随结论冻结，之后仅可补录）
              </button>
            </div>
          ) : (
            <p className="empty-hint">批次观察中。确认后当前 {observations.length} 条记录与结论一并冻结，仍可追加补录。</p>
          )}
        </div>
      )}

      <div className="obs-block">
        <h3>
          正式观察记录（{observations.length}）
          {supplementCount > 0 && <span className="supplement-note">含 {supplementCount} 条确认后补录</span>}
        </h3>
        <div className="obs-list">
          {observations.map((o, i) => (
            <article key={o.id} className={o.isSupplement ? "obs-card supplement" : "obs-card"}>
              <div className="obs-index">{String(i + 1).padStart(2, "0")}</div>
              <div className="obs-body">
                <div className="obs-head">
                  <strong>{o.magnification} · {o.keyStructure}</strong>
                  <span className="obs-versions">
                    基于 v{o.baseVersion} → 落库 v{o.savedAtVersion}
                    {o.isSupplement && <em className="pill supplement">补录</em>}
                  </span>
                </div>
                {o.description && <p>{o.description}</p>}
                <p className="obs-meta">{o.author} · {fmtTimeFull(o.savedAt)}</p>
              </div>
            </article>
          ))}
          {observations.length === 0 && <p className="empty-hint">还没有正式记录。点击右上角新增。</p>}
        </div>
      </div>
    </section>
  );
}

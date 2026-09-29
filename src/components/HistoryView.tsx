import { useMemo, useState } from "react";
import type { DBState } from "../logic";
import type { LogAction } from "../types";
import { fmtTimeFull } from "../utils";

const ACTION_LABEL: Record<LogAction, string> = {
  "batch.create": "建批",
  "batch.edit": "改染色信息",
  "batch.confirm": "确认批次",
  "observation.save": "保存观察",
  "observation.supplement": "补录观察",
};

const ACTION_CLASS: Record<LogAction, string> = {
  "batch.create": "act-create",
  "batch.edit": "act-edit",
  "batch.confirm": "act-confirm",
  "observation.save": "act-save",
  "observation.supplement": "act-supplement",
};

export function HistoryView({ db }: { db: DBState }) {
  const [actor, setActor] = useState("");
  const [batchId, setBatchId] = useState("");
  const [action, setAction] = useState("");

  const actors = useMemo(() => Array.from(new Set(db.logs.map((l) => l.actor))), [db.logs]);
  const filtered = useMemo(
    () =>
      db.logs
        .filter((l) => (actor ? l.actor === actor : true))
        .filter((l) => (batchId ? l.batchId === batchId : true))
        .filter((l) => (action ? l.action === action : true))
        .sort((a, b) => b.ts - a.ts),
    [db.logs, actor, batchId, action],
  );

  const observations = useMemo(
    () =>
      db.observations
        .filter((o) => (batchId ? o.batchId === batchId : true))
        .sort((a, b) => b.savedAt - a.savedAt),
    [db.observations, batchId],
  );

  return (
    <section className="history-view panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">全量留痕</p>
          <h2>历史结论与操作日志</h2>
        </div>
      </div>

      <div className="history-filters">
        <label>
          <span>人员</span>
          <select value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">全部人员</option>
            {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>
          <span>染色批次</span>
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">全部批次</option>
            {db.batches.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
        </label>
        <label>
          <span>动作</span>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">全部动作</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      <div className="history-grid">
        <div className="timeline">
          <h3>操作时间线（{filtered.length}）</h3>
          {filtered.map((l) => {
            const batch = db.batches.find((b) => b.id === l.batchId);
            return (
              <article key={l.id} className="log-row">
                <time>{fmtTimeFull(l.ts)}</time>
                <em className={`act-pill ${ACTION_CLASS[l.action]}`}>{ACTION_LABEL[l.action]}</em>
                <div className="log-body">
                  <p>{l.detail}</p>
                  <p className="log-meta">
                    {l.actor} · {batch?.code ?? l.batchId} · 版本 v{l.fromVersion} → v{l.toVersion}
                  </p>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && <p className="empty-hint">没有符合条件的日志。</p>}
        </div>

        <div className="history-side">
          <h3>按时间查记录{batchId ? "（当前批次）" : ""}</h3>
          {observations.map((o) => {
            const b = db.batches.find((x) => x.id === o.batchId);
            return (
              <article key={o.id} className={o.isSupplement ? "mini-obs supplement" : "mini-obs"}>
                <div className="mini-obs-head">
                  <strong>{o.keyStructure}</strong>
                  {o.isSupplement && <em className="pill supplement">补录</em>}
                </div>
                <p>{o.magnification}{o.description ? ` · ${o.description}` : ""}</p>
                <p className="log-meta">{o.author} · {fmtTimeFull(o.savedAt)} · {b?.code}</p>
              </article>
            );
          })}
          {observations.length === 0 && <p className="empty-hint">暂无记录。</p>}
        </div>
      </div>
    </section>
  );
}

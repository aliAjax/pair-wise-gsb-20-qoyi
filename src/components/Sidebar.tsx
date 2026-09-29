import { useState } from "react";
import type { Draft } from "../types";
import type { DBState } from "../logic";
import { createBatch, createSample } from "../logic";
import { mutate } from "../db";

export function Sidebar({
  db,
  drafts,
  selectedBatchId,
  onSelectBatch,
  operator,
  view,
  onViewHistory,
}: {
  db: DBState;
  drafts: Draft[];
  selectedBatchId: string | null;
  onSelectBatch: (id: string) => void;
  operator: string;
  view: "batch" | "history";
  onViewHistory: () => void;
}) {
  const [newSampleOpen, setNewSampleOpen] = useState(false);
  const [sampleName, setSampleName] = useState("");
  const [sampleType, setSampleType] = useState("植物组织");
  const [sampleSource, setSampleSource] = useState("");

  const [newBatchFor, setNewBatchFor] = useState<string | null>(null);
  const [stainMethod, setStainMethod] = useState("");
  const [stainNote, setStainNote] = useState("");

  const draftCounts = new Map<string, number>();
  for (const d of drafts) draftCounts.set(d.batchId, (draftCounts.get(d.batchId) ?? 0) + 1);

  const guard = (fn: () => void) => {
    if (!operator) {
      window.alert("请先在右上角输入当前操作人姓名。");
      return;
    }
    fn();
  };

  return (
    <aside className="sidebar panel">
      <div className="sidebar-row">
        <h2>样本 / 染色批次</h2>
        <button className="link-btn" onClick={() => guard(() => setNewSampleOpen((v) => !v))}>+ 新样本</button>
      </div>

      {newSampleOpen && (
        <div className="inline-form">
          <input value={sampleName} onChange={(e) => setSampleName(e.target.value)} placeholder="样本名称" />
          <select value={sampleType} onChange={(e) => setSampleType(e.target.value)}>
            {["植物组织", "动物组织", "微生物", "血液涂片"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input value={sampleSource} onChange={(e) => setSampleSource(e.target.value)} placeholder="来源 / 存放位置" />
          <button className="primary-action" disabled={!sampleName.trim()} onClick={() => {
            const s = mutate((d) => createSample(d, { name: sampleName, type: sampleType, source: sampleSource }));
            setNewBatchFor(s.id);
            setNewSampleOpen(false);
            setSampleName("");
            setSampleSource("");
          }}>创建并开染色批次</button>
        </div>
      )}

      <div className="sample-tree">
        {db.samples.map((sample) => {
          const batches = db.batches.filter((b) => b.sampleId === sample.id);
          return (
            <div key={sample.id} className="sample-group">
              <div className="sample-head">
                <strong>{sample.name}</strong>
                <span className="tag">{sample.type}</span>
                <button className="link-btn" onClick={() => guard(() => setNewBatchFor(newBatchFor === sample.id ? null : sample.id))}>
                  + 开批
                </button>
              </div>
              <p className="sample-source">{sample.source || "未登记来源"}</p>

              {newBatchFor === sample.id && (
                <div className="inline-form">
                  <input value={stainMethod} onChange={(e) => setStainMethod(e.target.value)} placeholder="染色方式（如 碘液）" />
                  <textarea value={stainNote} onChange={(e) => setStainNote(e.target.value)} placeholder="染色备注（浓度/时长/注意事项）" rows={2} />
                  <button className="primary-action" disabled={!stainMethod.trim()} onClick={() => {
                    const batch = mutate((d) =>
                      createBatch(d, { sampleId: sample.id, stainMethod, stainNote, actor: operator }),
                    );
                    setStainMethod("");
                    setStainNote("");
                    setNewBatchFor(null);
                    onSelectBatch(batch.id);
                  }}>创建批次</button>
                </div>
              )}

              <ul className="batch-list">
                {batches.map((b) => (
                  <li key={b.id}>
                    <button
                      className={selectedBatchId === b.id && view === "batch" ? "batch-item active" : "batch-item"}
                      onClick={() => onSelectBatch(b.id)}
                    >
                      <span className="batch-code">{b.code}</span>
                      <span className="batch-meta">
                        {b.stainMethod} · v{b.version}
                        {b.status === "confirmed" && <em className="pill confirmed">已确认</em>}
                        {(draftCounts.get(b.id) ?? 0) > 0 && (
                          <em className="pill draft">{draftCounts.get(b.id)} 草稿</em>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
                {batches.length === 0 && <li className="empty-hint">暂无染色批次</li>}
              </ul>
            </div>
          );
        })}
      </div>

      <button className={view === "history" ? "history-btn active" : "history-btn"} onClick={onViewHistory}>
        🕓 历史结论与操作日志
      </button>
    </aside>
  );
}

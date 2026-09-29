import { useEffect, useMemo, useState } from "react";
import {
  ACTION_LABELS,
  batchTimeline,
  confirmBatch,
  fmtTime,
  getSampleById,
  saveSupplement,
  simulateExternalSave,
  useStore,
} from "../store";
import type { StainBatch } from "../types";

interface Props {
  batch: StainBatch;
  person: string;
  windowId: string;
  onBack: () => void;
  onEditRecord: (recordId: string) => void;
  onNewRecord: () => void;
  onToast: (text: string, kind?: "ok" | "warn") => void;
}

export default function BatchDetail({
  batch,
  person,
  windowId,
  onBack,
  onEditRecord,
  onNewRecord,
  onToast,
}: Props) {
  useStore(); // 其他窗口更新后自动刷新
  const sample = getSampleById(batch.sampleId);
  const timeline = useMemo(() => batchTimeline(batch.id), [batch.id, batch.version]);

  return (
    <div className="batch-detail">
      <button className="ghost-btn back-btn" onClick={onBack}>← 返回样本/批次列表</button>

      <section className="panel batch-hero">
        <div>
          <p className="eyebrow">
            {sample?.name} · {sample?.kind} · 批次版本 v{batch.version}
          </p>
          <h2>
            {batch.code}
            {batch.confirmed ? (
              <span className="badge badge-confirmed">已确认 · 旧结论冻结</span>
            ) : (
              <span className="badge badge-open">观察中 · 工作稿</span>
            )}
          </h2>
          <p className="hint">
            染色：{batch.stain} · 建档 {fmtTime(batch.createdAt)}
            {batch.confirmedAt && ` · 确认于 ${fmtTime(batch.confirmedAt)}`}
          </p>
        </div>
        <div className="batch-actions">
          {!batch.confirmed && (
            <>
              <button className="primary-action" onClick={onNewRecord}>
                新增观察记录
              </button>
              <button
                onClick={() => {
                  try {
                    confirmBatch(batch.id, person, windowId);
                    onToast("批次已确认，旧结论冻结，之后只能补录", "ok");
                  } catch (e) {
                    onToast((e as Error).message, "warn");
                  }
                }}
              >
                确认批次
              </button>
            </>
          )}
          <button
            className="ghost-btn"
            onClick={() => {
              simulateExternalSave(batch.id);
              onToast("已模拟另一窗口在该批次保存", "warn");
            }}
          >
            模拟另一窗口保存
          </button>
        </div>
      </section>

      {!batch.confirmed && (
        <p className="rule-note">
          保存规则：以进入编辑时的 v 版本核对；两人先后保存时，后保存的一方会被拦在当前窗口，
          逐字段对照新版本后才能合并，不会盖掉对方的重点结构和染色备注。
        </p>
      )}

      <section className="panel">
        <h3 className="block-title">
          {batch.confirmed ? "正式结论（只读历史）" : "观察工作稿"}
          <em>{batch.records.length} 条</em>
        </h3>
        <div className="record-grid">
          {batch.records.map((r) => (
            <article
              key={r.id}
              className={`record-detail ${batch.confirmed ? "frozen" : ""}`}
              onClick={() => !batch.confirmed && onEditRecord(r.id)}
              role={batch.confirmed ? undefined : "button"}
            >
              <div className="record-detail-head">
                <span className="mag">{r.magnification || "未填倍数"}</span>
                <span className="person">{r.author}</span>
                {r.confirmedAt && <span className="badge badge-confirmed">正式</span>}
              </div>
              <p><b>重点结构：</b>{r.keyStructure || "—"}</p>
              <p><b>染色备注：</b>{r.stainNote || "—"}</p>
              <p className="dim"><b>视野描述：</b>{r.description || "—"}</p>
              <p className="record-foot">
                {batch.confirmed
                  ? `确认于 ${fmtTime(r.confirmedAt!)}`
                  : `录入 ${fmtTime(r.createdAt)} · 基于 v${r.baseVersion}（点击编辑）`}
              </p>
            </article>
          ))}
        </div>
      </section>

      {batch.confirmed && (
        <SupplementForm batch={batch} person={person} windowId={windowId} onToast={onToast} />
      )}

      <section className="panel">
        <h3 className="block-title">
          批次历史（旧结论 / 补录 / 人员操作，按时间）
          <em>{timeline.length} 条</em>
        </h3>
        <ul className="timeline">
          {timeline.map((item, i) => (
            <li key={i} className={`tl-${item.kind}`}>
              <span className="tl-time">{fmtTime(item.time)}</span>
              <span className={`tl-dot dot-${item.kind}`} />
              <div>
                <p>
                  {item.kind === "log" && item.action && (
                    <span className="tl-action">{ACTION_LABELS[item.action]} · </span>
                  )}
                  {item.kind === "record" && <span className="tl-tag tag-record">结论</span>}
                  {item.kind === "supplement" && <span className="tl-tag tag-supplement">补录</span>}
                  {item.text}
                </p>
                <small>{item.person}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SupplementForm({
  batch,
  person,
  windowId,
  onToast,
}: {
  batch: StainBatch;
  person: string;
  windowId: string;
  onToast: (text: string, kind?: "ok" | "warn") => void;
}) {
  const [baseVersion, setBaseVersion] = useState(batch.version);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    magnification: "",
    keyStructure: "",
    stainNote: "",
    description: "",
  });
  const [stale, setStale] = useState(batch.version !== baseVersion);

  // 其他窗口补录后提示版本变化（不在渲染过程中直接 setState）
  useEffect(() => {
    setStale(batch.version !== baseVersion);
  }, [batch.version, baseVersion]);

  function submit() {
    if (!form.keyStructure.trim()) {
      onToast("补录至少填写重点结构", "warn");
      return;
    }
    const run = (version: number) =>
      saveSupplement({ windowId, person, batchId: batch.id, ...form, baseVersion: version });

    let outcome = run(baseVersion);
    if (outcome.type === "conflict") {
      const latest = outcome.currentVersion;
      // 补录是纯追加语义：重定位到新版本后再提一次，不会覆盖任何人的内容
      onToast("补录前批次已有新版本，已自动按新版本追加", "warn");
      outcome = run(latest);
    }
    if (outcome.type === "committed") {
      onToast("补录已追加，旧结论未改动", "ok");
      setForm({ magnification: "", keyStructure: "", stainNote: "", description: "" });
      setOpen(false);
      setStale(false);
    }
  }

  return (
    <section className="panel">
      <h3 className="block-title">
        确认后补录（只追加，不改旧结论）
        <em>{batch.supplements.length} 条</em>
      </h3>
      <div className="supplement-list">
        {batch.supplements.map((s) => (
          <article key={s.id} className="supplement-item">
            <div className="record-detail-head">
              <span className="mag">{s.magnification || "补录"}</span>
              <span className="person">{s.author}</span>
            </div>
            <p><b>重点结构：</b>{s.keyStructure}</p>
            <p><b>染色备注：</b>{s.stainNote || "—"}</p>
            <p className="dim"><b>视野描述：</b>{s.description || "—"}</p>
            <p className="record-foot">{fmtTime(s.createdAt)} · 基于 v{s.baseVersion}</p>
          </article>
        ))}
      </div>

      {!open ? (
        <button className="primary-action" onClick={() => { setBaseVersion(batch.version); setStale(false); setOpen(true); }}>
          补录一条观察
        </button>
      ) : (
        <div className="supplement-form">
          {stale && (
            <div className="inline-warn">
              打开补录后批次已到 v{batch.version}（可能有其他窗口刚补录），提交时会自动按新版本追加，
              不会覆盖旧内容。
            </div>
          )}
          <div className="form-grid">
            <label className="span-2">
              <span>放大倍数</span>
              <input value={form.magnification} onChange={(e) => setForm({ ...form, magnification: e.target.value })} placeholder="如 400x" />
            </label>
            <label className="span-2">
              <span>重点结构</span>
              <textarea rows={2} value={form.keyStructure} onChange={(e) => setForm({ ...form, keyStructure: e.target.value })} />
            </label>
            <label className="span-2">
              <span>染色备注</span>
              <textarea rows={2} value={form.stainNote} onChange={(e) => setForm({ ...form, stainNote: e.target.value })} />
            </label>
            <label className="span-2">
              <span>视野描述</span>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
          </div>
          <footer className="modal-foot">
            <span className="hint">进入补录时版本 v{baseVersion}，当前 v{batch.version}</span>
            <span className="spacer" />
            <button className="ghost-btn" onClick={() => setOpen(false)}>取消</button>
            <button className="primary-action" onClick={submit}>追加补录</button>
          </footer>
        </div>
      )}
    </section>
  );
}

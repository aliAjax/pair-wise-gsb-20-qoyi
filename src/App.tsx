import { useMemo, useState } from "react";
import "./styles.css";
import {
  ACTION_LABELS,
  WINDOW_ID,
  addBatch,
  addSample,
  fmtTime,
  getPerson,
  getSampleById,
  setPerson,
  useDrafts,
  useStore,
} from "./store";
import type { Draft, LogAction } from "./types";
import EditorModal from "./components/EditorModal";
import DraftCenter from "./components/DraftCenter";
import BatchDetail from "./components/BatchDetail";

type Toast = { id: string; text: string; kind: "ok" | "warn" };

export default function App() {
  const db = useStore();
  const drafts = useDrafts();
  const [person, setPersonState] = useState(getPerson());
  const [tab, setTab] = useState<"work" | "logs">("work");
  const [selectedSample, setSelectedSample] = useState(db.samples[0]?.id ?? "");
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    { batchId: string; recordId?: string; restoreDraft?: Draft } | null
  >(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function toast(text: string, kind: "ok" | "warn" = "ok") {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }

  const openBatch = openBatchId ? db.batches.find((b) => b.id === openBatchId) : null;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-06 · 显微镜玻片观察流程</p>
          <h1>样本 → 染色批次 → 观察记录 → 操作日志</h1>
          <p className="subtitle">
            多窗口并行录片：版本核对保存、冲突留窗对照、草稿重开恢复、确认后补录可溯
          </p>
        </div>
        <div className="stack-card identity">
          <span>当前窗口</span>
          <strong>{WINDOW_ID}</strong>
          <label>
            记录人
            <select
              value={person}
              onChange={(e) => {
                setPerson(e.target.value);
                setPersonState(e.target.value);
              }}
            >
              <option>王老师</option>
              <option>李同学</option>
              <option>张管理员</option>
              <option>赵演示（另一窗口）</option>
            </select>
          </label>
          <button className="draft-btn" onClick={() => setDrawerOpen(true)}>
            草稿箱
            {drafts.length > 0 && <i className="draft-count">{drafts.length}</i>}
          </button>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === "work" ? "active" : ""} onClick={() => setTab("work")}>
          流程工作台
        </button>
        <button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}>
          全部操作日志
        </button>
      </nav>

      {tab === "work" &&
        (openBatch ? (
          <BatchDetail
            batch={openBatch}
            person={person}
            windowId={WINDOW_ID}
            onBack={() => setOpenBatchId(null)}
            onEditRecord={(recordId) => setEditor({ batchId: openBatch.id, recordId })}
            onNewRecord={() => setEditor({ batchId: openBatch.id })}
            onToast={toast}
          />
        ) : (
          <Workbench
            selectedSample={selectedSample}
            onSelectSample={setSelectedSample}
            onOpenBatch={setOpenBatchId}
            toast={toast}
          />
        ))}

      {tab === "logs" && <LogView />}

      {editor && (
        <EditorModal
          batchId={editor.batchId}
          recordId={editor.recordId}
          restoreDraft={editor.restoreDraft}
          person={person}
          windowId={WINDOW_ID}
          onClose={() => setEditor(null)}
          onToast={toast}
        />
      )}

      <DraftCenter
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRestore={(draft) => {
          setDrawerOpen(false);
          setOpenBatchId(draft.batchId);
          setEditor({ batchId: draft.batchId, recordId: draft.recordId, restoreDraft: draft });
        }}
      />

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

function Workbench({
  selectedSample,
  onSelectSample,
  onOpenBatch,
  toast,
}: {
  selectedSample: string;
  onSelectSample: (id: string) => void;
  onOpenBatch: (id: string) => void;
  toast: (t: string, k?: "ok" | "warn") => void;
}) {
  const db = useStore();
  const sample = getSampleById(selectedSample);
  const batches = useMemo(
    () => db.batches.filter((b) => b.sampleId === selectedSample),
    [db.batches, selectedSample]
  );

  const [newSample, setNewSample] = useState({ name: "", kind: "植物组织" });
  const [newBatch, setNewBatch] = useState({ code: "", stain: "" });

  return (
    <section className="workspace">
      <aside className="panel narrow">
        <h2>样本</h2>
        <ul className="sample-list">
          {db.samples.map((s) => {
            const count = db.batches.filter((b) => b.sampleId === s.id).length;
            return (
              <li key={s.id}>
                <button
                  className={s.id === selectedSample ? "sample-item active" : "sample-item"}
                  onClick={() => onSelectSample(s.id)}
                >
                  <span>{s.name}</span>
                  <small>{s.kind} · {count} 批次</small>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="inline-form">
          <h3>新增样本</h3>
          <input
            placeholder="样本名称"
            value={newSample.name}
            onChange={(e) => setNewSample({ ...newSample, name: e.target.value })}
          />
          <select
            value={newSample.kind}
            onChange={(e) => setNewSample({ ...newSample, kind: e.target.value })}
          >
            <option>植物组织</option>
            <option>动物组织</option>
            <option>微生物</option>
            <option>血液涂片</option>
          </select>
          <button
            className="primary-action"
            disabled={!newSample.name.trim()}
            onClick={() => {
              const s = addSample(newSample.name.trim(), newSample.kind);
              setNewSample({ name: "", kind: newSample.kind });
              onSelectSample(s.id);
              toast("样本已建立");
            }}
          >
            建立样本
          </button>
        </div>
      </aside>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>{sample?.kind}</p>
            <h2>{sample?.name ?? "请选择样本"} 的染色批次</h2>
          </div>
        </div>

        <div className="inline-form horizontal">
          <input
            placeholder="批次编号（如 碘液-20260929-C）"
            value={newBatch.code}
            onChange={(e) => setNewBatch({ ...newBatch, code: e.target.value })}
          />
          <input
            placeholder="染色方式（如 碘液染色）"
            value={newBatch.stain}
            onChange={(e) => setNewBatch({ ...newBatch, stain: e.target.value })}
          />
          <button
            className="primary-action"
            disabled={!sample}
            onClick={() => {
              if (!sample) return;
              const b = addBatch(sample.id, newBatch.code.trim(), newBatch.stain.trim());
              setNewBatch({ code: "", stain: "" });
              toast(`染色批次 ${b.code} 已建立，可以开始录观察记录`);
            }}
          >
            开染色批次
          </button>
        </div>

        <div className="batch-list">
          {batches.length === 0 && <div className="empty-box">该样本还没有染色批次，先开一批。</div>}
          {batches.map((b) => (
            <article
              key={b.id}
              className={b.confirmed ? "batch-card confirmed" : "batch-card"}
              onClick={() => onOpenBatch(b.id)}
              role="button"
            >
              <div className="batch-card-main">
                <h3>
                  {b.code}
                  {b.confirmed ? (
                    <span className="badge badge-confirmed">已确认 · 可补录</span>
                  ) : (
                    <span className="badge badge-open">观察中</span>
                  )}
                </h3>
                <p className="hint">
                  {b.stain} · 版本 v{b.version} · 工作稿/结论 {b.records.length} 条 · 补录{" "}
                  {b.supplements.length} 条
                </p>
                {b.records[0] && (
                  <p className="batch-preview">
                    最近重点结构：{b.records[b.records.length - 1].keyStructure || "—"}
                  </p>
                )}
              </div>
              <div className="batch-card-side">
                <span>{b.confirmed ? "查看历史 / 补录" : "进入录片"}</span>
                <small>{fmtTime(b.confirmedAt ?? b.createdAt)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function LogView() {
  const db = useStore();
  const [action, setAction] = useState<LogAction | "">("");
  const [personQ, setPersonQ] = useState("");
  const [keyword, setKeyword] = useState("");

  const logs = useMemo(
    () =>
      db.logs.filter((l) => {
        if (action && l.action !== action) return false;
        if (personQ && !l.person.includes(personQ.trim())) return false;
        if (keyword && !`${l.detail}${l.batchId}`.includes(keyword.trim())) return false;
        return true;
      }),
    [db.logs, action, personQ, keyword]
  );

  return (
    <section className="panel logs-panel">
      <div className="section-heading">
        <div>
          <p>全流程留痕</p>
          <h2>操作日志（按时间倒序，可查旧结论与历史人员）</h2>
        </div>
      </div>
      <div className="log-filters">
        <select value={action} onChange={(e) => setAction(e.target.value as LogAction | "")}>
          <option value="">全部操作</option>
          {(Object.keys(ACTION_LABELS) as LogAction[]).map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        <input placeholder="按人员查（如 王老师）" value={personQ} onChange={(e) => setPersonQ(e.target.value)} />
        <input placeholder="按内容关键字查" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>
      <table className="log-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>操作</th>
            <th>人员</th>
            <th>窗口</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="nowrap">{fmtTime(l.time)}</td>
              <td><span className={`log-badge log-badge-${l.action}`}>{ACTION_LABELS[l.action]}</span></td>
              <td>{l.person}</td>
              <td className="dim">{l.windowId}</td>
              <td>{l.detail}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={5} className="empty-box">没有匹配的日志。</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

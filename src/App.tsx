import { useState } from "react";
import "./styles.css";
import type { Draft } from "./types";
import { buildDraft } from "./logic";
import { getState, resetDB } from "./db";
import { removeDraft, resetDrafts } from "./drafts";
import { useDB, useDrafts } from "./hooks";
import { useOperator } from "./session";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { DraftTray } from "./components/DraftTray";
import { BatchView } from "./components/BatchView";
import { HistoryView } from "./components/HistoryView";
import { EditorModal } from "./components/EditorModal";

function App() {
  const db = useDB();
  const drafts = useDrafts();
  const operator = useOperator();

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    () => getState().batches[1]?.id ?? null,
  );
  const [view, setView] = useState<"batch" | "history">("batch");
  const [editorDraft, setEditorDraft] = useState<Draft | null>(null);

  const selectedBatch = selectedBatchId ? db.batches.find((b) => b.id === selectedBatchId) ?? null : null;

  const startObservation = () => {
    if (!operator) {
      window.alert("请先在右上角输入当前操作人姓名。");
      return;
    }
    if (!selectedBatchId) return;
    const draft = buildDraft(getState(), { batchId: selectedBatchId, author: operator });
    if (!draft) return;
    setEditorDraft(draft); // 进入即生成草稿；自动保存负责落盘
  };

  const resetAll = () => {
    resetDB();
    resetDrafts();
    setEditorDraft(null);
    setSelectedBatchId(getState().batches[1]?.id ?? null);
  };

  return (
    <div className="app-shell">
      <TopBar
        operator={operator}
        counts={{
          samples: db.samples.length,
          batches: db.batches.length,
          observations: db.observations.length,
          drafts: drafts.length,
        }}
        onReset={resetAll}
      />

      <div className="workspace">
        <Sidebar
          db={db}
          drafts={drafts}
          selectedBatchId={selectedBatchId}
          onSelectBatch={(id) => {
            setSelectedBatchId(id);
            setView("batch");
          }}
          operator={operator}
          view={view}
          onViewHistory={() => setView("history")}
        />

        <main className="main-col">
          <DraftTray
            db={db}
            drafts={drafts}
            onResume={(d) => setEditorDraft(d)}
            onDiscard={(id) => removeDraft(id)}
          />

          {view === "history" ? (
            <HistoryView db={db} />
          ) : selectedBatch ? (
            <BatchView
              key={selectedBatch.id}
              db={db}
              batch={selectedBatch}
              operator={operator}
              onNewObservation={startObservation}
            />
          ) : (
            <section className="panel empty-state">
              <p>从左侧选择一个染色批次，或新建样本并开批。</p>
            </section>
          )}
        </main>
      </div>

      {editorDraft && (
        <EditorModal
          // key 保证从一份草稿切到另一份时状态完全重建
          key={editorDraft.id}
          db={db}
          initialDraft={editorDraft}
          onClose={() => setEditorDraft(null)}
        />
      )}

      <footer className="flow-note">
        流程：样本 → 染色批次（带版本号）→ 进入编辑锁定版本 → 自动保存为未确认草稿 → 确认时按版本核对（冲突留当前窗口对照，不覆盖）→ 正式记录只追加
        → 批次确认冻结结论、仍可补录 → 日志按时间/人员可查
      </footer>
    </div>
  );
}

export default App;

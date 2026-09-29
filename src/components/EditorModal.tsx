import { useEffect, useMemo, useRef, useState } from "react";
import type { Draft } from "../types";
import type { DBState, SubmitResult } from "../logic";
import { submitObservation } from "../logic";
import { mutate } from "../db";
import { removeDraft, upsertDraft } from "../drafts";
import { ConflictPanel } from "./ConflictPanel";

type Phase = "editing" | "conflict";

export function EditorModal({
  db,
  initialDraft,
  onClose,
}: {
  db: DBState;
  initialDraft: Draft;
  onClose: () => void;
}) {
  const batch = db.batches.find((b) => b.id === initialDraft.batchId);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [phase, setPhase] = useState<Phase>("editing");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "autosaved">("idle");
  const [error, setError] = useState("");
  const timer = useRef<number | null>(null);
  const stale = batch ? batch.version > draft.baseVersion : false;
  const frozen = batch?.status === "confirmed";

  // 自动保存草稿（400ms 防抖）；只更新草稿键，永远不写正式库
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = window.setTimeout(() => {
      upsertDraft(draft);
      setSaveState("autosaved");
    }, 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [draft]);

  // 其它窗口确认批次 / 保存字段把版本推进时，当前窗口立即收到提示
  useEffect(() => {
    if (stale && phase === "editing") {
      setError(`本批次刚刚被他人保存，版本已从 v${draft.baseVersion} 推进到 v${batch!.version}。请先保存触发对照。`);
    }
  }, [stale, phase, draft.baseVersion, batch]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const isEmptyDraft = (d: Draft) =>
    d.magnification.trim() === "" && d.keyStructure.trim() === "" && d.description.trim() === "";

  // 关闭时立即落一次盘（防抖可能还没触发）；从未填写观察内容的空草稿直接丢弃
  const closeAndKeep = () => {
    if (isEmptyDraft(draft)) removeDraft(draft.id);
    else upsertDraft(draft);
    onClose();
  };

  const canSubmit = useMemo(
    () => draft.magnification.trim() !== "" && draft.keyStructure.trim() !== "",
    [draft.magnification, draft.keyStructure],
  );

  const doSubmit = () => {
    setError("");
    if (!canSubmit) {
      setError("放大倍数与重点结构为必填项。");
      return;
    }
    const result: SubmitResult = mutate((d) =>
      submitObservation(
        d,
        draft.batchId,
        draft.author,
        {
          baseVersion: draft.baseVersion,
          stainMethod: frozen ? undefined : draft.stainMethod,
          stainNote: frozen ? undefined : draft.stainNote,
          magnification: draft.magnification,
          keyStructure: draft.keyStructure,
          description: draft.description,
        },
      ),
    );
    if (result.conflict) {
      setPhase("conflict");
      return;
    }
    if (!result.ok) {
      setError("保存失败，请检查必填项。");
      return;
    }
    // 确认成功：草稿转正式记录，删除草稿
    removeDraft(draft.id);
    onClose();
  };

  const mergeMine = () => {
    // 在最新版本之上重放：baseVersion 更新到当前，我的字段值保留
    setDraft((d) => ({ ...d, baseVersion: batch!.version }));
    setError(`已以 v${batch!.version} 为新基准合入你的修改，请再次核对后点“确认保存”。`);
    setPhase("editing");
  };

  const adoptTheirs = () => {
    // 我的染色改动作废，对齐对方版本；观察内容（放大倍数/重点结构/描述）保留
    setDraft((d) => ({
      ...d,
      baseVersion: batch!.version,
      stainMethod: batch!.stainMethod,
      stainNote: batch!.stainNote,
    }));
    setError(`已采用对方 v${batch!.version} 的染色信息，你的观察内容仍在，确认后可保存。`);
    setPhase("editing");
  };

  if (!batch) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeAndKeep()}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h2>{frozen ? "补录观察记录" : "新增观察记录"} · {batch.code}</h2>
            <p className="batch-sub">
              {draft.author} · 进入时锁定版本 <b>v{draft.baseVersion}</b>
              {frozen && " · 批次已确认，染色信息锁定，仅追加补录"}
            </p>
          </div>
          <button className="ghost-btn" onClick={closeAndKeep}>关闭</button>
        </div>

        {phase === "conflict" ? (
          <ConflictPanel
            db={db}
            draft={draft}
            onMerge={mergeMine}
            onAdoptTheirs={adoptTheirs}
            onCancel={() => setPhase("editing")}
          />
        ) : (
          <>
            <div className="editor-grid">
              <label>
                <span>放大倍数 *</span>
                <input value={draft.magnification} onChange={(e) => set("magnification", e.target.value)} placeholder="如 400x / 1000x" />
              </label>
              <label>
                <span>重点结构 *</span>
                <input value={draft.keyStructure} onChange={(e) => set("keyStructure", e.target.value)} placeholder="如 细胞壁、细胞核" />
              </label>
              <label className="span-2">
                <span>视野描述</span>
                <textarea rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="形态、分布、异常所见……" />
              </label>
            </div>

            {!frozen && (
              <div className="stain-edit">
                <h3>染色批次信息（改了会随保存推进版本）</h3>
                <div className="editor-grid">
                  <label>
                    <span>染色方式</span>
                    <input value={draft.stainMethod} onChange={(e) => set("stainMethod", e.target.value)} />
                  </label>
                  <label>
                    <span>染色备注</span>
                    <textarea rows={2} value={draft.stainNote} onChange={(e) => set("stainNote", e.target.value)} />
                  </label>
                </div>
              </div>
            )}

            {error && <p className="error-banner">{error}</p>}

            <div className="modal-foot">
              <span className="autosave-hint">
                {saveState === "saving" ? "草稿保存中…" : saveState === "autosaved" ? "✓ 已存入未确认草稿（关浏览器也能恢复，非正式记录）" : ""}
              </span>
              <div>
                <button className="ghost-btn" onClick={closeAndKeep}>保留草稿并关闭</button>
                <button className="primary-action" onClick={doSubmit} disabled={!canSubmit}>
                  {frozen ? "确认补录" : "确认保存"}（核对 v{draft.baseVersion}）
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

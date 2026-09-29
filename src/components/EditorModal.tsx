import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTION_LABELS,
  FIELD_LABELS,
  changesSince,
  discardDraft,
  emptySnapshot,
  fmtTime,
  getBatchById,
  getSampleById,
  saveObservation,
  saveSupplement,
  simulateExternalSave,
  snapshotOf,
  touchDraft,
  uid,
} from "../store";
import type { Draft, FieldKey, FieldSnapshot, FieldState, SaveOutcome } from "../types";

interface Props {
  batchId: string;
  recordId?: string; // 缺省 = 新建观察记录
  person: string;
  windowId: string;
  /** 从草稿中心恢复时直接带入 */
  restoreDraft?: Draft;
  onClose: () => void;
  onToast: (text: string, kind?: "ok" | "warn") => void;
}

type Choice = "mine" | "theirs";

export default function EditorModal({
  batchId,
  recordId,
  person,
  windowId,
  restoreDraft,
  onClose,
  onToast,
}: Props) {
  const liveBatch = getBatchById(batchId);
  const liveRecord = recordId
    ? liveBatch?.records.find((r) => r.id === recordId)
    : undefined;

  const [draftId] = useState(restoreDraft?.id ?? uid());
  const [baseVersion] = useState(
    restoreDraft?.baseVersion ?? liveBatch?.version ?? 0
  );
  const [baseSnapshot] = useState<FieldSnapshot>(
    restoreDraft?.baseSnapshot ?? (liveRecord ? snapshotOf(liveRecord) : emptySnapshot)
  );
  const [baseTime] = useState(restoreDraft?.baseTime ?? Date.now());

  const [values, setValues] = useState<FieldSnapshot>(
    restoreDraft
      ? snapshotOf(restoreDraft)
      : liveRecord
      ? snapshotOf(liveRecord)
      : emptySnapshot
  );
  const [conflict, setConflict] = useState<
    | (Extract<SaveOutcome, { type: "conflict" }> & { choices: Partial<Record<FieldKey, Choice>> })
    | null
  >(null);
  const [saving, setSaving] = useState(false);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // 进入编辑即登记草稿，之后输入自动保存（关浏览器也不丢）
  useEffect(() => {
    const t = setTimeout(() => {
      const b = getBatchById(batchId);
      touchDraft({
        id: draftId,
        windowId,
        batchId,
        sampleId: b?.sampleId ?? "",
        person,
        ...valuesRef.current,
        baseVersion,
        baseSnapshot,
        baseTime,
        recordId,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [values, draftId, windowId, batchId, person, baseVersion, baseSnapshot, baseTime, recordId]);

  const batch = getBatchById(batchId);
  const sample = batch ? getSampleById(batch.sampleId) : undefined;

  const externalChanges = useMemo(
    () => changesSince(batchId, baseTime),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batchId, baseTime, conflict, batch?.version]
  );

  if (!batch) return null;

  function buildDraft(overrides?: Partial<FieldSnapshot>): Draft {
    return {
      id: draftId,
      windowId,
      batchId,
      sampleId: batch!.sampleId,
      person,
      ...{ ...valuesRef.current, ...overrides },
      baseVersion,
      baseSnapshot,
      baseTime,
      recordId,
    };
  }

  function handleSave() {
    setSaving(true);
    const outcome = saveObservation(buildDraft());
    setSaving(false);
    if (outcome.type === "committed") {
      setConflict(null);
      onToast("已按批次版本核对并保存为工作稿", "ok");
      onClose();
    } else {
      setConflict({ ...outcome, choices: {} });
      onToast("保存被拦下：批次在你编辑期间已有新版本，请逐字段对照", "warn");
    }
  }

  // 冲突对照后：用人工选择合成内容，并把基准重定位到新版本再提交
  function handleMergedSave() {
    if (!conflict) return;
    const hard = conflict.fields.filter((f) => f.hardConflict);
    const unanswered = hard.filter((f) => !conflict.choices[f.key]);
    if (unanswered.length > 0) {
      onToast(`请先为冲突字段选择保留内容：${unanswered.map((f) => FIELD_LABELS[f.key]).join("、")}`, "warn");
      return;
    }
    const externalNow: FieldSnapshot = (() => {
      const current = getBatchById(batchId);
      const r = recordId
        ? current?.records.find((x) => x.id === recordId)
        : undefined;
      // 新建记录没有“同一条记录的外部版本”，基线保持空快照，不拿别人的记录冒充
      return r ? snapshotOf(r) : emptySnapshot;
    })();

    const merged: FieldSnapshot = { ...valuesRef.current };
    conflict.fields.forEach((f) => {
      const choice = conflict.choices[f.key];
      if (f.hardConflict) {
        merged[f.key] = choice === "theirs" ? f.theirs : f.mine;
      } else if (f.changedExternal && !f.changedByMe) {
        merged[f.key] = f.theirs; // 我没动的字段，带上窗口外的新值
      }
    });

    setSaving(true);
    const outcome = saveObservation({
      ...buildDraft(merged),
      baseVersion: conflict.currentVersion,
      baseSnapshot: externalNow,
    });
    setSaving(false);
    if (outcome.type === "committed") {
      onToast("对照完成，已合并新版本保存", "ok");
      onClose();
    } else {
      setConflict({ ...outcome, choices: {} });
      onToast("合并期间批次又更新了，请再次对照", "warn");
    }
  }

  // 批次编辑期间被他人确认：我的内容不能改旧结论，只能转为补录
  function handleSaveAsSupplement() {
    if (!conflict) return;
    const v = valuesRef.current;
    setSaving(true);
    const outcome = saveSupplement({
      windowId,
      person,
      batchId,
      ...v,
      // 补录只追加不覆盖，重定位到当前版本是安全的
      baseVersion: getBatchById(batchId)!.version,
    });
    setSaving(false);
    if (outcome.type === "committed") {
      discardDraft(draftId, { silent: true });
      onToast("批次已确认，你的内容已作为补录追加", "ok");
      onClose();
    } else {
      onToast("补录时批次又变化，请重试", "warn");
    }
  }

  function handleDiscard() {
    discardDraft(draftId);
    onToast("草稿已丢弃，未写入正式记录");
    onClose();
  }

  function handleSimulate() {
    simulateExternalSave(batchId);
    onToast("已模拟另一个窗口抢先保存，现在点“保存”即可看到冲突对照", "warn");
  }

  const set = (key: FieldKey, val: string) =>
    setValues((v) => ({ ...v, [key]: val }));

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <header className="modal-head">
          <div>
            <p className="eyebrow">
              {sample?.name} · {batch.code} · v{baseVersion}
              {batch.version !== baseVersion && (
                <b className="stale-tag">窗口外已到 v{batch.version}</b>
              )}
            </p>
            <h2>{recordId ? "编辑观察记录" : "新建观察记录"}</h2>
            <p className="modal-meta">
              当前窗口 {windowId} · {person} · 草稿自动保存，关闭浏览器后可恢复
            </p>
          </div>
          <button className="ghost-btn" onClick={onClose}>×</button>
        </header>

        {conflict ? (
          <ConflictPanel
            baseVersion={baseVersion}
            conflict={conflict}
            choices={conflict.choices}
            onChoose={(key, c) =>
              setConflict((prev) =>
                prev ? { ...prev, choices: { ...prev.choices, [key]: c } } : prev
              )
            }
            externalChanges={externalChanges}
            batchConfirmed={conflict.batchConfirmed}
            recordDeleted={conflict.recordDeleted}
            onSaveMerged={handleMergedSave}
            onSaveAsSupplement={handleSaveAsSupplement}
            saving={saving}
            onCancelConflict={() => setConflict(null)}
          />
        ) : (
          <>
            <div className="form-grid">
              <label className="span-2">
                <span>{FIELD_LABELS.magnification}</span>
                <input
                  value={values.magnification}
                  placeholder="如 400x / 1000x 油镜"
                  onChange={(e) => set("magnification", e.target.value)}
                />
              </label>
              <label className="span-2">
                <span>{FIELD_LABELS.keyStructure} *</span>
                <textarea
                  rows={2}
                  value={values.keyStructure}
                  placeholder="记录重点结构（最易被覆盖的字段，保存时会逐字段核对）"
                  onChange={(e) => set("keyStructure", e.target.value)}
                />
              </label>
              <label className="span-2">
                <span>{FIELD_LABELS.stainNote}</span>
                <textarea
                  rows={2}
                  value={values.stainNote}
                  placeholder="染色方法、时间、着色情况等备注"
                  onChange={(e) => set("stainNote", e.target.value)}
                />
              </label>
              <label className="span-2">
                <span>{FIELD_LABELS.description}</span>
                <textarea
                  rows={3}
                  value={values.description}
                  placeholder="视野描述"
                  onChange={(e) => set("description", e.target.value)}
                />
              </label>
            </div>

            {externalChanges.length > 0 && (
              <div className="inline-warn">
                编辑期间该批次已有 {externalChanges.length} 条窗口外更新，直接保存会进入对照。
              </div>
            )}

            <footer className="modal-foot">
              <button className="ghost-btn" onClick={handleSimulate}>
                模拟另一窗口抢先保存
              </button>
              <span className="spacer" />
              <button className="ghost-btn" onClick={handleDiscard}>丢弃草稿</button>
              <button className="ghost-btn" onClick={onClose}>留在草稿箱</button>
              <button className="primary-action" disabled={saving} onClick={handleSave}>
                保存（按 v{baseVersion} 核对）
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function ConflictPanel({
  baseVersion,
  conflict,
  choices,
  onChoose,
  externalChanges,
  batchConfirmed,
  recordDeleted,
  onSaveMerged,
  onSaveAsSupplement,
  saving,
  onCancelConflict,
}: {
  baseVersion: number;
  conflict: Extract<SaveOutcome, { type: "conflict" }>;
  choices: Partial<Record<FieldKey, Choice>>;
  onChoose: (key: FieldKey, c: Choice) => void;
  externalChanges: ReturnType<typeof changesSince>;
  batchConfirmed: boolean;
  recordDeleted: boolean;
  onSaveMerged: () => void;
  onSaveAsSupplement: () => void;
  saving: boolean;
  onCancelConflict: () => void;
}) {
  return (
    <div className="conflict-panel">
      <div className="conflict-banner">
        <strong>版本冲突 · 未覆盖任何内容</strong>
        <p>
          你进入编辑时是 v{baseVersion}，批次现在已是 v{conflict.currentVersion}。
          下面按字段对照「我的内容 / 窗口外新版本」，同一字段双方都改了的，必须人工选择，
          系统不替你覆盖。
        </p>
        {recordDeleted && <p className="danger-text">原记录在窗口外被删除或替换，你的内容可另存为新记录。</p>}
        {batchConfirmed && (
          <p className="danger-text">批次已在窗口外被确认，旧结论已冻结，未确认的工作稿不能再写入，只能转成补录。</p>
        )}
      </div>

      <div className="diff-list">
        {conflict.fields.map((f: FieldState) => (
          <DiffRow key={f.key} field={f} choice={choices[f.key]} onChoose={onChoose} />
        ))}
      </div>

      {externalChanges.length > 0 && (
        <div className="external-log">
          <h4>编辑期间窗口外的操作（新版本来源）</h4>
          <ul>
            {externalChanges.map((l) => (
              <li key={l.id}>
                <span className="log-time">{fmtTime(l.time)}</span>
                <span className="log-person">{l.person}</span>
                <span className="log-action">{ACTION_LABELS[l.action]}</span>
                <span>{l.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="modal-foot">
        <button className="ghost-btn" onClick={onCancelConflict}>返回继续编辑</button>
        <span className="spacer" />
        {batchConfirmed ? (
          <button className="primary-action" disabled={saving} onClick={onSaveAsSupplement}>
            把我的内容作为补录保存
          </button>
        ) : (
          <button className="primary-action" disabled={saving} onClick={onSaveMerged}>
            按选择合并并保存
          </button>
        )}
      </footer>
    </div>
  );
}

function DiffRow({
  field,
  choice,
  onChoose,
}: {
  field: FieldState;
  choice?: Choice;
  onChoose: (key: FieldKey, c: Choice) => void;
}) {
  const state = field.hardConflict
    ? "hard"
    : field.changedExternal
    ? "theirs"
    : field.changedByMe
    ? "mine"
    : "same";
  return (
    <article className={`diff-row diff-${state}`}>
      <div className="diff-head">
        <strong>{FIELD_LABELS[field.key]}</strong>
        {state === "hard" && <em className="tag-danger">双方都改了 · 必须二选一</em>}
        {state === "theirs" && <em className="tag-info">仅窗口外修改 · 保存时自动带入新值</em>}
        {state === "mine" && <em className="tag-mine">仅我修改</em>}
        {state === "same" && <em className="tag-muted">无变化</em>}
      </div>
      <div className="diff-cols">
        <label className={`diff-col ${choice === "mine" ? "picked" : ""}`}>
          <div>
            <input
              type="radio"
              name={`diff-${field.key}`}
              checked={choice === "mine"}
              disabled={state !== "hard"}
              onChange={() => onChoose(field.key, "mine")}
            />
            <span>我的内容</span>
          </div>
          <p>{field.mine || <i>（空）</i>}</p>
        </label>
        <label className={`diff-col ${choice === "theirs" ? "picked" : ""}`}>
          <div>
            <input
              type="radio"
              name={`diff-${field.key}`}
              checked={state !== "hard" ? field.changedExternal : choice === "theirs"}
              disabled={state !== "hard"}
              onChange={() => onChoose(field.key, "theirs")}
            />
            <span>窗口外新版本</span>
          </div>
          <p>{field.theirs || <i>（空）</i>}</p>
        </label>
      </div>
      {state === "hard" && !choice && (
        <p className="diff-warn">未选择时不允许保存。</p>
      )}
    </article>
  );
}

import { useSyncExternalStore } from "react";
import {
  ACTION_LABELS,
  FIELD_LABELS,
  type DB,
  type Draft,
  type FieldKey,
  type FieldSnapshot,
  type FieldState,
  type LogAction,
  type ObservationRecord,
  type SaveOutcome,
} from "./types";

const DB_KEY = "hxwl06.db.v1";
const DRAFTS_KEY = "hxwl06.drafts.v1";
const PERSON_KEY = "hxwl06.person.v1";

export const FIELD_KEYS: FieldKey[] = [
  "keyStructure",
  "stainNote",
  "magnification",
  "description",
];

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function fmtTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const emptySnapshot: FieldSnapshot = {
  keyStructure: "",
  stainNote: "",
  magnification: "",
  description: "",
};

export function snapshotOf(r: FieldSnapshot): FieldSnapshot {
  return {
    keyStructure: r.keyStructure,
    stainNote: r.stainNote,
    magnification: r.magnification,
    description: r.description,
  };
}

// ---- 初始数据：一个开放批次 + 一个已确认批次（可补录、可查历史）----

function seed(): DB {
  const now = Date.now();
  const min = 60_000;
  return {
    samples: [
      { id: "sp-onion", name: "洋葱表皮", kind: "植物组织", createdAt: now - 120 * min },
      { id: "sp-blood", name: "人血涂片", kind: "血液涂片", createdAt: now - 100 * min },
      { id: "sp-para", name: "草履虫", kind: "微生物", createdAt: now - 80 * min },
    ],
    batches: [
      {
        id: "b-onion-01",
        sampleId: "sp-onion",
        code: "碘液-20260929-A",
        stain: "碘液染色",
        createdAt: now - 90 * min,
        version: 2,
        confirmed: false,
        records: [
          {
            id: "r-seed-1",
            batchId: "b-onion-01",
            magnification: "400x",
            keyStructure: "细胞壁清晰，细胞核可见",
            stainNote: "碘液浸润 2 分钟，着色均匀",
            description: "表皮排列整齐，未见明显气泡",
            author: "王老师",
            baseVersion: 2,
            createdAt: now - 60 * min,
          },
        ],
        supplements: [],
      },
      {
        id: "b-blood-01",
        sampleId: "sp-blood",
        code: "瑞氏-20260928-B",
        stain: "瑞氏染色",
        createdAt: now - 26 * 60 * min,
        version: 3,
        confirmed: true,
        confirmedAt: now - 20 * 60 * min,
        records: [
          {
            id: "r-seed-2",
            batchId: "b-blood-01",
            magnification: "1000x",
            keyStructure: "红细胞分布均匀，中性粒细胞分叶清晰",
            stainNote: "瑞氏染液 3 滴，缓冲液 1:1.5",
            description: "油镜视野，血小板散在",
            author: "李同学",
            baseVersion: 3,
            createdAt: now - 24 * 60 * min,
            confirmedAt: now - 20 * 60 * min,
          },
        ],
        supplements: [
          {
            id: "s-seed-1",
            batchId: "b-blood-01",
            keyStructure: "复查发现少量靶形红细胞",
            stainNote: "同批次涂片复染 30 秒",
            description: "集中在涂片尾部第 2 区",
            magnification: "1000x",
            author: "王老师",
            baseVersion: 3,
            createdAt: now - 5 * 60 * min,
          },
        ],
      },
    ],
    logs: [
      {
        id: uid(),
        time: now - 24 * 60 * min,
        action: "record_create",
        batchId: "b-blood-01",
        sampleId: "sp-blood",
        person: "李同学",
        windowId: "seed",
        detail: "建立血涂片观察记录",
      },
      {
        id: uid(),
        time: now - 20 * 60 * min,
        action: "batch_confirm",
        batchId: "b-blood-01",
        sampleId: "sp-blood",
        person: "王老师",
        windowId: "seed",
        detail: "批次确认，旧结论冻结，转为可补录",
      },
      {
        id: uid(),
        time: now - 5 * 60 * min,
        action: "supplement_add",
        batchId: "b-blood-01",
        sampleId: "sp-blood",
        person: "王老师",
        windowId: "seed",
        detail: "补录：复查发现少量靶形红细胞",
      },
      {
        id: uid(),
        time: now - 60 * min,
        action: "record_create",
        batchId: "b-onion-01",
        sampleId: "sp-onion",
        person: "王老师",
        windowId: "seed",
        detail: "建立洋葱表皮观察记录",
      },
    ],
  };
}

function load<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* 损坏数据按空库处理 */
  }
  return fallback();
}

let db: DB = load(DB_KEY, seed);
let drafts: Draft[] = load(DRAFTS_KEY, () => []);

const listeners = new Set<() => void>();
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("hxwl06") : null;

// 其他窗口写入后：重读 localStorage，本窗口视图跟着刷新（冲突能立刻显现）
window.addEventListener("storage", (e) => {
  if (e.key === DB_KEY) {
    db = load(DB_KEY, seed);
    emit();
  } else if (e.key === DRAFTS_KEY) {
    drafts = load(DRAFTS_KEY, () => []);
    emit();
  }
});
channel?.addEventListener("message", (e) => {
  if (e.data?.kind === "db") {
    db = load(DB_KEY, seed);
    emit();
  } else if (e.data?.kind === "drafts") {
    drafts = load(DRAFTS_KEY, () => []);
    emit();
  }
});

function persistDB() {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  channel?.postMessage({ kind: "db" });
}
function persistDrafts() {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  channel?.postMessage({ kind: "drafts" });
}

function emit() {
  listeners.forEach((l) => l());
}

function addLog(
  action: LogAction,
  batchId: string,
  sampleId: string,
  person: string,
  windowId: string,
  detail: string
) {
  db.logs.unshift({
    id: uid(),
    time: Date.now(),
    action,
    batchId,
    sampleId,
    person,
    windowId,
    detail,
  });
}

function getBatch(batchId: string) {
  const batch = db.batches.find((b) => b.id === batchId);
  if (!batch) throw new Error("批次不存在");
  return batch;
}

// ---- 三方对照：进入编辑的快照 base / 我的内容 mine / 窗口外最新 theirs ----

export function reconcileFields(
  draft: FieldSnapshot,
  baseSnapshot: FieldSnapshot,
  external: FieldSnapshot
): FieldState[] {
  return FIELD_KEYS.map((key) => {
    const mine = draft[key];
    const base = baseSnapshot[key];
    const theirs = external[key];
    const changedByMe = mine !== base;
    const changedExternal = theirs !== base;
    return {
      key,
      mine,
      base,
      theirs,
      changedByMe,
      changedExternal,
      // 双方都改了同一字段且结果不同 => 必须人工二选一，不允许覆盖
      hardConflict: changedByMe && changedExternal && mine !== theirs,
    };
  });
}

export interface SaveInput extends FieldSnapshot {
  draftId?: string;
  windowId: string;
  person: string;
  batchId: string;
  recordId?: string;
  baseVersion: number;
  baseSnapshot: FieldSnapshot;
}

/**
 * 保存观察记录：以「进入编辑时的批次版本」核对。
 * 版本不一致 => 返回逐字段三方对照（conflict），留在当前窗口，由人对照新版本决定，
 * 绝不直接覆盖。
 */
export function saveObservation(input: SaveInput): SaveOutcome {
  const batch = getBatch(input.batchId);
  const record = input.recordId
    ? batch.records.find((r) => r.id === input.recordId)
    : undefined;
  const versionStale = batch.version !== input.baseVersion;
  const recordDeleted = Boolean(input.recordId && !record);

  if (versionStale || recordDeleted) {
    // 新建记录时窗口外的改动属于别的记录，不作为同字段冲突；
    // 只把“批次版本已变”如实告知，编辑器重定位版本后即可提交。
    const external: FieldSnapshot = record ? snapshotOf(record) : emptySnapshot;
    return {
      type: "conflict",
      currentVersion: batch.version,
      recordDeleted,
      batchConfirmed: batch.confirmed,
      fields: reconcileFields(input, input.baseSnapshot, external),
    };
  }

  const values: FieldSnapshot = {
    magnification: input.magnification,
    keyStructure: input.keyStructure,
    stainNote: input.stainNote,
    description: input.description,
  };

  if (record) {
    const touched = FIELD_KEYS.filter((k) => values[k] !== record[k]);
    Object.assign(record, values);
    record.author = input.person;
    record.baseVersion = batch.version;
    addLog(
      "record_save",
      batch.id,
      batch.sampleId,
      input.person,
      input.windowId,
      touched.length
        ? `保存：更新${touched.map((k) => FIELD_NAME[k]).join("、")}（v${batch.version}）`
        : `保存：内容无变化（v${batch.version}）`
    );
  } else {
    const created: ObservationRecord = {
      id: uid(),
      batchId: batch.id,
      ...values,
      author: input.person,
      baseVersion: batch.version,
      createdAt: Date.now(),
    };
    batch.records.push(created);
    addLog(
      "record_create",
      batch.id,
      batch.sampleId,
      input.person,
      input.windowId,
      `建立观察记录：${values.keyStructure || "未命名结构"}（v${batch.version}）`
    );
  }
  batch.version += 1;
  const logId = db.logs[0].id;

  // 正式入库后清掉对应草稿，半成品不留尾巴
  if (input.draftId) discardDraft(input.draftId, { silent: true });

  persistDB();
  if (input.draftId) persistDrafts();
  emit();
  return { type: "committed", logId };
}

const FIELD_NAME: Record<FieldKey, string> = FIELD_LABELS;

export function confirmBatch(batchId: string, person: string, windowId: string) {
  const batch = getBatch(batchId);
  if (batch.confirmed) return;
  if (batch.records.length === 0) {
    throw new Error("批次内还没有观察记录，不能确认");
  }
  const now = Date.now();
  batch.confirmed = true;
  batch.confirmedAt = now;
  batch.records.forEach((r) => {
    r.confirmedAt = now;
    r.baseVersion = batch.version;
  });
  addLog(
    "batch_confirm",
    batch.id,
    batch.sampleId,
    person,
    windowId,
    `批次确认，${batch.records.length} 条旧结论冻结，转为可补录（v${batch.version}）`
  );
  batch.version += 1;
  persistDB();
  emit();
}

export interface SupplementInput extends FieldSnapshot {
  windowId: string;
  person: string;
  batchId: string;
  baseVersion: number;
}

/** 确认后补录：只追加，不动旧结论；同样按进入补录时的版本核对 */
export function saveSupplement(input: SupplementInput): SaveOutcome {
  const batch = getBatch(input.batchId);
  if (!batch.confirmed) throw new Error("批次未确认，不能补录");
  if (batch.version !== input.baseVersion) {
    const latest = batch.supplements[batch.supplements.length - 1];
    return {
      type: "conflict",
      currentVersion: batch.version,
      recordDeleted: false,
      batchConfirmed: true,
      fields: latest
        ? reconcileFields(input, snapshotOf(latest), snapshotOf(latest))
        : [],
    };
  }
  batch.supplements.push({
    id: uid(),
    batchId: batch.id,
    keyStructure: input.keyStructure,
    stainNote: input.stainNote,
    description: input.description,
    magnification: input.magnification,
    author: input.person,
    baseVersion: batch.version,
    createdAt: Date.now(),
  });
  addLog(
    "supplement_add",
    batch.id,
    batch.sampleId,
    input.person,
    input.windowId,
    `补录：${input.keyStructure || "未命名结构"}（v${batch.version}）`
  );
  batch.version += 1;
  persistDB();
  emit();
  return { type: "committed", logId: db.logs[0].id };
}

// ---- 样本与批次 ----

export function addSample(name: string, kind: string) {
  const sample = { id: uid(), name, kind, createdAt: Date.now() };
  db.samples.push(sample);
  persistDB();
  emit();
  return sample;
}

export function addBatch(sampleId: string, code: string, stain: string) {
  const batch = {
    id: uid(),
    sampleId,
    code: code || `${stain || "染色"}-${Date.now().toString(36)}`,
    stain: stain || "未注明",
    createdAt: Date.now(),
    version: 0,
    confirmed: false,
    records: [],
    supplements: [],
  };
  db.batches.unshift(batch);
  persistDB();
  emit();
  return batch;
}

// ---- 草稿：自动保存、重开恢复 ----

export function upsertDraft(draft: Draft) {
  draft.savedAt = Date.now();
  const idx = drafts.findIndex((d) => d.id === draft.id);
  if (idx >= 0) drafts[idx] = draft;
  else drafts.unshift(draft);
  persistDrafts();
  emit();
}

/** 编辑器输入时高频调用：只落盘，不触发全页重渲染 */
export function touchDraft(draft: Draft) {
  draft.savedAt = Date.now();
  const idx = drafts.findIndex((d) => d.id === draft.id);
  if (idx >= 0) drafts[idx] = draft;
  else drafts.unshift(draft);
  persistDrafts();
}

export function discardDraft(id: string, opts: { silent?: boolean } = {}) {
  drafts = drafts.filter((d) => d.id !== id);
  persistDrafts();
  if (!opts.silent) emit();
}

export function getDrafts() {
  return drafts;
}

// ---- 演示支持：模拟“另一个窗口/另一个人”抢先保存 ----

export function simulateExternalSave(batchId: string): number {
  const batch = getBatch(batchId);
  const person = "赵演示（另一窗口）";
  if (batch.confirmed) {
    batch.supplements.push({
      id: uid(),
      batchId: batch.id,
      magnification: "1000x",
      keyStructure: "【另一窗口补录】涂片尾部疑似异型细胞，待复查",
      stainNote: "【另一窗口】建议延长复染 20 秒",
      description: "由演示按钮模拟第二个窗口追加",
      author: person,
      baseVersion: batch.version,
      createdAt: Date.now(),
    });
    addLog("supplement_add", batch.id, batch.sampleId, person, "other-window", "另一窗口补录（演示）");
  } else {
    const last = batch.records[batch.records.length - 1];
    if (last) {
      last.keyStructure = "【另一窗口改】核仁明显，可见胞间连丝";
      last.stainNote = "【另一窗口改】碘液改染 90 秒，避免过染";
      last.author = person;
      addLog(
        "record_save",
        batch.id,
        batch.sampleId,
        person,
        "other-window",
        "另一窗口抢先保存重点结构与染色备注（演示）"
      );
    } else {
      batch.records.push({
        id: uid(),
        batchId: batch.id,
        magnification: "400x",
        keyStructure: "【另一窗口新建】表皮气孔器",
        stainNote: "【另一窗口】碘液 60 秒",
        description: "由演示按钮模拟第二个窗口录入",
        author: person,
        baseVersion: batch.version,
        createdAt: Date.now(),
      });
      addLog(
        "record_create",
        batch.id,
        batch.sampleId,
        person,
        "other-window",
        "另一窗口建立记录（演示）"
      );
    }
  }
  batch.version += 1;
  persistDB();
  emit();
  return batch.version;
}

// ---- 查询 ----

export function getDB(): DB {
  return db;
}
export function getBatchById(id: string) {
  return db.batches.find((b) => b.id === id);
}
export function getSampleById(id: string) {
  return db.samples.find((s) => s.id === id);
}

/** 编辑期间，窗口外发生在该批次上的操作（对照“新版本”时列出） */
export function changesSince(batchId: string, baseTime: number) {
  return db.logs.filter((l) => l.batchId === batchId && l.time > baseTime);
}

/** 批次时间线：旧结论、补录、人员操作按时间排 */
export function batchTimeline(batchId: string) {
  const batch = getBatch(batchId);
  type Item = {
    kind: "record" | "supplement" | "log";
    time: number;
    text: string;
    person: string;
    action?: LogAction;
  };
  const items: Item[] = [];
  batch.records.forEach((r) =>
    items.push({
      kind: "record",
      time: r.confirmedAt ?? r.createdAt,
      person: r.author,
      text: `${r.confirmedAt ? "正式结论" : "工作稿"}：${r.keyStructure || "未命名结构"}`,
    })
  );
  batch.supplements.forEach((s) =>
    items.push({
      kind: "supplement",
      time: s.createdAt,
      person: s.author,
      text: `补录：${s.keyStructure || "未命名结构"}`,
    })
  );
  db.logs
    .filter((l) => l.batchId === batchId)
    .forEach((l) =>
      items.push({ kind: "log", time: l.time, person: l.person, action: l.action, text: l.detail })
    );
  return items.sort((a, b) => b.time - a.time);
}

export { ACTION_LABELS, FIELD_LABELS };

// ---- React 订阅 ----

export function useStore(): DB {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => db,
    () => db
  );
}

export function useDrafts(): Draft[] {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => drafts,
    () => drafts
  );
}

// ---- 当前窗口与人员 ----

export const WINDOW_ID =
  typeof sessionStorage !== "undefined"
    ? sessionStorage.getItem("hxwl06.windowId") ||
      (() => {
        const id = `win-${Math.random().toString(36).slice(2, 6)}`;
        sessionStorage.setItem("hxwl06.windowId", id);
        return id;
      })()
    : "win-unknown";

export function getPerson(): string {
  return localStorage.getItem(PERSON_KEY) || "王老师";
}
export function setPerson(name: string) {
  localStorage.setItem(PERSON_KEY, name);
  emit();
}

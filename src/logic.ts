import type {
  BatchStatus,
  Draft,
  ID,
  LogAction,
  LogEntry,
  Observation,
  Sample,
  StainBatch,
} from "./types";

/** 全部共享状态。db 键下的内容模拟“服务端”，跨窗口一致。 */
export interface DBState {
  samples: Sample[];
  batches: StainBatch[];
  observations: Observation[];
  logs: LogEntry[];
}

export interface SubmitInput {
  /** 进入编辑时锁定的批次版本 */
  baseVersion: number;
  stainMethod?: string;
  stainNote?: string;
  magnification: string;
  keyStructure: string;
  description: string;
}

export interface SubmitResult {
  ok: boolean;
  /** 版本冲突：必须先对照新版本，由当前窗口显式处理 */
  conflict?: {
    batchId: ID;
    currentVersion: number;
    baseVersion: number;
  };
  observationId?: ID;
}

export function uid(prefix = "id"): ID {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function log(
  state: DBState,
  parts: {
    actor: string;
    action: LogAction;
    batchId: ID;
    detail: string;
    fromVersion: number;
    toVersion: number;
    ts: number;
  },
): void {
  state.logs.push({ id: uid("log"), ...parts });
}

export function getBatch(state: DBState, batchId: ID): StainBatch | undefined {
  return state.batches.find((b) => b.id === batchId);
}

export function batchObservations(state: DBState, batchId: ID): Observation[] {
  return state.observations
    .filter((o) => o.batchId === batchId)
    .sort((a, b) => a.savedAt - b.savedAt);
}

export function batchCodeFor(state: DBState, batchId: ID): string {
  return getBatch(state, batchId)?.code ?? batchId;
}

/** 批次号：染色代码-日期-当日序号（建批数，种子数据按固定号） */
export function nextBatchCode(state: DBState): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const sameDay = state.batches.filter((b) => b.code.includes(`-${ymd}-`)).length + 1;
  return `RAN-${ymd}-${String(sameDay).padStart(2, "0")}`;
}

export function createSample(state: DBState, input: { name: string; type: string; source: string }): Sample {
  const sample: Sample = {
    id: uid("s"),
    name: input.name.trim(),
    type: input.type.trim(),
    source: input.source.trim(),
    createdAt: Date.now(),
  };
  state.samples.push(sample);
  return sample;
}

export function createBatch(
  state: DBState,
  input: { sampleId: ID; stainMethod: string; stainNote: string; actor: string; code?: string },
): StainBatch {
  const now = Date.now();
  const batch: StainBatch = {
    id: uid("b"),
    code: input.code ?? nextBatchCode(state),
    sampleId: input.sampleId,
    stainMethod: input.stainMethod.trim(),
    stainNote: input.stainNote.trim(),
    status: "open",
    version: 1,
    openedAt: now,
    openedBy: input.actor,
    confirmedAt: null,
    confirmedBy: null,
    conclusion: "",
  };
  state.batches.push(batch);
  log(state, {
    actor: input.actor,
    action: "batch.create",
    batchId: batch.id,
    detail: `建批 ${batch.code}，染色方式：${batch.stainMethod}`,
    fromVersion: 0,
    toVersion: 1,
    ts: now,
  });
  return batch;
}

function batchFieldConflicts(input: SubmitInput, batch: StainBatch): string[] {
  const fields: string[] = [];
  if (input.stainMethod !== undefined && input.stainMethod.trim() !== batch.stainMethod) {
    fields.push("stainMethod");
  }
  if (input.stainNote !== undefined && input.stainNote.trim() !== batch.stainNote) {
    fields.push("stainNote");
  }
  return fields;
}

/**
 * 保存观察记录（含染色信息改动）。
 * 规则：以进入编辑时的 baseVersion 与当前批次版本核对；
 * 不一致即判定冲突，原样拒绝，不写任何数据，由调用方对照新版本。
 */
export function submitObservation(
  state: DBState,
  batchId: ID,
  actor: string,
  input: SubmitInput,
): SubmitResult {
  const batch = getBatch(state, batchId);
  if (!batch) return { ok: false };
  if (!input.magnification.trim() || !input.keyStructure.trim()) {
    return { ok: false };
  }

  if (input.baseVersion !== batch.version) {
    return {
      ok: false,
      conflict: { batchId, currentVersion: batch.version, baseVersion: input.baseVersion },
    };
  }

  const fieldChanges = batchFieldConflicts(input, batch);
  const versionBumped = fieldChanges.length > 0;
  const toVersion = versionBumped ? batch.version + 1 : batch.version;
  const now = Date.now();

  if (versionBumped) {
    if (input.stainMethod !== undefined) batch.stainMethod = input.stainMethod.trim();
    if (input.stainNote !== undefined) batch.stainNote = input.stainNote.trim();
    batch.version = toVersion;
  }

  const observation: Observation = {
    id: uid("o"),
    batchId,
    magnification: input.magnification.trim(),
    keyStructure: input.keyStructure.trim(),
    description: input.description.trim(),
    author: actor,
    savedAt: now,
    baseVersion: input.baseVersion,
    savedAtVersion: toVersion,
    isSupplement: batch.status === "confirmed",
  };
  state.observations.push(observation);

  log(state, {
    actor,
    action: observation.isSupplement ? "observation.supplement" : "observation.save",
    batchId,
    detail:
      `${observation.isSupplement ? "补录" : "保存"}观察记录：${observation.magnification} · ${observation.keyStructure}` +
      (fieldChanges.length > 0 ? `；同时更新 ${fieldChanges.join("、")}` : ""),
    fromVersion: input.baseVersion,
    toVersion,
    ts: now,
  });

  return { ok: true, observationId: observation.id };
}

/**
 * 确认批次：冻结当前结论。确认后批次仍可补录观察记录，
 * 旧结论与全部历史记录原样保留。
 */
export function confirmBatch(state: DBState, batchId: ID, actor: string, conclusion: string): boolean {
  const batch = getBatch(state, batchId);
  if (!batch || batch.status !== "open") return false;
  const fromVersion = batch.version;
  batch.status = "confirmed";
  batch.conclusion = conclusion.trim();
  batch.confirmedAt = Date.now();
  batch.confirmedBy = actor;
  // 状态与结论变化也推进版本，保证“确认后再保存旧窗口”仍被拦住
  batch.version = fromVersion + 1;
  log(state, {
    actor,
    action: "batch.confirm",
    batchId,
    detail: `确认批次，冻结结论：${batch.conclusion || "（未填写结论）"}`,
    fromVersion,
    toVersion: batch.version,
    ts: batch.confirmedAt!,
  });
  return true;
}

/** 冲突面板需要的逐字段对照 */
export interface FieldDiff {
  key: keyof Pick<StainBatch, "stainMethod" | "stainNote"> | "observation";
  label: string;
  /** 进入编辑时的旧值 */
  base: string;
  /** 当前窗口草稿里的值 */
  draft: string;
  /** 对方保存后的新值 */
  current: string;
  /** 新版本中由新记录造成的变更（字段本身无改动） */
  newerObservation?: Observation;
}

export function diffBatchAgainst(state: DBState, draft: Draft): FieldDiff[] {
  const batch = getBatch(state, draft.batchId);
  const diffs: FieldDiff[] = [];
  if (!batch) return diffs;

  if (draft.snapshotStainMethod !== batch.stainMethod || draft.stainMethod !== batch.stainMethod) {
    diffs.push({
      key: "stainMethod",
      label: "染色方式",
      base: draft.snapshotStainMethod,
      draft: draft.stainMethod,
      current: batch.stainMethod,
    });
  }
  if (draft.snapshotStainNote !== batch.stainNote || draft.stainNote !== batch.stainNote) {
    diffs.push({
      key: "stainNote",
      label: "染色备注",
      base: draft.snapshotStainNote,
      draft: draft.stainNote,
      current: batch.stainNote,
    });
  }

  // 对方在新版本保存的观察记录（不覆盖任何旧记录，但需要看到）
  const newer = state.observations
    .filter((o) => o.batchId === draft.batchId && o.baseVersion >= draft.baseVersion && o.savedAt > draft.createdAt)
    .sort((a, b) => a.savedAt - b.savedAt);
  for (const o of newer) {
    diffs.push({
      key: "observation",
      label: `新版本观察记录 · ${o.author} · v${o.savedAtVersion}`,
      base: "",
      draft: "",
      current: `${o.magnification} · ${o.keyStructure}${o.description ? ` — ${o.description}` : ""}`,
      newerObservation: o,
    });
  }
  return diffs;
}

export function buildDraft(state: DBState, draftBase: {
  batchId: ID;
  author: string;
}): Draft | undefined {
  const batch = getBatch(state, draftBase.batchId);
  if (!batch) return undefined;
  const now = Date.now();
  return {
    id: uid("d"),
    batchId: batch.id,
    batchCode: batch.code,
    author: draftBase.author,
    baseVersion: batch.version,
    snapshotStainMethod: batch.stainMethod,
    snapshotStainNote: batch.stainNote,
    stainMethod: batch.stainMethod,
    stainNote: batch.stainNote,
    magnification: "",
    keyStructure: "",
    description: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function seedState(): DBState {
  const now = Date.now();
  const state: DBState = { samples: [], batches: [], observations: [], logs: [] };

  const s1 = createSample(state, { name: "洋葱表皮", type: "植物组织", source: "实验楼 B203 标本柜" });
  const s2 = createSample(state, { name: "人血涂片", type: "血液涂片", source: "教学标本盒 A-12" });

  // 直接构造批次以便保留固定批次号与历史时间线
  const b1: StainBatch = {
    id: uid("b"),
    code: `RAN-${yyyymmdd(now - 86400000)}-01`,
    sampleId: s1.id,
    stainMethod: "碘液染色",
    stainNote: "染色 90 秒，细胞壁对比清晰；避光暂存",
    status: "confirmed",
    version: 3,
    openedAt: now - 86400000,
    openedBy: "王老师",
    confirmedAt: now - 82000000,
    confirmedBy: "王老师",
    conclusion: "细胞壁与细胞核结构完整，可作为示范片归档。",
  };
  const b2: StainBatch = {
    id: uid("b"),
    code: `RAN-${yyyymmdd(now)}-01`,
    sampleId: s2.id,
    stainMethod: "瑞氏染色",
    stainNote: "染色 3 分钟，pH 6.4 缓冲液冲洗",
    status: "open",
    version: 2,
    openedAt: now - 3600_000 * 5,
    openedBy: "李同学",
    confirmedAt: null,
    confirmedBy: null,
    conclusion: "",
  };
  state.batches.push(b1, b2);

  const obs: Array<[StainBatch, string, string, string, string, number, number, boolean]> = [
    // [batch, author, magnification, keyStructure, description, ageMs, savedAtVersion, supplement]
    [b1, "王老师", "100x", "表皮细胞排列", "细胞呈规则长方形，排列紧密", 85000000, 1, false],
    [b1, "王老师", "400x", "细胞壁、细胞核", "细胞壁清晰，核被碘液染成黄褐色", 83000000, 2, false],
    [b1, "张同学", "400x", "质壁分离复核", "边缘视野可见轻微质壁分离，不影响示范结论", 7200000, 3, true],
    [b2, "李同学", "400x", "红细胞分布", "红细胞分布均匀，无明显叠连", 3600_000 * 2, 1, false],
    [b2, "李同学", "1000x", "白细胞分类", "可见分叶核中性粒细胞，待复核嗜酸粒细胞", 3600_000, 2, false],
  ];
  for (const [batch, author, magnification, keyStructure, description, ageMs, savedAtVersion, supplement] of obs) {
    state.observations.push({
      id: uid("o"),
      batchId: batch.id,
      magnification,
      keyStructure,
      description,
      author,
      savedAt: now - ageMs,
      baseVersion: supplement ? savedAtVersion : Math.max(1, savedAtVersion - 1),
      savedAtVersion,
      isSupplement: supplement,
    });
  }

  const seedLogs: Array<[string, LogAction, ID, string, number, number, number]> = [
    ["王老师", "batch.create", b1.id, `建批 ${b1.code}，染色方式：碘液染色`, 0, 1, 86400000],
    ["王老师", "observation.save", b1.id, "保存观察记录：100x · 表皮细胞排列", 1, 1, 85000000],
    ["王老师", "observation.save", b1.id, "保存观察记录：400x · 细胞壁、细胞核；同时更新 染色备注", 1, 2, 83000000],
    ["王老师", "batch.confirm", b1.id, "确认批次，冻结结论：细胞壁与细胞核结构完整，可作为示范片归档。", 2, 3, 82000000],
    // 说明：确认推进版本后补录不改版本（无字段改动），日志版本号展示落库版本
    ["张同学", "observation.supplement", b1.id, "补录观察记录：400x · 质壁分离复核", 3, 3, 7200000],
    ["李同学", "batch.create", b2.id, `建批 ${b2.code}，染色方式：瑞氏染色`, 0, 1, 3600_000 * 5],
    ["李同学", "observation.save", b2.id, "保存观察记录：400x · 红细胞分布", 1, 1, 3600_000 * 2],
    ["李同学", "observation.save", b2.id, "保存观察记录：1000x · 白细胞分类；同时更新 染色备注", 1, 2, 3600_000],
  ];
  for (const [actor, action, batchId, detail, fv, tv, ageMs] of seedLogs) {
    state.logs.push({
      id: uid("log"),
      ts: now - ageMs,
      actor,
      action,
      batchId,
      detail,
      fromVersion: fv,
      toVersion: tv,
    });
  }

  return state;
}

function yyyymmdd(t: number): string {
  const d = new Date(t);
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

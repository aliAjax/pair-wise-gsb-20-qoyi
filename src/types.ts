// 领域模型：样本 → 染色批次 → 观察记录（工作稿 / 正式结论 / 补录）→ 日志

export type FieldKey = "keyStructure" | "stainNote" | "magnification" | "description";

export const FIELD_LABELS: Record<FieldKey, string> = {
  keyStructure: "重点结构",
  stainNote: "染色备注",
  magnification: "放大倍数",
  description: "视野描述",
};

export const FIELD_ORDER: FieldKey[] = [
  "keyStructure",
  "stainNote",
  "magnification",
  "description",
];

/** 观察记录：未确认批次内为工作稿，批次确认后冻结为正式结论 */
export interface ObservationRecord {
  id: string;
  batchId: string;
  magnification: string;
  keyStructure: string;
  stainNote: string;
  description: string;
  author: string;
  /** 进入编辑时看到的批次版本（乐观锁基准） */
  baseVersion: number;
  createdAt: number;
  /** 批次确认时间；存在即为正式结论 */
  confirmedAt?: number;
}

/** 确认后的补录：只能追加，不能改旧结论 */
export interface Supplement {
  id: string;
  batchId: string;
  keyStructure: string;
  stainNote: string;
  description: string;
  magnification: string;
  author: string;
  baseVersion: number;
  createdAt: number;
}

export interface StainBatch {
  id: string;
  sampleId: string;
  code: string;
  stain: string;
  createdAt: number;
  version: number;
  /** 批次确认后：旧记录冻结，仅可补录 */
  confirmed: boolean;
  confirmedAt?: number;
  records: ObservationRecord[];
  supplements: Supplement[];
}

export interface Sample {
  id: string;
  name: string;
  kind: string;
  createdAt: number;
}

export type LogAction =
  | "record_create"
  | "record_save"
  | "batch_confirm"
  | "supplement_add";

export interface LogEntry {
  id: string;
  time: number;
  action: LogAction;
  batchId: string;
  sampleId: string;
  person: string;
  windowId: string;
  detail: string;
}

export interface FieldSnapshot {
  magnification: string;
  keyStructure: string;
  stainNote: string;
  description: string;
}

/** 未确认草稿：浏览器重开后只恢复它，绝不混入正式记录 */
export interface Draft extends FieldSnapshot {
  id: string;
  windowId: string;
  batchId: string;
  sampleId: string;
  person: string;
  /** 进入编辑时的批次版本，恢复后仍按它核对 */
  baseVersion: number;
  /** 进入编辑那一刻的字段快照（三方对照的 base） */
  baseSnapshot: FieldSnapshot;
  /** 进入编辑时间，用于列出“编辑期间窗口外发生的改动” */
  baseTime: number;
  /** 已存在记录的 id；为空表示新建 */
  recordId?: string;
  savedAt?: number;
}

export interface DB {
  samples: Sample[];
  batches: StainBatch[];
  logs: LogEntry[];
}

export type FieldState = {
  key: FieldKey;
  mine: string;
  base: string;
  theirs: string;
  changedByMe: boolean;
  changedExternal: boolean;
  /** true = 双方改了同一字段，必须人工二选一 */
  hardConflict: boolean;
};

export type SaveOutcome =
  | { type: "committed"; logId: string }
  | {
      type: "conflict";
      currentVersion: number;
      recordDeleted: boolean;
      batchConfirmed: boolean;
      fields: FieldState[];
    };

export const ACTION_LABELS: Record<LogAction, string> = {
  record_create: "建立观察记录",
  record_save: "保存观察记录",
  batch_confirm: "批次确认",
  supplement_add: "补录观察",
};

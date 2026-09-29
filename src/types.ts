// 领域模型：样本 → 染色批次 → 观察记录 → 日志
// 批次带版本号（乐观锁），观察记录只追加不改写。

export type ID = string;

export interface Sample {
  id: ID;
  name: string;
  type: string;
  source: string;
  createdAt: number;
}

export type BatchStatus = "open" | "confirmed";

export interface StainBatch {
  id: ID;
  /** 批次号，如 RAN-260929-01 */
  code: string;
  sampleId: ID;
  /** 染色方式 */
  stainMethod: string;
  /** 染色备注（后写覆盖的高发字段） */
  stainNote: string;
  status: BatchStatus;
  /** 乐观锁版本：进入编辑时记录，保存时核对 */
  version: number;
  openedAt: number;
  openedBy: string;
  confirmedAt: number | null;
  confirmedBy: string | null;
  /** 确认时冻结的结论，补录不改变它 */
  conclusion: string;
}

export interface Observation {
  id: ID;
  batchId: ID;
  /** 放大倍数 */
  magnification: string;
  /** 重点结构 */
  keyStructure: string;
  /** 视野描述 */
  description: string;
  author: string;
  savedAt: number;
  /** 进入编辑时所基于的批次版本 */
  baseVersion: number;
  /** 本条记录落库后的批次版本 */
  savedAtVersion: number;
  /** 批次确认后的补录记录 */
  isSupplement: boolean;
}

export type LogAction =
  | "batch.create"
  | "batch.edit"
  | "batch.confirm"
  | "observation.save"
  | "observation.supplement";

export interface LogEntry {
  id: ID;
  ts: number;
  actor: string;
  action: LogAction;
  batchId: ID;
  detail: string;
  fromVersion: number;
  toVersion: number;
}

/** 未确认草稿：与正式库物理分离，永远不会被当成正式记录渲染 */
export interface Draft {
  id: ID;
  batchId: ID;
  /** 冗余批次号，恢复时即使跨状态也能标明归属 */
  batchCode: string;
  author: string;
  /** 进入编辑时的批次版本 —— 保存核对的依据 */
  baseVersion: number;
  /** 进入时快照，用于和新版本逐字段对照 */
  snapshotStainMethod: string;
  snapshotStainNote: string;
  // 工作区内容
  stainMethod: string;
  stainNote: string;
  magnification: string;
  keyStructure: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

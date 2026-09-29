import { useState } from "react";
import { setOperator } from "../session";

export function TopBar({
  operator,
  counts,
  onReset,
}: {
  operator: string;
  counts: { samples: number; batches: number; observations: number; drafts: number };
  onReset: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="logo-dot" />
        <div>
          <h1>显微镜玻片观察工作台</h1>
          <p>样本 → 染色批次 → 观察记录 → 操作日志（批次版本核对 · 草稿与正式记录分离）</p>
        </div>
      </div>

      <div className="topbar-stats">
        <span><b>{counts.samples}</b> 样本</span>
        <span><b>{counts.batches}</b> 批次</span>
        <span><b>{counts.observations}</b> 正式记录</span>
        <span className={counts.drafts > 0 ? "stat-warn" : ""}><b>{counts.drafts}</b> 未确认草稿</span>
      </div>

      <div className="operator-box">
        {operator ? (
          <>
            <span className="operator-badge">{operator}</span>
            <button className="link-btn" onClick={() => setOperator("")}>切换</button>
          </>
        ) : (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && setOperator(name)}
              placeholder="输入姓名（当前窗口操作人）"
            />
            <button disabled={!name.trim()} onClick={() => setOperator(name)}>进入</button>
          </>
        )}
      </div>

      <button className="ghost-btn" onClick={() => {
        if (window.confirm("重置全部正式数据与草稿，恢复演示种子？")) onReset();
      }}>
        重置演示数据
      </button>
    </header>
  );
}

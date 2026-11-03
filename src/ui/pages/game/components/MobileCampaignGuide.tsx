import { useState } from 'react';
import { campaignGuide } from '../../../../games/ra2/campaignGuide';
const key = 'ra2-mobile-guide';
export function MobileCampaignGuide({ onPause, active }: { onPause(): void; active: boolean }) {
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem(key) ?? 'allied-1';
    } catch {
      return 'allied-1';
    }
  });
  const chapter = campaignGuide.find((c) => c.id === id) ?? campaignGuide[0];
  const choose = (next: string) => {
    setId(next);
    try {
      localStorage.setItem(key, next);
    } catch {}
  };
  return (
    <section className="mobile-guide" aria-label="战役攻略">
      <p>原版 24 关 · 离线速查</p>
      <div className="mobile-command-grid">
        {[
          ['allied', '盟军'],
          ['soviet', '苏军'],
        ].map(([side, name]) => (
          <button key={side} aria-pressed={chapter.side === side} onClick={() => choose(`${side}-1`)}>
            {name} 12 关
          </button>
        ))}
      </div>
      <label>
        选择关卡
        <select aria-label="攻略关卡" value={chapter.id} onChange={(e) => choose(e.target.value)}>
          {campaignGuide
            .filter((c) => c.side === chapter.side)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.number}. {c.title}
              </option>
            ))}
        </select>
      </label>
      <article key={chapter.id}>
        <h3>
          {chapter.number}. {chapter.title}
        </h3>
        <small>{chapter.english}</small>
        <h4>任务目标</h4>
        <p>{chapter.objective}</p>
        <h4>推荐打法</h4>
        <p>{chapter.plan}</p>
        <h4>注意事项</h4>
        <p>{chapter.caution}</p>
      </article>
      <div className="mobile-command-grid">
        <button disabled={chapter.number === 1} onClick={() => choose(`${chapter.side}-${chapter.number - 1}`)}>
          上一关
        </button>
        <button disabled={chapter.number === 12} onClick={() => choose(`${chapter.side}-${chapter.number + 1}`)}>
          下一关
        </button>
      </div>
      <details>
        <summary>手机操作与阅读提示</summary>
        <p>
          点“保存编组”再点队号保存，平时点队号召回。英雄、工程师、主攻队分开编组；双指拖图，捏合缩放。占领和潜入前先放大，避免误点。
        </p>
        <p>
          选择攻略不会切换游戏关卡。中文名称可能因汉化不同而异，请按关卡序号及英文名对应。建议打法由本版整理，难度及触发条件以游戏任务提示为准。
        </p>
      </details>
      {active && (
        <>
          <p>阅读时战斗仍在继续。</p>
          <button className="mobile-menu-wide" onClick={onPause}>
            打开原版暂停菜单
          </button>
        </>
      )}
      <small>
        任务资料核对：Steven W. Carter《Campaign Walkthroughs》v1.0、The Gamers’ Temple
        任务指南。此处为自行整理的简明提示，非逐关通关录像。
      </small>
    </section>
  );
}

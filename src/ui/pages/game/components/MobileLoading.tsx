import { useStore } from '../../../shared/state/useStore';
import { mobileBattle, mobileShell, mobileLoadingScene } from '../mobileState';
import { mobileLoadingArtwork } from '../mobileLoadingScene';
import { mainPanel } from '../state/uiState';

export function MobileLoading() {
  const scene = useStore(mobileLoadingScene);
  const shell = useStore(mobileShell);
  const battle = useStore(mobileBattle);
  const problem = useStore(mainPanel);
  if (problem || shell || battle.ready) return null;
  return (
    <section
      className="mobile-loading"
      role="status"
      aria-label="游戏加载中"
      data-scene={scene}
      style={{ backgroundImage: `url("${mobileLoadingArtwork[scene].image}")` }}
    >
      <div className="mobile-loading-caption">
        <span>红色警戒 2</span>
        <h2>{mobileLoadingArtwork[scene].title}</h2>
        <div className="mobile-loading-track">
          <i />
        </div>
        <p>首次载入需要一些时间，请稍候</p>
      </div>
    </section>
  );
}

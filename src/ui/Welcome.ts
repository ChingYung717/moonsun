import { CURATED_ECLIPSE_CATALOG, getCuratedCatalogStats } from '../astro/eclipses/catalog';
import { MasterRenderer } from '../render/Renderer';
import { AppState, DEFAULT_MOON_SITES } from '../state/AppState';
import { EclipsePanel } from './EclipsePanel';
import { showToast } from './Toast';

const WELCOMED_KEY = 'moonsun_welcomed_v2';

export class WelcomeModal {
  public readonly el: HTMLElement;
  private onStartTourCallback: (() => void) | null = null;

  constructor(
    private state: AppState,
    private renderer: MasterRenderer,
    private eclipsePanel: EclipsePanel
  ) {
    this.el = document.createElement('div');
    this.el.className = 'ms-modal-backdrop';
    this.el.style.display = 'none';
    this.render();
    document.body.appendChild(this.el);

    const params = new URLSearchParams(window.location.search);
    const skipWelcome = params.has('t') || params.has('nowelcome');
    let alreadyWelcomed = false;
    try {
      alreadyWelcomed = localStorage.getItem(WELCOMED_KEY) === '1';
    } catch {
      // ignore
    }

    if (!skipWelcome && !alreadyWelcomed) {
      this.open();
    }
  }

  public onStartTour(cb: () => void): void {
    this.onStartTourCallback = cb;
  }

  public open(): void {
    this.el.style.display = 'flex';
  }

  public close(): void {
    this.el.style.display = 'none';
    try {
      localStorage.setItem(WELCOMED_KEY, '1');
    } catch {
      // ignore
    }
  }

  public runScenario(id: 'nowSky' | 'eclipse2009' | 'moonEclipse2018'): void {
    this.close();
    if (id === 'nowSky') {
      this.state.pushUndoSnapshot('体验：看看此刻的天空');
      this.state.update({
        timeUtc: Date.now(),
        playing: true,
        speedMultiplier: 1,
        isRealtimeSync: true,
        viewMode: 'ground',
        activeEclipsePeakUtc: null,
        activeEclipseKind: null,
        selectedEclipseId: null,
        eclipseReplay: null,
      });
      showToast('🌤 已进入当前时刻地面天空视角（拖动画面可环顾四周）');
    } else if (id === 'eclipse2009') {
      const item2009 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'solar-2009-07-22');
      if (item2009) {
        this.eclipsePanel.selectEclipseEvent(item2009, 'ground');
        // Wuhan U2 (食既) is at 01:23:56 UTC (09:23:56 BJT).
        // Start 90 seconds before U2 (01:22:26 UTC) at 10x speed so the user watches the thin solar crescent
        // vanish into totality (白昼骤黑 + 日冕绽放) after 9 real seconds!
        this.state.update({
          timeUtc: Date.UTC(2009, 6, 22, 1, 22, 26),
          speedMultiplier: 10,
          playing: true,
          isRealtimeSync: false,
        });
        this.renderer.groundView.setLockTarget('sun');
        showToast('🌑 正在回放 2009 长江日全食（武汉站 · 食既前90秒起 10倍速见证白昼骤黑）');
      }
    } else if (id === 'moonEclipse2018') {
      const item2018 = CURATED_ECLIPSE_CATALOG.find((x) => x.id === 'lunar-2018-07-27');
      if (item2018) {
        this.eclipsePanel.selectEclipseEvent(item2018, 'moon');
        // Ensure Moon observer is set to Apollo 11 Sea of Tranquility on the near side after undo snapshot is saved
        this.state.setMoonLocation(DEFAULT_MOON_SITES[1]);
        this.renderer.moonSurfaceView.setLockTarget('earth');
        showToast('🌕 已站在月球正面（静海基地）仰望地球：地球正完全遮住太阳，大气层折射出一圈红环！');
      }
    }
  }

  private render(): void {
    const stats = getCuratedCatalogStats();
    this.el.innerHTML = `
      <div class="ms-welcome-card glass-panel" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div class="ms-welcome-head">
          <div class="ms-welcome-badge">☀️🌍🌕 欢迎体验</div>
          <h2 id="welcome-title">日月地 3D 实时天文与日月食历算系统</h2>
          <p class="ms-welcome-sub">
            融合高精度天体历算、4K 行星贴图、全球与中国可见 ${stats.total} 场精选日月食以及中国传统农历月相。建议先从以下 <strong>3 个一键体验场景</strong> 开始：
          </p>
        </div>

        <div class="ms-scenario-grid">
          <button type="button" class="ms-scenario-card" data-scenario="nowSky">
            <span class="sc-icon">🌤</span>
            <div class="sc-body">
              <h3>1. 看看此刻的天空</h3>
              <p>进入当前地球观测点（默认北京，可在「📍 地点」随时切换城市或定位）的第一人称地面视角，自动对准可见的太阳或月亮。</p>
            </div>
            <span class="sc-go">立即进入 →</span>
          </button>

          <button type="button" class="ms-scenario-card" data-scenario="eclipse2009">
            <span class="sc-icon">🌑</span>
            <div class="sc-body">
              <h3>2. 重温 2009 长江大日全食</h3>
              <p>穿越到 2009 年 7 月 22 日武汉上空，亲历 21 世纪最长日全食从食既、白昼骤黑到日冕绽放的全过程。</p>
            </div>
            <span class="sc-go">一键重温 →</span>
          </button>

          <button type="button" class="ms-scenario-card" data-scenario="moonEclipse2018">
            <span class="sc-icon">🌕</span>
            <div class="sc-body">
              <h3>3. 站在月球上看月全食</h3>
              <p>当地球上看到“红月亮”时，站在月球表面抬头会看到什么？看地球遮住太阳、外围亮起一圈铜红色霞光环！</p>
            </div>
            <span class="sc-go">登上月球 →</span>
          </button>
        </div>

        <div class="ms-welcome-foot">
          <button type="button" class="btn-primary" id="welcome-start-tour">🧭 带我 1 分钟逛遍界面 (6步引导)</button>
          <button type="button" class="btn-secondary" id="welcome-dismiss">不用了，我自己探索</button>
        </div>
      </div>
    `;

    this.el.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sc = btn.dataset.scenario as 'nowSky' | 'eclipse2009' | 'moonEclipse2018';
        this.runScenario(sc);
      });
    });

    this.el.querySelector('#welcome-start-tour')?.addEventListener('click', () => {
      this.close();
      this.onStartTourCallback?.();
    });

    this.el.querySelector('#welcome-dismiss')?.addEventListener('click', () => {
      this.close();
    });

    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) {
        this.close();
      }
    });
  }
}

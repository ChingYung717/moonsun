import {
  AppState,
  OverlayFlags,
  ScaleMode,
  SpaceCameraPreset,
  ViewMode,
  syncBrowserUrlNow,
} from '../state/AppState';
import { getCuratedCatalogStats } from '../astro/eclipses/catalog';
import { MasterRenderer } from '../render/Renderer';
import { SimulationClock } from '../time/Clock';
import { computeEarthObserverSky } from '../astro/observer';
import { showToast } from './Toast';
import { termTipHtml } from './tooltips';

export class TopBar {
  public readonly el: HTMLElement;
  private onOpenHelpCallback: (() => void) | null = null;

  constructor(
    private state: AppState,
    private renderer: MasterRenderer,
    private clock?: SimulationClock
  ) {
    this.el = document.createElement('header');
    this.el.className = 'topbar glass-panel';
    this.render();
    this.state.subscribe((s, changed) => {
      if (changed.has('viewMode') && s.viewMode === 'ground' && !changed.has('groundLockTarget')) {
        if (s.activeEclipseKind === 'solar') {
          this.renderer.groundView.setLockTarget('sun');
        } else if (s.activeEclipseKind === 'lunar') {
          this.renderer.groundView.setLockTarget('moon');
        } else {
          const sky = computeEarthObserverSky(
            s.timeUtc,
            s.earthObserver.lat,
            s.earthObserver.lon,
            s.earthObserver.elevation
          );
          this.renderer.groundView.autoAimOnEnter(sky);
        }
      }
      this.syncActiveButtons();
    });
    this.renderer.groundView.onLockChange(() => this.syncActiveButtons());
    this.renderer.moonSurfaceView.onLockChange(() => this.syncActiveButtons());
  }

  public onOpenHelp(cb: () => void): void {
    this.onOpenHelpCallback = cb;
  }

  private render(): void {
    const stats = getCuratedCatalogStats();
    this.el.innerHTML = `
      <div class="topbar-brand">
        <span class="brand-icon" aria-hidden="true">☀️🌍🌕</span>
        <div class="brand-text">
          <h1>日月地 3D 天文历算与天象系统</h1>
          <span class="brand-sub">VSOP87/ELP 历算 · ${stats.total}场精选日月食 · 中国传统农历</span>
        </div>
      </div>

      <div class="topbar-controls">
        <div class="btn-group" id="tour-view-group" role="group" aria-label="视角模式">
          <button type="button" class="top-btn" data-view="space" aria-label="切换到太空视角" title="从太空中自由观察日地月运行与月影本影带 (快捷键 1)">🌌 太空视角</button>
          <button type="button" class="top-btn" data-view="ground" aria-label="切换到地球地面视角" title="带入地球经纬度观察当地天空、方位、日月轨迹与日食 (快捷键 2)">🌍 地面视角</button>
          <button type="button" class="top-btn" data-view="moon" aria-label="切换到月面视角" title="站在月球表面观察地球地相与地球遮日红环 (快捷键 3)">🌕 月面视角</button>
        </div>

        <div class="btn-group" id="tour-quick-time" role="group" aria-label="快捷时间控制">
          <button type="button" class="top-btn" id="top-now-btn" aria-label="回到当前真实时间" title="同步到当前系统真实时间 (快捷键 N)">⚡ 现在</button>
          <button type="button" class="top-btn" id="top-play-btn" aria-label="播放或暂停时间" title="播放/暂停 (快捷键 空格)">⏸ 暂停</button>
          <select id="top-speed-select" class="top-select" aria-label="时间流逝速度" title="选择时间播放倍速">
            <option value="1">1× 实时</option>
            <option value="60">60× (1分/秒)</option>
            <option value="3600">1小时/秒</option>
            <option value="86400">1天/秒</option>
            <option value="2548800">1月/秒</option>
          </select>
          <button type="button" class="top-btn top-undo-btn" id="top-undo-btn" style="display:none;" aria-label="返回上一次时间或位置" title="撤销最近一次天象或地点跳转 (快捷键 Backspace)">↩ 返回</button>
        </div>

        <div class="btn-group pro-only" id="scale-group" role="group" aria-label="比例模式">
          <button type="button" class="top-btn" data-scale="schematic" title="天体适度放大，方向与本影几何保持100%真实">📐 示意比例</button>
          <button type="button" class="top-btn" data-scale="realistic" title="1:1真实天文半径与距离比例 (地月约60地球半径)">📏 真实比例</button>
          <span class="top-tip-wrap">${termTipHtml('示意比例', '')}</span>
          <button type="button" class="top-btn" id="locate-moon-btn" title="将太空镜头直接聚焦到月球">🎯 定位月球</button>
        </div>

        <div class="btn-group pro-only" id="space-cam-group">
          <select id="space-preset-select" class="top-select" aria-label="太空相机预设视角" title="太空相机预设视角">
            <option value="earth">🎥 聚焦地球</option>
            <option value="moon">🎥 跟随月球</option>
            <option value="sunMoonLine">🌑 日月食连线视角</option>
            <option value="eclipticNorth">🧭 黄道北极俯视</option>
            <option value="sun">☀️ 聚焦太阳</option>
          </select>
        </div>

        <div class="btn-group" id="ground-aim-group" role="radiogroup" aria-label="地面与月面镜头锁定目标" style="display:none;">
          <button type="button" class="top-btn" id="aim-sun-btn" aria-label="锁定对准太阳">🎯 对准太阳</button>
          <button type="button" class="top-btn" id="aim-moon-btn" aria-label="锁定对准月亮">🎯 对准月亮</button>
          <button type="button" class="top-btn" id="aim-earth-btn" aria-label="锁定对准地球" style="display:none;">🎯 对准地球</button>
          <button type="button" class="top-btn" id="aim-free-btn" aria-label="自由拖动视角">🖐 自由视角</button>
          <label class="top-slider-label pro-only" title="放大地面/月面天空中的日月视直径以便清晰观察月相与日食接触">
            放大 <input type="range" id="body-scale-range" min="1" max="8" step="0.5" value="3" />
            <span id="body-scale-val">3×</span>
          </label>
          <label class="top-slider-label pro-only" title="相机视场角 (鼠标滚轮或双指亦可缩放)">
            视场 <input type="range" id="fov-range" min="2" max="100" step="1" value="60" />
            <span id="fov-val">60°</span>
          </label>
        </div>

        <div class="dropdown-wrap pro-only">
          <button type="button" class="top-btn" id="overlay-menu-btn" aria-label="展开辅助图层菜单">✨ 图层 ▾</button>
          <div class="dropdown-menu glass-panel" id="overlay-menu" style="display:none;">
            <label><input type="checkbox" data-ov="constellations" checked /> ✨ 真实星表与星座连线</label>
            <label><input type="checkbox" data-ov="planets" checked /> 🪐 金木水火土五大行星</label>
            <label><input type="checkbox" data-ov="moonOrbit" checked /> 白道 (月球公转轨道)</label>
            <label><input type="checkbox" data-ov="earthOrbit" checked /> 黄道 (地球公转轨道弧)</label>
            <label><input type="checkbox" data-ov="observerMarker" checked /> 地球观测点标记</label>
            <label><input type="checkbox" data-ov="sightLines" checked /> 观测点日月视线箭头</label>
            <label><input type="checkbox" data-ov="eclipsePath" checked /> 日食本影带地表路径</label>
            <label><input type="checkbox" data-ov="shadowCones" /> 日地月本影锥</label>
            <label><input type="checkbox" data-ov="latLonGrid" /> 地球经纬网与回归线</label>
            <label><input type="checkbox" data-ov="eclipticPlane" /> 黄道面参考网格</label>
            <label><input type="checkbox" data-ov="skyTrajectories" checked /> 地面当日日月轨迹线</label>
            <label><input type="checkbox" data-ov="constellationGrid" checked /> 地平高度方位罗盘网</label>
          </div>
        </div>

        <div class="btn-group" id="tour-help-group" role="group" aria-label="模式与帮助">
          <button type="button" class="top-btn" id="ui-mode-btn" aria-label="切换简洁模式与专业模式" title="切换简洁模式与专业模式">🎛 专业模式</button>
          <button type="button" class="top-btn" id="share-url-btn" aria-label="复制当前画面分享链接" title="复制包含当前时间、地点与视角的分享链接">🔗 分享</button>
          <button type="button" class="top-btn accent-help" id="open-help-btn" aria-label="打开使用说明与帮助中心" title="打开使用说明、天文百科与新手引导 (快捷键 ?)">❓ 帮助</button>
          <button type="button" class="top-btn pro-only" id="hide-ui-btn" aria-label="隐藏或显示界面面板" title="隐藏或显示面板 (快捷键 H)">👁</button>
        </div>
      </div>
    `;

    this.el.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const viewMode = btn.dataset.view as ViewMode;
        this.state.update({ viewMode });
      });
    });

    this.el.querySelector('#top-now-btn')?.addEventListener('click', () => {
      if (this.clock) {
        this.clock.resetToNow();
      } else {
        this.state.update({ timeUtc: Date.now(), isRealtimeSync: true, playing: true, speedMultiplier: 1 });
      }
      showToast('已同步到当前系统真实时间');
    });

    this.el.querySelector('#top-play-btn')?.addEventListener('click', () => {
      const s = this.state.get();
      this.state.update({
        playing: !s.playing,
        isRealtimeSync: false,
        eclipseReplay: null,
      });
    });

    const topSpeedSel = this.el.querySelector<HTMLSelectElement>('#top-speed-select')!;
    topSpeedSel.addEventListener('change', () => {
      const mult = parseFloat(topSpeedSel.value);
      this.state.update({
        speedMultiplier: mult,
        playing: true,
        isRealtimeSync: false,
        eclipseReplay: null,
      });
    });

    this.el.querySelector('#top-undo-btn')?.addEventListener('click', () => {
      const snap = this.state.undoLastJump();
      if (snap) {
        showToast(`已恢复至「${snap.label}」之前的状态（${snap.earthObserver.name}）`);
      }
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scaleMode = btn.dataset.scale as ScaleMode;
        this.state.update({ scaleMode });
      });
    });

    this.el.querySelector('#locate-moon-btn')?.addEventListener('click', () => {
      this.state.update({ spaceCameraPreset: 'moon' });
    });

    const presetSel = this.el.querySelector<HTMLSelectElement>('#space-preset-select')!;
    presetSel.addEventListener('change', () => {
      this.state.update({
        spaceCameraPreset: presetSel.value as SpaceCameraPreset,
      });
    });

    this.el.querySelector('#aim-sun-btn')?.addEventListener('click', () => {
      this.renderer.groundView.setLockTarget('sun');
      this.renderer.moonSurfaceView.setLockTarget('sun');
      this.syncActiveButtons();
    });

    this.el.querySelector('#aim-moon-btn')?.addEventListener('click', () => {
      this.renderer.groundView.setLockTarget('moon');
      this.syncActiveButtons();
    });

    this.el.querySelector('#aim-earth-btn')?.addEventListener('click', () => {
      this.renderer.moonSurfaceView.setLockTarget('earth');
      this.syncActiveButtons();
    });

    this.el.querySelector('#aim-free-btn')?.addEventListener('click', () => {
      this.renderer.groundView.setLockTarget('free');
      this.renderer.moonSurfaceView.setLockTarget('free');
      this.syncActiveButtons();
    });

    const bodyScaleRange = this.el.querySelector<HTMLInputElement>('#body-scale-range')!;
    bodyScaleRange.addEventListener('input', () => {
      const val = parseFloat(bodyScaleRange.value);
      this.state.update({ groundBodyScale: val });
    });

    const fovRange = this.el.querySelector<HTMLInputElement>('#fov-range')!;
    fovRange.addEventListener('input', () => {
      const val = parseFloat(fovRange.value);
      this.state.update({ groundFov: val });
    });

    const ovBtn = this.el.querySelector('#overlay-menu-btn')!;
    const ovMenu = this.el.querySelector<HTMLElement>('#overlay-menu')!;
    ovBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ovMenu.style.display = ovMenu.style.display === 'none' ? 'flex' : 'none';
    });
    window.addEventListener('click', () => {
      ovMenu.style.display = 'none';
    });
    ovMenu.addEventListener('click', (e) => e.stopPropagation());

    this.el.querySelectorAll<HTMLInputElement>('[data-ov]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.ov as keyof OverlayFlags;
        this.state.toggleOverlay(key);
      });
    });

    this.el.querySelector('#ui-mode-btn')?.addEventListener('click', () => {
      const next = this.state.get().uiMode === 'simple' ? 'pro' : 'simple';
      this.state.setUiMode(next);
      showToast(
        next === 'pro'
          ? '已开启专业模式：显示全部天文参数、筛选器与图层控件'
          : '已切换为简洁模式：仅保留核心高频控件'
      );
    });

    this.el.querySelector('#share-url-btn')?.addEventListener('click', () => {
      const url = syncBrowserUrlNow(this.state);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(url)
          .then(() => showToast('🔗 已复制当前天象分享链接到剪贴板'))
          .catch(() => showToast(`当前链接：${url}`));
      } else {
        showToast(`当前链接：${url}`);
      }
    });

    this.el.querySelector('#open-help-btn')?.addEventListener('click', () => {
      this.onOpenHelpCallback?.();
    });

    this.el.querySelector('#hide-ui-btn')?.addEventListener('click', () => {
      this.state.update({ uiHidden: !this.state.get().uiHidden });
    });

    this.syncActiveButtons();
  }

  public syncActiveButtons(): void {
    const s = this.state.get();
    const isPro = s.uiMode === 'pro';

    this.el.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === s.viewMode);
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scale === s.scaleMode);
    });

    const playBtn = this.el.querySelector<HTMLButtonElement>('#top-play-btn')!;
    playBtn.textContent = s.playing ? '⏸ 暂停' : '▶ 播放';
    playBtn.classList.toggle('active', !s.playing);

    const topSpeedSel = this.el.querySelector<HTMLSelectElement>('#top-speed-select')!;
    const speedStr = String(s.speedMultiplier);
    if (Array.from(topSpeedSel.options).some((o) => o.value === speedStr)) {
      topSpeedSel.value = speedStr;
    }

    const undoBtn = this.el.querySelector<HTMLButtonElement>('#top-undo-btn')!;
    undoBtn.style.display = this.state.canUndo() ? 'inline-flex' : 'none';

    const uiModeBtn = this.el.querySelector<HTMLButtonElement>('#ui-mode-btn')!;
    uiModeBtn.textContent = isPro ? '🎛 专业模式 (已开)' : '🎛 专业模式';
    uiModeBtn.classList.toggle('active', isPro);

    const spaceGroup = this.el.querySelector<HTMLElement>('#space-cam-group')!;
    const scaleGroup = this.el.querySelector<HTMLElement>('#scale-group')!;
    const groundGroup = this.el.querySelector<HTMLElement>('#ground-aim-group')!;
    const aimSunBtn = this.el.querySelector<HTMLElement>('#aim-sun-btn')!;
    const aimMoonBtn = this.el.querySelector<HTMLElement>('#aim-moon-btn')!;
    const aimEarthBtn = this.el.querySelector<HTMLElement>('#aim-earth-btn')!;
    const aimFreeBtn = this.el.querySelector<HTMLElement>('#aim-free-btn')!;

    if (s.viewMode === 'space') {
      spaceGroup.style.display = isPro ? 'flex' : 'none';
      scaleGroup.style.display = isPro ? 'flex' : 'none';
      groundGroup.style.display = 'none';
    } else if (s.viewMode === 'ground') {
      spaceGroup.style.display = 'none';
      scaleGroup.style.display = 'none';
      groundGroup.style.display = 'flex';
      aimMoonBtn.style.display = 'inline-flex';
      aimEarthBtn.style.display = 'none';
      const lock = this.renderer.groundView.lockTarget;
      aimSunBtn.classList.toggle('active', lock === 'sun');
      aimMoonBtn.classList.toggle('active', lock === 'moon');
      aimFreeBtn.classList.toggle('active', lock === 'free');
    } else {
      spaceGroup.style.display = 'none';
      scaleGroup.style.display = 'none';
      groundGroup.style.display = 'flex';
      aimMoonBtn.style.display = 'none';
      aimEarthBtn.style.display = 'inline-flex';
      const lock = this.renderer.moonSurfaceView.lockTarget;
      aimSunBtn.classList.toggle('active', lock === 'sun');
      aimEarthBtn.classList.toggle('active', lock === 'earth');
      aimFreeBtn.classList.toggle('active', lock === 'free');
    }

    const presetSel = this.el.querySelector<HTMLSelectElement>('#space-preset-select')!;
    if (presetSel.value !== s.spaceCameraPreset) {
      presetSel.value = s.spaceCameraPreset;
    }

    const bodyScaleRange = this.el.querySelector<HTMLInputElement>('#body-scale-range')!;
    const bodyScaleVal = this.el.querySelector<HTMLElement>('#body-scale-val')!;
    bodyScaleRange.value = String(s.groundBodyScale);
    bodyScaleVal.textContent = `${s.groundBodyScale}×`;

    const fovRange = this.el.querySelector<HTMLInputElement>('#fov-range')!;
    const fovVal = this.el.querySelector<HTMLElement>('#fov-val')!;
    fovRange.value = String(Math.round(s.groundFov));
    fovVal.textContent = `${Math.round(s.groundFov)}°`;
  }
}

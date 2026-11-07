import './ui/styles.css';
import {
  AppState,
  parseUrlInitialState,
  shouldExposeDebugHandle,
  syncBrowserUrlNow,
} from './state/AppState';
import { FrameRunner, SimulationClock } from './time/Clock';
import { MasterRenderer } from './render/Renderer';
import { TopBar } from './ui/TopBar';
import { TimePanel } from './ui/TimePanel';
import { LocationPanel } from './ui/LocationPanel';
import { LunarPanel } from './ui/LunarPanel';
import { EclipsePanel } from './ui/EclipsePanel';
import { InfoHUD } from './ui/InfoHUD';
import { DockLayout } from './ui/Dock';
import { TimelineBar } from './ui/Timeline';
import { WelcomeModal } from './ui/Welcome';
import { GuidedTour } from './ui/Tour';
import { HelpCenter } from './ui/HelpCenter';
import { initGlobalTermTooltips, registerTooltipHelpHandler } from './ui/tooltips';
import { showToast } from './ui/Toast';
import { CURATED_ECLIPSE_CATALOG } from './astro/eclipses/catalog';
import { searchEclipsesInYear } from './astro/eclipses/search';

function setupDebouncedUrlSync(state: AppState): void {
  let timer: number | null = null;
  const syncNow = () => {
    timer = null;
    syncBrowserUrlNow(state);
  };

  state.subscribe((_, changed) => {
    if (
      changed.has('earthObserver') ||
      changed.has('moonObserver') ||
      changed.has('viewMode') ||
      changed.has('scaleMode') ||
      changed.has('selectedEclipseId') ||
      (!state.get().isRealtimeSync && changed.has('timeUtc'))
    ) {
      if (timer === null) {
        timer = window.setTimeout(syncNow, 400);
      }
    }
  });
}

function bootstrap(): void {
  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;

  const state = new AppState();
  const clock = new SimulationClock(state);

  state.onTimeBoundaryReached((bound) => {
    const label = bound === 'min' ? '下限（天文年 -1999 年）' : '上限（公元 3000 年）';
    showToast({
      message: `⚠️ 已到达历表支持时间${label}，已自动暂停加速推进`,
      type: 'warn',
      durationMs: 6000,
      actionLabel: '⚡ 回到现在',
      onAction: () => {
        clock.resetToNow();
        showToast('已同步至当前真实时间');
      },
    });
  });

  const urlOpts = parseUrlInitialState(state);

  // Sync UI mode class on body
  const applyUiModeClass = () => {
    const mode = state.get().uiMode;
    document.body.classList.toggle('ui-mode-simple', mode === 'simple');
    document.body.classList.toggle('ui-mode-pro', mode === 'pro');
  };
  applyUiModeClass();

  // Texture loading progress badge
  const texBadge = document.createElement('div');
  texBadge.className = 'ms-tex-loading-badge';
  texBadge.textContent = '🪐 正在加载星图贴图...';
  document.body.appendChild(texBadge);

  const renderer = new MasterRenderer(canvas, state, (loaded, total) => {
    texBadge.textContent = `🪐 正在加载星图贴图 (${loaded}/${total})...`;
    if (loaded >= total) {
      texBadge.classList.add('done');
      window.setTimeout(() => texBadge.remove(), 800);
    }
  });

  const timePanel = new TimePanel(state, clock);
  const lunarPanel = new LunarPanel(state);
  const locationPanel = new LocationPanel(state);
  const eclipsePanel = new EclipsePanel(state, renderer);

  const dock = new DockLayout({
    time: timePanel.el,
    lunar: lunarPanel.el,
    location: locationPanel.el,
    eclipse: eclipsePanel.el,
  });
  eclipsePanel.onEventSelected(() => {
    dock.setMobileSheetState('collapsed');
  });

  const timeline = new TimelineBar(state);
  const infoHud = new InfoHUD(state);

  const welcomeModal = new WelcomeModal(state, renderer, eclipsePanel);
  const tour = new GuidedTour(dock);
  const helpCenter = new HelpCenter(welcomeModal, tour);

  welcomeModal.onStartTour(() => tour.start());

  const topBar = new TopBar(state, renderer, clock);
  topBar.onOpenHelp(() => helpCenter.toggle());

  // Bottom stack: timeline + compact HUD; center stage holds floating eclipse detail card
  const bottomStack = document.createElement('div');
  bottomStack.className = 'ms-bottom-stack';
  bottomStack.append(timeline.el, infoHud.el);

  const centerStage = document.createElement('div');
  centerStage.className = 'ms-center-stage';
  centerStage.append(eclipsePanel.floatingCardEl);

  uiRoot.append(
    topBar.el,
    dock.leftContainer,
    centerStage,
    dock.rightContainer,
    bottomStack,
    dock.mobileSheet
  );

  initGlobalTermTooltips();
  registerTooltipHelpHandler((secId) => helpCenter.open(secId));

  setupDebouncedUrlSync(state);

  // Handle initial URL options
  if (urlOpts.initialEclipseId) {
    let item = CURATED_ECLIPSE_CATALOG.find((x) => x.id === urlOpts.initialEclipseId);
    if (!item) {
      const m = urlOpts.initialEclipseId.match(/^(?:solar|lunar)-(-?\d{4})-\d{2}-\d{2}$/);
      if (m) {
        const y = parseInt(m[1], 10);
        if (y >= -1999 && y <= 3000) {
          item = searchEclipsesInYear(y).find((x) => x.id === urlOpts.initialEclipseId);
        }
      }
    }
    if (item) {
      welcomeModal.close();
      eclipsePanel.restoreEclipseFromUrl(item, {
        hasTime: urlOpts.hasTime,
        hasLocation: urlOpts.hasLocation,
        hasMoonLocation: urlOpts.hasMoonLocation,
        hasView: urlOpts.hasView,
      });
    }
  }
  if (state.get().viewMode === 'space' && urlOpts.hasLocation) {
    const obs = state.get().earthObserver;
    renderer.spaceView.focusOnEarthLatLon(obs.lat, obs.lon, 2.8);
  }
  if (urlOpts.openHelp) {
    welcomeModal.close();
    helpCenter.open();
  } else if (urlOpts.openTour) {
    welcomeModal.close();
    tour.start();
  }

  let lastUiRefresh = -Infinity;

  state.subscribe((s, changed) => {
    if (changed.has('uiHidden')) {
      uiRoot.classList.toggle('ui-hidden', s.uiHidden);
      if (!s.uiHidden) {
        lastUiRefresh = -Infinity;
      }
    }
    if (changed.has('uiMode')) {
      applyUiModeClass();
    }
  });

  // Global keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLSelectElement ||
      document.activeElement instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      const s = state.get();
      state.update({ playing: !s.playing, isRealtimeSync: false });
    } else if (e.key === 'h' || e.key === 'H') {
      state.update({ uiHidden: !state.get().uiHidden });
    } else if (e.key === 'n' || e.key === 'N') {
      clock.resetToNow();
      showToast('已同步至当前真实时间');
    } else if (e.key === '1') {
      state.update({ viewMode: 'space' });
    } else if (e.key === '2') {
      state.update({ viewMode: 'ground' });
    } else if (e.key === '3') {
      state.update({ viewMode: 'moon' });
    } else if (e.key === 'ArrowRight') {
      clock.stepByMs(e.shiftKey ? 86400000 : 60000);
    } else if (e.key === 'ArrowLeft') {
      clock.stepByMs(e.shiftKey ? -86400000 : -60000);
    } else if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
      e.preventDefault();
      helpCenter.toggle();
    } else if (e.key === 'Backspace') {
      if (state.canUndo()) {
        e.preventDefault();
        const snap = state.undoLastJump();
        if (snap) {
          showToast(`已恢复至「${snap.label}」之前的状态（${snap.earthObserver.name}）`);
        }
      }
    }
  });

  const frameRunner = new FrameRunner(
    state,
    clock,
    (now) => {
      const shouldRefreshUi = !state.get().uiHidden && now - lastUiRefresh > 80;
      const frameData = renderer.renderFrame(shouldRefreshUi);

      // Throttle DOM updates to ~12 Hz for silky 60fps 3D rendering
      if (shouldRefreshUi) {
        timePanel.refreshDisplay();
        lunarPanel.refreshDisplay(frameData);
        infoHud.refreshDisplay(frameData);
        timeline.refreshDisplay();
        eclipsePanel.refreshReplayProgress();
        lastUiRefresh = now;
      }
    },
    (_err, recoverToNow) => {
      lastUiRefresh = -Infinity;
      timePanel.refreshDisplay();
      showToast({
        message: '⚠️ 模拟计算遇到异常，已自动暂停并保留最后有效画面',
        type: 'warn',
        durationMs: 8000,
        actionLabel: '⚡ 回到现在',
        onAction: () => {
          lastUiRefresh = -Infinity;
          recoverToNow();
          timePanel.refreshDisplay();
          showToast('已恢复并同步至当前真实时间');
        },
      });
    }
  );

  // Expose diagnostic handle only in development or when explicitly enabled via ?debug=1 / ?audit=1
  if (shouldExposeDebugHandle(window.location.search, import.meta.env.DEV)) {
    (window as any).__MOONSUN__ = {
      state,
      clock,
      frameRunner,
      renderer,
      dock,
      eclipsePanel,
      timeline,
      welcomeModal,
      tour,
      helpCenter,
    };
  }

  function animate(now: number): void {
    requestAnimationFrame(animate);
    frameRunner.runFrame(now);
  }

  requestAnimationFrame(animate);
}

bootstrap();


import { getCuratedCatalogStats } from '../astro/eclipses/catalog';
import { DockLayout, DockPanelId } from './Dock';

interface TourStep {
  title: string;
  desc: string;
  targetSelector: string;
  mobileTargetSelector?: string;
  openDock?: DockPanelId | null;
}

const TOUR_CATALOG_TOTAL = getCuratedCatalogStats().total;

const TOUR_STEPS: ReadonlyArray<TourStep> = [
  {
    title: '第 1/6 步：三种 3D 观察视角',
    desc: '在这里一键切换「太空视角」（俯瞰日地月轨道与地球上的月影黑斑）、「地面视角」（带入任意城市看当地天空日食与星空）和「月面视角」（站在月球表面看地球地相与红环）。',
    targetSelector: '#tour-view-group',
    openDock: null,
  },
  {
    title: '第 2/6 步：时间控制与底部时间轴',
    desc: '顶栏可随时「暂停/播放」、调整倍速或「回到现在」；画面底部的时间轴标出了朔、望、节气和日月食刻度，左右拖动即可像拉视频进度条一样连续改变时间。',
    targetSelector: '#tour-timeline',
    openDock: null,
  },
  {
    title: '第 3/6 步：选择地球与月面观测点',
    desc: '点击右侧「📍 地点」图标可搜索中国及全球城市、粘贴经纬度或使用浏览器定位。在太空视角下单击 3D 地球也会弹出选点菜单。',
    targetSelector: '.ms-dock-right [data-panel="location"]',
    mobileTargetSelector: '[data-mpanel="location"]',
    openDock: 'location',
  },
  {
    title: `第 4/6 步：${TOUR_CATALOG_TOTAL} 场精选日月食百科与智能回放`,
    desc: `点击右侧「🌑 天象」打开 ${TOUR_CATALOG_TOTAL} 场精选日月食（中国可见优先排序）。点选任一事件会弹出浮动详情卡片，支持点击「初亏/食既/食甚/生光/复圆」任意时刻或一键 60 秒全过程智能慢放！`,
    targetSelector: '.ms-dock-right [data-panel="eclipse"]',
    mobileTargetSelector: '[data-mpanel="eclipse"]',
    openDock: 'eclipse',
  },
  {
    title: '第 5/6 步：中国传统农历与月相盈亏',
    desc: '点击左侧「🏮 农历」查看实时干支八字、二十四节气、月相盘，以及为什么会有“十五的月亮十六圆”（朔望月精确力学时刻）。',
    targetSelector: '.ms-dock-left [data-panel="lunar"]',
    mobileTargetSelector: '[data-mpanel="lunar"]',
    openDock: 'lunar',
  },
  {
    title: '第 6/6 步：简洁/专业模式与帮助中心',
    desc: '默认「简洁模式」让画面清爽易用；需要完整天文控件（公元前年份、星座连线、本影锥、真实比例等）可点击「🎛 专业模式」。随时按 ? 键或点击「❓ 帮助」可查阅完整说明手册！',
    targetSelector: '#tour-help-group',
    openDock: null,
  },
];

export class GuidedTour {
  private overlayEl: HTMLElement;
  private spotlightEl: HTMLElement;
  private popoverEl: HTMLElement;
  private currentStep = -1;

  constructor(private dock: DockLayout) {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'ms-tour-overlay';
    this.overlayEl.style.display = 'none';

    this.spotlightEl = document.createElement('div');
    this.spotlightEl.className = 'ms-tour-spotlight';

    this.popoverEl = document.createElement('div');
    this.popoverEl.className = 'ms-tour-popover glass-panel';

    this.overlayEl.append(this.spotlightEl, this.popoverEl);
    document.body.appendChild(this.overlayEl);

    window.addEventListener('resize', () => {
      if (this.currentStep >= 0) {
        this.positionCurrentStep();
      }
    });
  }

  public start(): void {
    this.currentStep = 0;
    this.overlayEl.style.display = 'block';
    this.renderStep();
  }

  public stop(): void {
    this.currentStep = -1;
    this.overlayEl.style.display = 'none';
    this.dock.closeAllPanels();
  }

  private renderStep(): void {
    if (this.currentStep < 0 || this.currentStep >= TOUR_STEPS.length) {
      this.stop();
      return;
    }

    const step = TOUR_STEPS[this.currentStep];
    if (step.openDock) {
      this.dock.openPanel(step.openDock);
    } else {
      this.dock.closeAllPanels();
    }

    const dotsHtml = TOUR_STEPS.map(
      (_, i) => `<span class="ms-tour-dot ${i === this.currentStep ? 'active' : ''}"></span>`
    ).join('');

    this.popoverEl.innerHTML = `
      <div class="ms-tour-head">
        <strong>${step.title}</strong>
        <button type="button" class="ms-card-close" id="tour-skip-x" aria-label="退出引导">×</button>
      </div>
      <p class="ms-tour-desc">${step.desc}</p>
      <div class="ms-tour-foot">
        <div class="ms-tour-dots">${dotsHtml}</div>
        <div class="ms-tour-btns">
          ${this.currentStep > 0 ? `<button type="button" class="btn-secondary" id="tour-prev">上一步</button>` : ''}
          <button type="button" class="btn-secondary" id="tour-skip">跳过</button>
          <button type="button" class="btn-primary" id="tour-next">
            ${this.currentStep === TOUR_STEPS.length - 1 ? '完成体验 🎉' : '下一步 →'}
          </button>
        </div>
      </div>
    `;

    this.popoverEl.querySelector('#tour-prev')?.addEventListener('click', () => {
      this.currentStep--;
      this.renderStep();
    });
    this.popoverEl.querySelector('#tour-skip')?.addEventListener('click', () => this.stop());
    this.popoverEl.querySelector('#tour-skip-x')?.addEventListener('click', () => this.stop());
    this.popoverEl.querySelector('#tour-next')?.addEventListener('click', () => {
      if (this.currentStep + 1 >= TOUR_STEPS.length) {
        this.stop();
      } else {
        this.currentStep++;
        this.renderStep();
      }
    });

    requestAnimationFrame(() => this.positionCurrentStep());
  }

  private positionCurrentStep(): void {
    if (this.currentStep < 0 || this.currentStep >= TOUR_STEPS.length) return;
    const step = TOUR_STEPS[this.currentStep];
    const isMobile = window.innerWidth < 760;
    const sel = isMobile && step.mobileTargetSelector ? step.mobileTargetSelector : step.targetSelector;
    const target = document.querySelector<HTMLElement>(sel);

    if (!target) {
      this.spotlightEl.style.display = 'none';
      this.popoverEl.style.left = '50%';
      this.popoverEl.style.top = '50%';
      this.popoverEl.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const r = target.getBoundingClientRect();
    const pad = 6;
    this.spotlightEl.style.display = 'block';
    this.spotlightEl.style.left = `${Math.max(2, r.left - pad)}px`;
    this.spotlightEl.style.top = `${Math.max(2, r.top - pad)}px`;
    this.spotlightEl.style.width = `${Math.min(window.innerWidth - 4, r.width + pad * 2)}px`;
    this.spotlightEl.style.height = `${Math.min(window.innerHeight - 4, r.height + pad * 2)}px`;

    this.popoverEl.style.transform = 'none';
    if (isMobile) {
      this.popoverEl.style.left = '12px';
      this.popoverEl.style.right = '12px';
      this.popoverEl.style.width = 'auto';
      if (r.top > window.innerHeight * 0.5) {
        this.popoverEl.style.top = `${Math.max(64, r.top - 210)}px`;
      } else {
        this.popoverEl.style.top = `${Math.min(window.innerHeight - 220, r.bottom + 14)}px`;
      }
      return;
    }

    const popW = 360;
    const popH = 195;
    let left = r.left;
    let top = r.bottom + 14;

    if (r.top > window.innerHeight * 0.65) {
      top = Math.max(60, r.top - popH - 14);
    }
    if (r.left > window.innerWidth * 0.6) {
      left = r.right - popW;
    }
    left = Math.max(16, Math.min(window.innerWidth - popW - 16, left));
    top = Math.max(58, Math.min(window.innerHeight - popH - 16, top));

    this.popoverEl.style.width = `${popW}px`;
    this.popoverEl.style.left = `${left}px`;
    this.popoverEl.style.top = `${top}px`;
  }
}

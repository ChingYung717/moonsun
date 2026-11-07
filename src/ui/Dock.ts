export type DockPanelId = 'time' | 'lunar' | 'eclipse' | 'location';

export interface DockPanels {
  time: HTMLElement;
  lunar: HTMLElement;
  eclipse: HTMLElement;
  location: HTMLElement;
}

export class DockLayout {
  public readonly leftContainer: HTMLElement;
  public readonly rightContainer: HTMLElement;
  public readonly mobileSheet: HTMLElement;

  private leftActive: 'time' | 'lunar' | null = null;
  private rightActive: 'eclipse' | 'location' | null = null;
  private mobileActive: DockPanelId = 'eclipse';
  private mobileSheetState: 'collapsed' | 'half' | 'full' = 'collapsed';
  private isMobile = false;

  private leftDrawerBody: HTMLElement;
  private rightDrawerBody: HTMLElement;
  private mobileSheetBody: HTMLElement;

  constructor(private panels: DockPanels) {
    this.leftContainer = document.createElement('aside');
    this.leftContainer.className = 'ms-dock ms-dock-left';

    this.rightContainer = document.createElement('aside');
    this.rightContainer.className = 'ms-dock ms-dock-right';

    this.mobileSheet = document.createElement('aside');
    this.mobileSheet.className = 'ms-mobile-sheet state-collapsed';

    this.leftDrawerBody = document.createElement('div');
    this.leftDrawerBody.className = 'ms-drawer-body';

    this.rightDrawerBody = document.createElement('div');
    this.rightDrawerBody.className = 'ms-drawer-body';

    this.mobileSheetBody = document.createElement('div');
    this.mobileSheetBody.className = 'ms-mobile-sheet-body';

    // Default open state based on viewport width (B1)
    if (window.innerWidth >= 1600) {
      this.leftActive = 'time';
    }

    this.buildDesktopDocks();
    this.buildMobileSheet();
    this.syncResponsivePlacement();

    window.addEventListener('resize', () => {
      this.syncResponsivePlacement();
    });
  }

  private buildDesktopDocks(): void {
    this.leftContainer.innerHTML = `
      <nav class="ms-rail" aria-label="左侧功能栏">
        <button type="button" class="ms-rail-btn" data-panel="time" aria-label="时间控制面板" title="时间与速率控制">
          <span class="ms-rail-icon">⏱</span>
          <span class="ms-rail-text">时间</span>
        </button>
        <button type="button" class="ms-rail-btn" data-panel="lunar" aria-label="中国农历与月相面板" title="中国传统农历与月相">
          <span class="ms-rail-icon">🏮</span>
          <span class="ms-rail-text">农历</span>
        </button>
      </nav>
    `;
    this.leftContainer.appendChild(this.leftDrawerBody);

    this.rightContainer.innerHTML = `
      <div class="ms-drawer-right-slot"></div>
      <nav class="ms-rail" aria-label="右侧功能栏">
        <button type="button" class="ms-rail-btn" data-panel="eclipse" aria-label="日月食天象百科面板" title="日月食天象百科与回放">
          <span class="ms-rail-icon">🌑</span>
          <span class="ms-rail-text">天象</span>
        </button>
        <button type="button" class="ms-rail-btn" data-panel="location" aria-label="观测地点面板" title="地球与月面观测点定位">
          <span class="ms-rail-icon">📍</span>
          <span class="ms-rail-text">地点</span>
        </button>
      </nav>
    `;
    this.rightContainer.querySelector('.ms-drawer-right-slot')!.replaceWith(this.rightDrawerBody);

    this.leftContainer.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.panel as 'time' | 'lunar';
        this.leftActive = this.leftActive === id ? null : id;
        if (this.leftActive && window.innerWidth < 1600) {
          this.rightActive = null;
        }
        this.syncDesktopDrawers();
      });
    });

    this.rightContainer.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.panel as 'eclipse' | 'location';
        this.rightActive = this.rightActive === id ? null : id;
        if (this.rightActive && window.innerWidth < 1600) {
          this.leftActive = null;
        }
        this.syncDesktopDrawers();
      });
    });
  }

  private buildMobileSheet(): void {
    this.mobileSheet.innerHTML = `
      <div class="ms-sheet-handle-bar" id="ms-sheet-handle" role="button" tabindex="0" aria-label="展开或收起底部抽屉">
        <div class="ms-sheet-pill"></div>
        <div class="ms-sheet-hint" id="ms-sheet-hint">点击下方标签或上拉展开控制面板</div>
      </div>
      <nav class="ms-sheet-tabs" aria-label="底部功能切换">
        <button type="button" class="ms-sheet-tab" data-mpanel="eclipse">🌑 精彩天象</button>
        <button type="button" class="ms-sheet-tab" data-mpanel="time">⏱ 时间控制</button>
        <button type="button" class="ms-sheet-tab" data-mpanel="location">📍 观测地点</button>
        <button type="button" class="ms-sheet-tab" data-mpanel="lunar">🏮 中国农历</button>
      </nav>
    `;
    this.mobileSheet.appendChild(this.mobileSheetBody);

    const handle = this.mobileSheet.querySelector('#ms-sheet-handle') as HTMLElement;
    let dragStartY = 0;
    let dragging = false;

    handle.addEventListener('click', () => {
      if (this.mobileSheetState === 'collapsed') {
        this.setMobileSheetState('half');
      } else if (this.mobileSheetState === 'half') {
        this.setMobileSheetState('full');
      } else {
        this.setMobileSheetState('collapsed');
      }
    });

    handle.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          dragging = true;
          dragStartY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );

    handle.addEventListener(
      'touchend',
      (e) => {
        if (!dragging) return;
        dragging = false;
        const endY = e.changedTouches[0]?.clientY ?? dragStartY;
        const dy = endY - dragStartY;
        if (dy < -30) {
          this.setMobileSheetState(this.mobileSheetState === 'collapsed' ? 'half' : 'full');
        } else if (dy > 30) {
          this.setMobileSheetState(this.mobileSheetState === 'full' ? 'half' : 'collapsed');
        }
      },
      { passive: true }
    );

    this.mobileSheet.querySelectorAll<HTMLButtonElement>('[data-mpanel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.mpanel as DockPanelId;
        if (this.mobileActive === p && this.mobileSheetState !== 'collapsed') {
          this.setMobileSheetState('collapsed');
        } else {
          this.mobileActive = p;
          if (this.mobileSheetState === 'collapsed') {
            this.setMobileSheetState('half');
          }
          this.syncMobileSheet();
        }
      });
    });
  }

  public setMobileSheetState(state: 'collapsed' | 'half' | 'full'): void {
    this.mobileSheetState = state;
    this.mobileSheet.classList.remove('state-collapsed', 'state-half', 'state-full');
    this.mobileSheet.classList.add(`state-${state}`);
    this.syncMobileSheet();
  }

  public openPanel(id: DockPanelId): void {
    if (this.isMobile) {
      this.mobileActive = id;
      if (this.mobileSheetState === 'collapsed') {
        this.setMobileSheetState('half');
      } else {
        this.syncMobileSheet();
      }
    } else {
      if (id === 'time' || id === 'lunar') {
        this.leftActive = id;
        if (window.innerWidth < 1600) {
          this.rightActive = null;
        }
      } else {
        this.rightActive = id;
        if (window.innerWidth < 1600) {
          this.leftActive = null;
        }
      }
      this.syncDesktopDrawers();
    }
  }

  public closeAllPanels(): void {
    this.leftActive = null;
    this.rightActive = null;
    this.setMobileSheetState('collapsed');
    this.syncDesktopDrawers();
  }

  private syncResponsivePlacement(): void {
    const nextMobile = window.innerWidth < 760;
    this.isMobile = nextMobile;
    if (nextMobile) {
      this.leftContainer.style.display = 'none';
      this.rightContainer.style.display = 'none';
      this.mobileSheet.style.display = 'flex';
      this.mobileSheetBody.append(
        this.panels.eclipse,
        this.panels.time,
        this.panels.location,
        this.panels.lunar
      );
      this.syncMobileSheet();
    } else {
      this.leftContainer.style.display = 'flex';
      this.rightContainer.style.display = 'flex';
      this.mobileSheet.style.display = 'none';
      this.leftDrawerBody.append(this.panels.time, this.panels.lunar);
      this.rightDrawerBody.append(this.panels.eclipse, this.panels.location);
      this.syncDesktopDrawers();
    }
  }

  private syncDesktopDrawers(): void {
    if (this.isMobile) return;

    this.leftDrawerBody.classList.toggle('open', this.leftActive !== null);
    this.panels.time.style.display = this.leftActive === 'time' ? 'flex' : 'none';
    this.panels.lunar.style.display = this.leftActive === 'lunar' ? 'flex' : 'none';

    this.rightDrawerBody.classList.toggle('open', this.rightActive !== null);
    this.panels.eclipse.style.display = this.rightActive === 'eclipse' ? 'flex' : 'none';
    this.panels.location.style.display = this.rightActive === 'location' ? 'flex' : 'none';

    this.leftContainer.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.panel === this.leftActive);
    });
    this.rightContainer.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.panel === this.rightActive);
    });
  }

  private syncMobileSheet(): void {
    if (!this.isMobile) return;
    const isCollapsed = this.mobileSheetState === 'collapsed';
    this.mobileSheetBody.style.display = isCollapsed ? 'none' : 'block';

    const ids: DockPanelId[] = ['eclipse', 'time', 'location', 'lunar'];
    for (const id of ids) {
      this.panels[id].style.display = !isCollapsed && this.mobileActive === id ? 'flex' : 'none';
    }

    this.mobileSheet.querySelectorAll<HTMLButtonElement>('[data-mpanel]').forEach((btn) => {
      btn.classList.toggle(
        'active',
        !isCollapsed && btn.dataset.mpanel === this.mobileActive
      );
    });
  }
}

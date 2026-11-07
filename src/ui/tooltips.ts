export interface TermDefinition {
  term: string;
  short: string;
  sectionId: string;
}

export const ASTRONOMY_TERMS: Record<string, TermDefinition> = {
  示意比例: {
    term: '示意比例与真实比例',
    short: '示意比例将日、地、月半径适度放大以便同屏看清自转与本影锥，但天体方向、月相和地球本影位置 100% 采用真实历算几何；真实比例严格按 1:1 物理半径与地月距离（约 60 地球半径）绘制。',
    sectionId: 'help-glossary',
  },
  本影食分: {
    term: '本影食分',
    short: '月食期间，月球视直径深入地球本影圆面的最大比例。本影食分 ≥ 1.0 即为月全食（红月亮），0 < 本影食分 < 1.0 为月偏食。',
    sectionId: 'help-glossary',
  },
  半影食分: {
    term: '半影食分',
    short: '月球进入地球半影区的程度。若月球只进半影未触及本影，称为半影月食，肉眼仅觉月面一侧略微变暗。',
    sectionId: 'help-glossary',
  },
  线性食分: {
    term: '日食线性食分',
    short: '日食时月球遮挡太阳视直径的比例（被遮直径 ÷ 太阳视直径）。日全食食分 ≥ 1.0，日环食食分略小于 1.0（如 0.99）。',
    sectionId: 'help-glossary',
  },
  遮挡面积比: {
    term: '太阳被遮挡面积比',
    short: '太阳圆面面积被月球遮盖的百分比。注意食分是直径比，面积比在偏食阶段通常略小于线性食分。',
    sectionId: 'help-glossary',
  },
  地相: {
    term: '地相（月面看地球）',
    short: '站在月球表面看到的地球盈亏相位。地相与地球上看到的月相严格互补：地球上是朔（新月）时，月球上看地球是“满地”；地球上月全食时，月球上看是“地球遮住太阳的日全食”。',
    sectionId: 'help-glossary',
  },
  月龄: {
    term: '月龄',
    short: '自最近一次“朔”（新月合朔精确时刻）以来经过的天数。一个平均朔望月约 29.53 天，满月（望）平均出现在月龄 14.8 天左右。',
    sectionId: 'help-glossary',
  },
  黄经差: {
    term: '日月地心视黄经差',
    short: '月球与太阳在黄道上的角度差（0°～360°）。0° 为朔（新月），90° 为上弦，180° 为望（满月），270° 为下弦。',
    sectionId: 'help-glossary',
  },
  ΔT: {
    term: 'ΔT（地球自转钟差修正）',
    short: '地球均匀力学时（TT）与地球自转世界时（UT1）之差。受潮汐摩擦影响，地球自转长期变慢，几千年前的日全食带位置因 ΔT 不确定会有数十至数百公里偏移。',
    sectionId: 'help-accuracy',
  },
  沙罗序列: {
    term: '沙罗周期与沙罗序列',
    short: '223 个朔望月（约 18 年 11 天 8 小时）后，日、地、月几何关系高度重演，形态极相似的一组日月食归为同一沙罗序列（如 1991、2009、2027 同属第 136 沙罗序列）。',
    sectionId: 'help-glossary',
  },
};

export function termTipHtml(key: keyof typeof ASTRONOMY_TERMS, labelOverride?: string): string {
  const def = ASTRONOMY_TERMS[key];
  if (!def) return labelOverride ?? key;
  const label = labelOverride ?? key;
  return `${label}<button type="button" class="ms-term-tip" data-term="${key}" aria-label="查看术语说明：${def.term}">ⓘ</button>`;
}

let activePopover: HTMLElement | null = null;
let openHelpCallback: ((sectionId?: string) => void) | null = null;

export function registerTooltipHelpHandler(cb: (sectionId?: string) => void): void {
  openHelpCallback = cb;
}

export function initGlobalTermTooltips(): void {
  const closePopover = () => {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
  };

  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest?.('.ms-term-tip') as HTMLElement | null;
    if (target) {
      e.stopPropagation();
      const key = target.dataset.term || '';
      const def = ASTRONOMY_TERMS[key];
      if (!def) return;
      closePopover();

      const pop = document.createElement('div');
      pop.className = 'ms-term-popover glass-panel';
      pop.innerHTML = `
        <div class="ms-term-pop-title">📘 ${def.term}</div>
        <p class="ms-term-pop-desc">${def.short}</p>
        <div class="ms-term-pop-foot">
          <button type="button" class="btn-chip accent" data-open-help="${def.sectionId}">在帮助中心查看详情 →</button>
        </div>
      `;
      document.body.appendChild(pop);

      const rect = target.getBoundingClientRect();
      const left = Math.min(window.innerWidth - 310, Math.max(12, rect.left - 120));
      const top =
        rect.bottom + 160 > window.innerHeight ? Math.max(12, rect.top - 150) : rect.bottom + 8;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;

      pop.querySelector('[data-open-help]')?.addEventListener('click', () => {
        closePopover();
        openHelpCallback?.(def.sectionId);
      });

      activePopover = pop;
      return;
    }

    if (activePopover && !activePopover.contains(e.target as Node)) {
      closePopover();
    }
  });
}

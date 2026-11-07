import { getCuratedCatalogStats } from '../astro/eclipses/catalog';
import { WelcomeModal } from './Welcome';
import { GuidedTour } from './Tour';

export class HelpCenter {
  public readonly el: HTMLElement;

  constructor(
    private welcome: WelcomeModal,
    private tour: GuidedTour
  ) {
    this.el = document.createElement('aside');
    this.el.className = 'ms-help-drawer glass-panel';
    this.el.style.display = 'none';
    this.render();
    document.body.appendChild(this.el);
  }

  public open(sectionId?: string): void {
    this.el.style.display = 'flex';
    if (sectionId) {
      const sec = this.el.querySelector<HTMLElement>(`#${sectionId}`);
      sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  public close(): void {
    this.el.style.display = 'none';
  }

  public toggle(): void {
    if (this.el.style.display === 'none') {
      this.open();
    } else {
      this.close();
    }
  }

  private render(): void {
    const stats = getCuratedCatalogStats();
    this.el.innerHTML = `
      <div class="ms-help-head">
        <div>
          <h2>📘 使用说明与天文百科帮助中心</h2>
          <span class="ms-help-sub">随时按 <code>?</code> 键打开或关闭 · 完整手册同步见 <a href="https://github.com/ChingYung717/moonsun/blob/main/docs/%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E.md" target="_blank" rel="noopener noreferrer" style="color: var(--accent-blue); text-decoration: underline;">docs/使用说明.md ↗</a></span>
        </div>
        <button type="button" class="ms-card-close" id="help-close-btn" aria-label="关闭帮助中心">×</button>
      </div>

      <div class="ms-help-toolbar">
        <input type="search" id="help-search-input" class="input-control" placeholder="搜索功能、术语或问题 (如: 示意比例、食分、本影、地相、ΔT、儒略历、看不到月亮)..." />
        <nav class="ms-help-toc" aria-label="帮助目录">
          <button type="button" class="btn-chip" data-jump="help-quickstart">🚀 快速上手</button>
          <button type="button" class="btn-chip" data-jump="help-features">🎛 功能详解</button>
          <button type="button" class="btn-chip" data-jump="help-glossary">🌌 天文术语</button>
          <button type="button" class="btn-chip" data-jump="help-accuracy">📐 历算精度</button>
          <button type="button" class="btn-chip" data-jump="help-shortcuts">⌨️ 快捷键</button>
          <button type="button" class="btn-chip" data-jump="help-faq">❓ 常见问题</button>
        </nav>
      </div>

      <div class="ms-help-body" id="help-content-body">
        <section class="help-sec" id="help-quickstart">
          <h3>🚀 一、快速上手与一键体验场景</h3>
          <p>第一次打开觉得按钮多？本系统提供<strong>「简洁模式」</strong>（默认开启，主画面常驻仅保留 18 个高频交互控件）与<strong>「专业模式」</strong>（顶栏右侧点击「🎛 专业模式」开启全部高级历算与图层控件）。您也可以直接点击下方按钮立即体验：</p>
          <div class="help-action-row">
            <button type="button" class="btn-chip accent" data-sc="nowSky">🌤 1. 看看此刻的天空</button>
            <button type="button" class="btn-chip accent" data-sc="eclipse2009">🌑 2. 重温 2009 长江日全食</button>
            <button type="button" class="btn-chip accent" data-sc="moonEclipse2018">🌕 3. 站在月球上看月全食</button>
            <button type="button" class="btn-chip" id="help-restart-tour">🧭 重新开启 6 步交互引导</button>
            <button type="button" class="btn-chip" id="help-reopen-welcome">🪟 打开欢迎卡片</button>
          </div>
        </section>

        <section class="help-sec" id="help-features">
          <h3>🎛 二、界面与核心功能详解</h3>
          <ul>
            <li><strong>三种观察视角（顶栏左侧）</strong>：
              <br>• <b>🌌 太空视角</b>：自由旋转缩放观察太阳、地球、月球与真实 J2000 星空。日食期间可直接在地球白昼面看到中心本影黑斑与大片半影变暗区；单击地球会弹出「设为观测点 / 进入地面视角」确认菜单。
              <br>• <b>🌍 地面视角</b>：代入地球任意经纬度与海拔，模拟当地真实大气散射、白昼/黄昏/黑夜、日全食白昼骤黑与 360° 地平线霞光、真实星表（5044 颗亮星）、星座连线以及金木水火土五大行星。
              <br>• <b>🌕 月面视角</b>：默认站在正面中心（中央湾），也可切换至阿波罗11号静海基地、嫦娥三号广寒宫·虹湾、嫦娥五号风暴洋吕姆克山、嫦娥四号月球背面·冯卡门坑或月球南极沙克尔顿环形山仰望地球，观察真实的<strong>地相</strong>盈亏与大陆自转。当地球发生月全食时，月面视角会看到地球遮挡太阳、地球大气层折射出一圈璀璨的铜红色光环！</li>
            <li><strong>可折叠侧边栏（桌面端左右两侧 46px 图标栏 / 手机端底部三态抽屉）</strong>：
              <br>• 左侧 <b>⏱ 时间</b>：支持公元前 1999 年至公元 3000 年跨度、各时区切换、日期快选（今天此刻、今晚 20:00、明早日出、下次日/月食）与多档倍速。修改输入框后按 <code>Enter</code> 或点「跳转」生效，按 <code>Esc</code> 放弃修改。
              <br>• 左侧 <b>🏮 农历</b>：按北京时间（UTC+8）计算干支八字、二十四节气、朔望月相日历（每日 20:00 月相，标注节日/节气/朔(初一)/十五，点击跳至当日 20:00）与农历反查公历。
              <br>• 右侧 <b>🌑 天象</b>：内置 <strong>${stats.total} 场精选日月食</strong>（${stats.solarTotalModern} 场近现代日全食 + ${stats.solarAnnularModern} 场近现代日环食 + ${stats.lunarTotalAll} 场月全食 + ${stats.ancientCount} 场《诗经》《春秋》等古籍记载日食；按类型筛选时含古籍共 ${stats.solarTotalAll} 场日全食、${stats.solarAnnularAll} 场日环食），并支持按任意年份实时搜索和当前地点接下来 6 场可见日食查询。
              <br>• 右侧 <b>📍 地点</b>：支持城市名称搜索、直接粘贴「纬度, 经度」或浏览器定位。每次跳转后均可点击提示条或顶栏的「↩ 返回」（或按 <code>Backspace</code>）撤销。</li>
            <li><strong>浮动天象详情卡片与智能慢放</strong>：点选一条日月食后，画面下方会浮出详情卡片，列出初亏（U1）、食既（U2）、食甚（Max）、生光（U3）、复圆（U4）的当地时间按钮（点击即跳），并提供「▶ 60秒全过程智能回放」（在食既至生光全食阶段会自动减速慢放）。</li>
          </ul>
        </section>

        <section class="help-sec" id="help-glossary">
          <h3>🌌 三、天文术语通俗解释（对应界面内 ⓘ 提示）</h3>
          <dl class="help-dl">
            <dt>示意比例 vs 真实比例</dt>
            <dd>真实宇宙中，地球直径约 1.27 万 km，月球直径约 3475 km，而地月平均距离达 38.4 万 km（约 60 个地球半径），日地距离更达 1.496 亿 km。若按 1:1 真实比例在远景同屏显示，地球和月球只有几个像素大小。因此默认<strong>「示意比例」</strong>将天体半径适度放大以便看清地貌与自转，但<strong>日地月方向矢量、月相照明角以及地球表面日食本影/半影位置 100% 采用真实物理公里坐标计算</strong>，绝无失真；切换至<strong>「真实比例」</strong>则展示 1:1 真实天体尺度，并自动附带屏幕空间位置标签。</dd>
            <dt>日全食、日环食与日偏食</dt>
            <dd>月球绕地球公转轨道是椭圆，地月距离在 35.6 万～40.6 万 km 之间变化。当月球在近地点附近遮挡太阳时，月球视直径大于太阳，完全遮住日面并露出洁白日冕，称为<strong>日全食</strong>；当月球在远地点附近时，视直径小于太阳，中心留下一圈耀眼金环，称为<strong>日环食</strong>；位于半影区的观测者看到太阳被遮住一部分，称为<strong>日偏食</strong>。</dd>
            <dt>本影与半影</dt>
            <dd>天体背后太阳光被完全遮挡的锥形核心区叫<strong>本影（Umbra）</strong>；太阳光仅被部分遮挡的外围区域叫<strong>半影（Penumbra）</strong>。</dd>
            <dt>线性食分 vs 遮挡面积比</dt>
            <dd><strong>线性食分</strong>是太阳视直径被月球遮挡的线段比例；<strong>遮挡面积比</strong>是太阳圆面被遮盖的面积百分比。日全食时线性食分 ≥ 1.0，遮挡面积比为 100%。</dd>
            <dt>本影食分 vs 半影食分（月食）</dt>
            <dd>月食时，月球视直径深入地球本影圆面的比例叫<strong>本影食分</strong>（≥ 1.0 为月全食，0～1 之间为月偏食）；深入地球半影的比例叫<strong>半影食分</strong>。</dd>
            <dt>为什么月全食是红色的（红月亮/血月）？</dt>
            <dd>月全食期间月球完全进入地球本影，太阳直射光被地球挡住；但太阳光穿过地球边缘大气层时，波长较短的蓝紫光被瑞利散射滤除，波长较长的红橙光被大气折射弯向本影内部，照亮月面呈现古铜红色。如果此时站在月球上看地球，会看到地球周围亮起一圈壮丽的 360° 日落红环！</dd>
            <dt>地相（站在月球上看地球）</dt>
            <dd>在月球表面看到的地球亮面盈亏称为<strong>地相</strong>。地相与地球上看到的月相严格互补（相位角之和为 180°）：农历初一（朔，地球上看不到月亮）时，月球正面正对整个白昼地球（100% 满地，“地照”也最强）；农历十五（满月）时，月球上看地球是暗面朝向月球的“新地”。</dd>
            <dt>月龄与日月黄经差</dt>
            <dd><strong>月龄</strong>是自最近一次新月（合朔）以来经过的天数；<strong>黄经差</strong>是月球与太阳在黄道上的角度差（0° 为朔，90° 为上弦，180° 为望，270° 为下弦）。因为月球椭圆轨道速度不均（开普勒第二定律），从合朔（初一）到满月（望，黄经差 180°）所需时间在 13.9 天至 15.6 天之间波动，因此满月常落在农历十五或十六，形成<strong>“十五的月亮十六圆”</strong>。</dd>
            <dt>沙罗周期与沙罗序列</dt>
            <dd>每隔 223 个朔望月（约 18 年 11 天 8 小时，等于 6585.32 天），日、地、月与月球轨道交点的几何位置几乎完全重演，这一周期称为<strong>沙罗周期（Saros）</strong>。由沙罗周期串联起来的一族日月食称为同一个<strong>沙罗序列</strong>（例如 1919、1955、1991、2009、2027、2045 年的著名超长日全食均属于第 136 沙罗序列）。</dd>
          </dl>
        </section>

        <section class="help-sec" id="help-accuracy">
          <h3>📐 四、历算模型、ΔT 与儒略历说明</h3>
          <ul>
            <li><strong>星历模型</strong>：太阳、地球、月球及五大行星位置采用基于 NASA/JPL VSOP87 与 ELP2000 理论的 <code>astronomy-engine</code> 实时历算，地平高度角与方位角包含章动、光行差、站心视差（月球视差达 1°）与大气折射修正。</li>
            <li><strong>中心食时长精度</strong>：日全食与日环食的持续时长由交食第二接触（食既 U2）与第三接触（生光 U3）精确时刻直接相减得出，与 NASA 公布值误差在 <strong>±5～10 秒</strong> 以内。</li>
            <li><strong>ΔT（地球自转长期变化）与古籍日食说明</strong>：由于月球潮汐摩擦与地核-地幔耦合，地球自转速率并非绝对均匀，力学时（TT）与世界时（UT1）之差称为 <strong>ΔT</strong>。在公元 1600–2200 年间 ΔT 有精密实测，食带位置精度极高；而在公元前《诗经》《春秋》时代，ΔT 累积达数小时，不同经验公式会使全食带在地面东西向移动上百公里。当本程序采用的现代外推模型在古都算得的食分与《春秋》“既”（全食）记载存在差异时，详情卡片会如实附注<strong>【模型说明】</strong>。</li>
            <li><strong>儒略历与外推格里历</strong>：1582 年 10 月 15 日格里历改革以前的历史日食，学界与史料均采用<strong>儒略历（Julian Calendar）</strong>日期（如公元前 709 年 7 月 17 日鲁桓公日全食），本系统在标题与警告栏中均会自动标明儒略历日期。</li>
          </ul>
        </section>

        <section class="help-sec" id="help-shortcuts">
          <h3>⌨️ 五、键盘快捷键一览</h3>
          <table class="help-table">
            <thead>
              <tr><th>按键</th><th>功能说明</th></tr>
            </thead>
            <tbody>
              <tr><td><code>Space (空格)</code></td><td>播放 / 暂停时间流逝</td></tr>
              <tr><td><code>1</code> / <code>2</code> / <code>3</code></td><td>切换「太空视角」/「地球地面视角」/「月面视角」</td></tr>
              <tr><td><code>N</code></td><td>立即回到当前系统真实时间（实时同步）</td></tr>
              <tr><td><code>←</code> / <code>→</code></td><td>时间快退 / 快进 1 分钟（按住 <code>Shift</code> 为 ±1 天）</td></tr>
              <tr><td><code>Backspace</code></td><td>撤销最近一次天象或观测点跳转，返回上一状态</td></tr>
              <tr><td><code>H</code></td><td>隐藏 / 显示全部 UI 面板（纯净全屏观赏 3D 天象）</td></tr>
              <tr><td><code>?</code></td><td>打开 / 关闭本帮助中心抽屉</td></tr>
              <tr><td><code>Enter</code> / <code>Esc</code></td><td>在时间输入框中确认跳转 / 放弃修改还原</td></tr>
            </tbody>
          </table>
        </section>

        <section class="help-sec" id="help-faq">
          <h3>❓ 六、常见问题与故障排查</h3>
          <dl class="help-dl">
            <dt>Q1：为什么进入地面视角后看不到月亮或太阳？</dt>
            <dd>因为当前时间该天体可能位于当地<strong>地平线以下</strong>（高度角为负数）。地面视角会在画面边缘用箭头标出它的方向与高度角，并在进入时提示下次月出/日出时间，点击提示条上的「跳到月出/日出」或拖动底部时间轴即可让它升起。</dd>
            <dt>Q2：为什么日食发生时只有部分地区能看到全食？</dt>
            <dd>月球本影锥到达地球表面时截面直径通常只有 100～250 公里，只有位于这条狭窄「全食带」内的城市才能看到日全食；而月食是月球自身进入地球本影，因此只要当时是夜晚（月亮在地平线以上）的半个地球都能同时看到月食。</dd>
            <dt>Q3：在太空视角点地球为什么没有马上改掉观测点？</dt>
            <dd>为了防止旋转地球时误触改掉您正在观察的城市，单击地球会弹出确认小菜单，点击「设为观测点」或「进入此地地面视角」即可生效（双击地球则直接进入地面视角）。</dd>
          </dl>
        </section>
      </div>
    `;

    this.el.querySelector('#help-close-btn')?.addEventListener('click', () => this.close());

    this.el.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.jump!;
        const sec = this.el.querySelector<HTMLElement>(`#${id}`);
        sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    this.el.querySelectorAll<HTMLButtonElement>('[data-sc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sc = btn.dataset.sc as 'nowSky' | 'eclipse2009' | 'moonEclipse2018';
        this.close();
        this.welcome.runScenario(sc);
      });
    });

    this.el.querySelector('#help-restart-tour')?.addEventListener('click', () => {
      this.close();
      this.tour.start();
    });

    this.el.querySelector('#help-reopen-welcome')?.addEventListener('click', () => {
      this.close();
      this.welcome.open();
    });

    const searchInput = this.el.querySelector<HTMLInputElement>('#help-search-input')!;
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      this.el.querySelectorAll<HTMLElement>('.help-sec').forEach((sec) => {
        if (!q) {
          sec.style.display = 'block';
          return;
        }
        const match = (sec.textContent || '').toLowerCase().includes(q);
        sec.style.display = match ? 'block' : 'none';
      });
    });
  }
}

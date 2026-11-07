import { AppState, DEFAULT_MOON_SITES } from '../state/AppState';
import { CITIES_LIST } from './cities';
import { showToast } from './Toast';

export class LocationPanel {
  public readonly el: HTMLElement;

  constructor(private state: AppState) {
    this.el = document.createElement('section');
    this.el.className = 'side-panel glass-panel';
    this.render();
    this.state.subscribe((s, changed) => {
      if (s.uiHidden) return;
      if (
        changed.has('uiHidden') ||
        changed.has('earthObserver') ||
        changed.has('moonObserver') ||
        changed.has('viewMode')
      ) {
        this.syncUI();
      }
    });
  }

  private render(): void {
    const groups = ['中国', '亚洲/大洋洲', '欧洲/非洲', '美洲'] as const;
    const cityOptionsHtml = groups
      .map((g) => {
        const items = CITIES_LIST.filter((c) => c.region === g)
          .map(
            (c) =>
              `<option value="${c.name}|${c.lat}|${c.lon}|${c.timezone}">${c.name}${c.note ? ' · ' + c.note : ''}</option>`
          )
          .join('');
        return `<optgroup label="${g}">${items}</optgroup>`;
      })
      .join('');

    const moonOptionsHtml = DEFAULT_MOON_SITES.map(
      (m, idx) => `<option value="${idx}">${m.name} (${m.lat.toFixed(1)}°, ${m.lon.toFixed(1)}°)</option>`
    ).join('');

    this.el.innerHTML = `
      <div class="panel-header">
        <h2>📍 地球与月面观测视角定位</h2>
        <button type="button" class="btn-chip" id="btn-geolocate" title="使用浏览器获取当前所在经纬度">📍 浏览器定位</button>
      </div>

      <div class="panel-body">
        <div class="loc-current-badge" id="loc-current-badge">
          当前地球观测点：<strong>北京</strong> (39.90°N, 116.41°E)
        </div>

        <div class="form-row">
          <label for="city-quick-search">搜索城市或输入经纬度 (如: 武汉 或 30.59, 114.30)</label>
          <div class="search-inline-row">
            <input type="text" id="city-quick-search" class="input-control" placeholder="输入城市名(如北京/武汉/漠河)或纬度,经度..." />
            <button type="button" class="btn-primary" id="btn-quick-loc">切换</button>
          </div>
        </div>

        <div class="form-row">
          <label for="city-select">常用城市 / 日食胜地列表</label>
          <select id="city-select" class="input-control">
            <option value="">-- 快速选择中国或全球城市 --</option>
            ${cityOptionsHtml}
          </select>
        </div>

        <div class="latlon-row pro-only">
          <div class="dt-field">
            <span>纬度 (°N+/°S-)</span>
            <input type="number" id="in-lat" min="-90" max="90" step="0.01" value="39.90" />
          </div>
          <div class="dt-field">
            <span>经度 (°E+/°W-)</span>
            <input type="number" id="in-lon" min="-180" max="180" step="0.01" value="116.41" />
          </div>
          <button type="button" class="btn-primary" id="btn-apply-latlon">定位</button>
        </div>

        <div class="view-quick-actions">
          <button type="button" class="btn-secondary" id="btn-enter-ground">🌍 进入该地地面天空视角</button>
          <button type="button" class="btn-secondary" id="btn-enter-moon">🌕 切换至月面观察视角</button>
        </div>

        <div class="moon-site-box pro-only">
          <div class="sub-title">🌕 月球表面观测站预设 (月面视角)</div>
          <select id="moon-site-select" class="input-control">
            ${moonOptionsHtml}
          </select>
          <div class="hint-text">💡 提示：在太空视角下单击 3D 地球将弹出选点确认菜单，双击地球或月球可直接进入对应表面视角。</div>
        </div>
      </div>
    `;

    const applyQuickSearch = () => {
      const raw = (this.el.querySelector('#city-quick-search') as HTMLInputElement).value.trim();
      if (!raw) return;

      // 1. Check if lat, lon pair
      const coordMatch = /^(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)$/.exec(raw);
      if (coordMatch) {
        const lat = Math.max(-90, Math.min(90, parseFloat(coordMatch[1])));
        const lon = Math.max(-180, Math.min(180, parseFloat(coordMatch[2])));
        this.state.pushUndoSnapshot('修改经纬度');
        this.state.setEarthLocation({ lat, lon });
        showToast({
          message: `已定位至 (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
          actionLabel: '↩ 返回',
          onAction: () => this.state.undoLastJump(),
        });
        return;
      }

      // 2. Match against CITIES_LIST
      const q = raw.toLowerCase();
      const found = CITIES_LIST.find(
        (c) => c.name.toLowerCase().includes(q) || (c.note && c.note.toLowerCase().includes(q))
      );
      if (found) {
        this.state.pushUndoSnapshot('切换城市');
        this.state.setEarthLocation({
          name: found.name.split(' ')[0],
          lat: found.lat,
          lon: found.lon,
          timezone: found.timezone,
        });
        showToast({
          message: `已切换观测城市：${found.name}`,
          actionLabel: '↩ 返回',
          onAction: () => this.state.undoLastJump(),
        });
      } else {
        showToast({
          message: `未找到匹配「${raw}」的预设城市，可直接输入「纬度, 经度」如 30.59, 114.30`,
          type: 'warn',
        });
      }
    };

    this.el.querySelector('#btn-quick-loc')?.addEventListener('click', applyQuickSearch);
    this.el.querySelector('#city-quick-search')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') applyQuickSearch();
    });

    const citySel = this.el.querySelector<HTMLSelectElement>('#city-select')!;
    citySel.addEventListener('change', () => {
      if (!citySel.value) return;
      const [name, latStr, lonStr, tz] = citySel.value.split('|');
      this.state.pushUndoSnapshot('选择城市');
      this.state.setEarthLocation({
        name: name.split(' ')[0],
        lat: parseFloat(latStr),
        lon: parseFloat(lonStr),
        timezone: tz,
      });
      showToast({
        message: `已切换至 ${name.split(' ')[0]}`,
        actionLabel: '↩ 返回',
        onAction: () => this.state.undoLastJump(),
      });
    });

    this.el.querySelector('#btn-apply-latlon')?.addEventListener('click', () => {
      const lat = parseFloat((this.el.querySelector('#in-lat') as HTMLInputElement).value);
      const lon = parseFloat((this.el.querySelector('#in-lon') as HTMLInputElement).value);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.state.pushUndoSnapshot('输入经纬度');
        this.state.setEarthLocation({
          lat: Math.max(-90, Math.min(90, lat)),
          lon: Math.max(-180, Math.min(180, lon)),
        });
        showToast({
          message: `已定位到 ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
          actionLabel: '↩ 返回',
          onAction: () => this.state.undoLastJump(),
        });
      }
    });

    // B4: Replace browser alert() with Toast
    this.el.querySelector('#btn-geolocate')?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast({ message: '当前浏览器环境不支持地理定位，请直接搜索城市', type: 'warn' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.state.pushUndoSnapshot('浏览器定位');
          this.state.setEarthLocation({
            name: '当前定位位置',
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
          showToast({
            message: '📍 已定位到当前所在经纬度',
            actionLabel: '↩ 返回',
            onAction: () => this.state.undoLastJump(),
          });
        },
        () => {
          showToast({
            message: '无法获取浏览器定位权限，请直接在上方选择城市或输入经纬度',
            type: 'warn',
          });
        }
      );
    });

    this.el.querySelector('#btn-enter-ground')?.addEventListener('click', () => {
      this.state.update({ viewMode: 'ground' });
    });

    this.el.querySelector('#btn-enter-moon')?.addEventListener('click', () => {
      this.state.update({ viewMode: 'moon' });
    });

    const moonSel = this.el.querySelector<HTMLSelectElement>('#moon-site-select')!;
    moonSel.addEventListener('change', () => {
      const idx = parseInt(moonSel.value, 10);
      const site = DEFAULT_MOON_SITES[idx];
      if (site) {
        this.state.pushUndoSnapshot('切换月面站点');
        this.state.update({
          moonObserver: site,
          viewMode: 'moon',
        });
      }
    });

    this.syncUI();
  }

  private syncUI(): void {
    const obs = this.state.get().earthObserver;
    const latStr = obs.lat >= 0 ? `${obs.lat.toFixed(2)}°N` : `${(-obs.lat).toFixed(2)}°S`;
    const lonStr = obs.lon >= 0 ? `${obs.lon.toFixed(2)}°E` : `${(-obs.lon).toFixed(2)}°W`;

    const badge = this.el.querySelector('#loc-current-badge')!;
    badge.textContent = '当前地球观测点：';
    const strong = document.createElement('strong');
    strong.textContent = obs.name;
    badge.append(strong, ` (${latStr}, ${lonStr} · ${obs.timezone})`);

    (this.el.querySelector('#in-lat') as HTMLInputElement).value = obs.lat.toFixed(2);
    (this.el.querySelector('#in-lon') as HTMLInputElement).value = obs.lon.toFixed(2);

    const moonObs = this.state.get().moonObserver;
    const moonSel = this.el.querySelector<HTMLSelectElement>('#moon-site-select');
    if (moonSel) {
      const idx = DEFAULT_MOON_SITES.findIndex((s) => s.name === moonObs.name);
      if (idx >= 0) {
        moonSel.value = String(idx);
      }
    }
  }
}

# 天体贴图版权与来源说明 (Texture Credits)

本项目 `public/textures/` 目录下的天体表面贴图来自以下开源天文可视化资源与公共科学数据（详见根目录 [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)）：

## 1. Solar System Scope 行星与星空贴图（CC BY 4.0）

- **涉及文件**：
  - `earth_day_2k.jpg`、`earth_day_4k.jpg`（衍生自 `8k_earth_daymap.jpg`）
  - `earth_night_2k.jpg`、`earth_night_4k.jpg`（衍生自 `8k_earth_nightmap.jpg`）
  - `earth_clouds_2k.jpg`、`earth_clouds_4k.jpg`（衍生自 `8k_earth_clouds.jpg`）
  - `moon_2k.jpg`、`moon_4k.jpg`（衍生自 `8k_moon.jpg`）
  - `stars_milkyway_2k.jpg`、`stars_milkyway_4k.jpg`（衍生自 `8k_stars_milky_way.jpg`）
  - `sun.jpg`（源自 `2k_sun.jpg`）
- **作者与来源**：[Solar System Scope (INOVE)](https://www.solarsystemscope.com/textures/)（基于 NASA 高程与遥感影像加工调色）
- **许可证**：[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- **修改声明 (Modification Notice)**：根据 CC BY 4.0 第 3(a)(1)(B) 条要求特此说明——上述 `*_4k.jpg` 与 `*_2k.jpg` 文件由 `scripts/fetch-textures.sh` 从原始 8K 贴图按比例缩放至 4096×2048（桌面端）与 2048×1024（移动端）并重新进行 JPEG 编码，以降低前端网络传输体积。

## 2. 地球法线与海洋高光贴图（MIT / NASA Public Domain）

- **涉及文件**：
  - `earth_normal.jpg`（源自 `earth_normal_2048.jpg`）
  - `earth_specular.jpg`（源自 `earth_specular_2048.jpg`）
- **来源**：[Three.js Examples (`mrdoob/three.js`)](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets)，原始高程与水陆掩膜数据来自 [NASA Visible Earth](https://visibleearth.nasa.gov/)
- **许可证**：MIT License（Three.js 仓库） / NASA Public Domain（公有领域）

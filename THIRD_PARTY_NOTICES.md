# Third-Party Notices & Data Licenses (第三方声明与数据许可)

`moonsun` 的源代码基于根目录 [`LICENSE`](./LICENSE) 中的 **MIT License** 开源（Copyright © 2026 ChingYung717）。

仓库中包含的第三方科学数据集（`public/data/*`、`src/astro/geo/chinaBoundary.ts`）与天体表面贴图（`public/textures/*`）各自遵循其原始许可协议，**不适用 MIT License**，具体声明如下：

---

## 1. 恒星表与星座连线数据 (`public/data/stars.6.json`, `public/data/constellations.lines.json`)

### 1.1 GeoJSON 转换与封装：`d3-celestial` (BSD 3-Clause License)

`public/data/stars.6.json` 与 `public/data/constellations.lines.json` 提取自 Olaf Frohn 的 [`d3-celestial`](https://github.com/ofrohn/d3-celestial) 项目：

```text
Copyright (c) 2015-2016, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 1.2 上游恒星天体测量汇编数据：HYG Database (CC BY-SA)

`public/data/stars.6.json` 中的视星等、色指数 (B-V) 与 J2000 赤道坐标源自 **David Nash ([Astronexus](https://www.astronexus.com/hyg))** 整理的 **HYG Stellar Database**（汇编自 Hipparcos Catalog、Yale Bright Star Catalog 5th Ed. 与 Gliese Catalog of Nearby Stars），由 `d3-celestial` 筛选视星等 $m_V \le 6$ 的肉眼亮星并转换为 GeoJSON 格式。

- **作者**：David Nash ([Astronexus](https://www.astronexus.com/hyg))，GeoJSON 筛选转换由 Olaf Frohn (`d3-celestial`) 完成。
- **许可证**：[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/)（及历史版本 [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/)）。
- **单独适用范围说明**：CC BY-SA 仅适用于 `public/data/stars.6.json` 数据文件本身及其衍生数据库；本项目的 TypeScript/GLSL 源代码通过标准 `fetch()` 读取该独立 JSON 文件，源代码仍适用 MIT License。若您单独提取或修改 `public/data/stars.6.json`，请继续遵循 CC BY-SA 协议署名并以相同方式共享。

---

## 2. 行星、月球、太阳与银河贴图 (`public/textures/*`)

### 2.1 Solar System Scope 贴图 (CC BY 4.0)

- **文件**：`earth_day_2k.jpg`、`earth_day_4k.jpg`、`earth_night_2k.jpg`、`earth_night_4k.jpg`、`earth_clouds_2k.jpg`、`earth_clouds_4k.jpg`、`moon_2k.jpg`、`moon_4k.jpg`、`stars_milkyway_2k.jpg`、`stars_milkyway_4k.jpg`、`sun.jpg`
- **版权与署名**："Solar System Scope Textures" by [INOVE / Solar System Scope](https://www.solarsystemscope.com/textures/), based on NASA elevation and imagery data.
- **许可证**：[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- **修改声明**：`*_4k.jpg` 与 `*_2k.jpg` 由原始 8K 贴图缩放至 4096×2048 与 2048×1024 并重新编码为 JPEG。

### 2.2 Three.js / NASA 地球法线与高光贴图 (MIT / Public Domain)

- **文件**：`earth_normal.jpg`、`earth_specular.jpg`
- **来源**：[`mrdoob/three.js`](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets) (MIT License)，原始数据来自 NASA Visible Earth (Public Domain)。

---

## 3. 地理疆域多边形 (`src/astro/geo/chinaBoundary.ts`)

- **来源**：衍生自 [Natural Earth](https://www.naturalearthdata.com/) `ne_10m_admin_0_countries_chn` 数据集，仅用于日月食中国可见性球面几何判定。
- **许可证**：Public Domain（公有领域，[Natural Earth Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/)）。

---

## 4. 运行时开源依赖库 (Runtime NPM Dependencies)

| 依赖包 | 许可证 | 作者 / 项目主页 |
|---|---|---|
| `three` | MIT | Mr.doob & Three.js Contributors (https://threejs.org/) |
| `astronomy-engine` | MIT | Don Cross (https://github.com/cosinekitty/astronomy) |
| `lunar-javascript` | MIT | 6tail (https://github.com/6tail/lunar-javascript) |
| `luxon` | MIT | JS Foundation and other contributors (https://moment.github.io/luxon/) |
| `tz-lookup` | CC0-1.0 | Dark Sky / tz-lookup Contributors (https://github.com/darkskyapp/tz-lookup-oss) |

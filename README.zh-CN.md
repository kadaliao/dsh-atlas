# 足迹（Atlas）

[English](README.md) | 简体中文

把你的相册放到 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里的一颗地球上。

- **一颗能一路放大到街道的夜色地球。** 拍过照的地方都在发光，缩略图从你去过的地方冒出来，下面标着地点和年份，越放大分得越细。
  放大后有 3D 地形和 3D 建筑、店铺和地标，还有 **我去过的地方**（"照片"从你照片里认出的店铺、景点、楼宇，点开就是在那里拍的照片）
  和 **附近百科**（周围的维基百科条目，带配图和简介）。去过的国家会被点亮，地球的夜半边有阴影，你不碰它的时候它会慢慢转。
- **四种底图。** *夜景*（OpenStreetMap，配成夜色）、*高德*（国内全中文、最详细；国外用夜景地图）、*卫星*、*轮廓*（完全不联网）。
- **好照片先看。** 不管从哪里打开一组照片——缩略图、地点、搜索、旅行——最上面先是 **精选**：按"照片"自己的美学评分和你的收藏挑出最好的几张，
  跳过连拍和重复镜头，分散到不同日子；截图、文档、保存下来的图片不进精选。其余的按时间排在后面，点一下就展开。
- **旅行自动整理好。** 离家很远时连续拍的照片会被归成一次旅行，有经停的城市、日期和里程，画成航线。
  点一次旅行看路线；按 **故事**，镜头一站一站飞过去，每一站最好的几张照片缓缓铺开。
- **这些年的时间轴。** 在上面拖动看一段时间，点某一年，或者按 **回放这些年**，看足迹一个月一个月长出来。
- **两种"那年今天"。** 往年今天你拍了什么；以及世界上的今天发生过什么（来自维基百科），优先挑发生在你去过的地方附近的：
  *"1987 年：中国内地首个模拟信号移动电话通信网在广州开通——离你在广州拍照的地方 1 公里。"*
- **像说话一样搜索。** 在面板里输入 `京都 2023 猫`、`海滩 视频`、`夏天`，地图只显示匹配的照片。
  在任何对话里问模型——*"我在日本拍过猫吗？在地图上给我看看"*、*"把我 4 月那次旅行用故事模式放一遍"*、
  *"我去过多少个国家？"*——它回答的同时地图会跟着动。
- **足迹统计。** 去过的国家和地区、城市、在每个地方待了几天、旅行次数、公里数，还有逐年对比。

中英双语。

## 安装

足迹收录在 [DSH 插件集](https://github.com/kadaliao/dsh-plugins) 市场里。先打开
**插件 → 实验性插件 → 自定义插件市场**，在 **发现 → 来源** 里添加：

```
https://raw.githubusercontent.com/kadaliao/dsh-plugins/main/marketplace.json
```

然后在"发现"里安装 **足迹**。也可以把 `@kadaliao/dsh-atlas` 粘贴到插件管理器里。装好后刷新一次页面，
左侧栏会出现 **足迹**（或输入 `/atlas`）。

## 要求

- macOS，有"照片"图库。足迹默认读"照片"App 默认打开的图库，也可以在面板的设置里换成别的。
- DeepSeek Harness 0.2.x 的网页界面（桌面版，或 `dsh web`）。
- 如果面板提示读不到图库：在"系统设置 → 隐私与安全性 → 完全磁盘访问权限"里给 **DeepSeek Harness**
  打开权限，然后重启它。

## 读了什么，什么会离开你的 Mac

- **照片图库，只读。** 足迹以只读方式打开 `database/Photos.sqlite` 和搜索索引 `database/search/leo.sqlite`，
  把"照片"已经生成好的预览图（`resources/derivatives`）提供给面板。它从不写入图库。隐藏和已删除的照片不会出现。
- **索引**（日期、坐标、地名、标签）缓存在 `~/.dsh/cache/atlas/`。不往你的对话里写任何东西。
- **地图瓦片**：和所有网页地图一样，瓦片服务器能看到你在看哪个区域。*夜景* 用 [OpenFreeMap](https://openfreemap.org)；
  3D 地形用 AWS Open Data 上公开的 Terrarium 高程瓦片；*高德* 还会在国内范围内请求高德瓦片；*卫星* 请求 Esri World Imagery。
  选 *轮廓* 就什么都不联网。
- **附近百科**：放大后，面板会向维基百科查询地图中心附近的条目，会发送这个位置。可以在图层菜单或设置里关掉。
- **历史上的今天** 会向维基百科请求今天日期的历史事件，只发送日期。可以在设置里关掉。
- **模型** 能看到它调用的工具返回的内容：数量、日期、地名、照片 id 和标签。只有它调用 `atlas_look` 时
  才会看到照片本身（每次最多 4 张预览图），这些图会像其他图片一样发给你的模型供应商。

## 给模型的工具

| 工具 | 作用 |
| --- | --- |
| `atlas_search` | 按地点、国家、日期、月份、标签（照片里有什么）、人物、距离找照片，并在地图上高亮 |
| `atlas_show` | 打开地图，飞到一次搜索的结果、一次旅行（可以用故事模式播放）、几张照片或一片区域 |
| `atlas_trips` | 旅行列表，或某一次旅行的经停城市和照片 |
| `atlas_stats` | 国家、城市、天数、旅行次数和里程，全部年份或某一年 |
| `atlas_today` | 往年今天的照片，和历史上的今天 |
| `atlas_look` | 看最多 4 张照片（给模型附上预览图） |

标签就是"照片"App 自己做搜索用的词，语言跟随你的 Mac：中文系统下是 `猫`、`海滩`、`日落`、`雪`。
匹配不上的词会返回相近的建议。

## 设置

面板右上角的齿轮：

- **照片图库**：某个 `.photoslibrary` 的路径，留空用默认图库。
- **常住地**：从照片推断（每年待得最久的地方）；推断错了可以把地图中心设为常住地。
- **离家多远算旅行**：默认 100 公里。
- **底图**：夜景、高德、卫星或轮廓（图层菜单里也能切换，还有各个图层的开关：我去过的地方、附近百科、3D 地形、航线、去过的国家、夜幕、历史事件）。
- **历史上的今天**：开或关。
- **重新读取图库**："照片"有变化后，足迹也会在几分钟内自己重新读取。

同样的选项也可以写在 `cordis.patch.yml` 里插件那一行：`library`、`history`、`nearby`、`basemap`（`night` | `amap` | `satellite` | `offline`）、`awayKm`。

## 限制

- **高德** 走的是不带 key 的公开瓦片接口，高德没有对第三方开放说明，随时可能失效；失效后国内会回落到夜景地图。
  在国内，足迹会把自己画的东西换算到高德的 GCJ-02 坐标，照片才能和街道对上。
- **卫星** 影像来自 Esri，使用前请看 Esri 的条款。默认不开，你选了才用。

- 只有带地点的照片会上地图；没有地点的照片依然能被搜索，也会出现在"那年今天"里。
- 原视频在这台 Mac 上才能播放；开了"优化 Mac 储存空间"时很多原件在 iCloud 里，足迹会改为显示预览图。
- "照片"的数据库格式是 Apple 私有、没有文档的；足迹在近几版 macOS 的图库上测试过。如果以后的版本改了格式，
  面板会提示读不到图库。

## 开发

```bash
npm test                           # node --test test/*.test.mjs（需要 Node 24+，用到 node:sqlite）
node scripts/build-countries.mjs   # 从 Natural Earth 重新生成 vendor/countries.json
```

在一个临时的 Harness 目录里试用工作副本：

```bash
DSH=/Applications/DeepSeek\ Harness.app/Contents/Resources/runtime/cli/bin/dsh
export DSH_HOME=$(mktemp -d)
"$DSH" plugin --profile web add "$PWD"
"$DSH" web --no-open --port 3917
```

目录：`index.js`（Host 半边：路由、工具）、`client.js`（网页端：面板、地球、对话卡片）、`lib/`（图库读取、
旅行、统计、搜索、那年今天）、`vendor/`（MapLibre GL JS 5.24、Supercluster 9.1、Natural Earth 1:110m 国界）。

## 致谢

[MapLibre GL JS](https://maplibre.org)（BSD-3-Clause）、[Supercluster](https://github.com/mapbox/supercluster)（ISC）、
[OpenFreeMap](https://openfreemap.org) 瓦片 © [OpenStreetMap](https://www.openstreetmap.org/copyright) 贡献者、
Mapzen Terrarium 地形（AWS Open Data）、© 高德地图 AutoNavi（高德底图）、Esri World Imagery（卫星底图）、
[Natural Earth](https://www.naturalearthdata.com)（公有领域）、[维基百科](https://www.wikipedia.org)"历史上的今天"（CC BY-SA）。

## 许可

MIT。

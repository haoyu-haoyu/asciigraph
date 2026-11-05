<p align="right"><a href="./README.md">English</a> · <b>中文</b></p>

<p align="center"><img src="./assets/readme/banner.gif" width="100%" alt="ASCII 海浪"></p>

# asciigraph

给一张照片，让它动起来。海浪一直往岸上涌，云在飘，草在摆，沙滩和礁石不动。可以导出普通视频，也可以导出 ASCII 字符画，两种都能首尾无缝循环。

上面的横幅就是用一张海滩照片做的。

## 怎么跑

需要 Node.js 18 以上。

```bash
npm install
npm start
```

打开 http://localhost:5177。想用自己的照片，就放进 `input/`，然后打开

```
http://localhost:5177/?img=input/beach.jpg
```

网址后面加 `&export=ascii,flow` 就会导出视频。页面别关，等它显示 `done`，文件在 `out/` 里。

## 参数

都写在网址里。

| | |
|---|---|
| `width=1080&height=2340` | 输出尺寸，做壁纸就填屏幕分辨率 |
| `mode=flow` | 普通视频，不要 ASCII |
| `scene=water` | 它认错照片类型时用这个指定（还有 `grass`、`sky`） |
| `shore=show` | 用红色标出它让哪些地方保持不动 |
| `sky=show` | 用蓝色标出它认为哪里是天空 |

按 `M` 切换 ASCII 和普通画面，空格暂停。

## 局限

哪里是水、哪里是沙、哪里是天，全靠颜色判断。大部分海边照片没问题，但浅色天空前的白楼、蓝玻璃大楼这类可能会认错。如果有不该动的地方动了，先用 `shore=show` / `sky=show` 看一下，再用 `scene=` 手动指定。

## 许可证

MIT

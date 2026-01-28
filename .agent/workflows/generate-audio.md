---
description: 如何生成游戏语音资源
---

当需要为游戏添加新的阶段、角色或播报语时，请遵循以下流程生成语音文件：

1. **更新脚本配置**：
   打开 `/Users/michael/WeChatProjects/miniprogram-1/scripts/generate_audio_assets.js`，在 `ASSETS` 对象中添加新的 Key 和对应的中文播报文本。

2. **同步文本定义**：
   在 `/Users/michael/WeChatProjects/miniprogram-1/miniprogram/pages/room/audioTexts.js` 中同步添加相同的 Key 和文本，确保前端字幕显示一致。

// turbo
3. **运行生成命令**：
   在终端执行以下命令：
   ```bash
   node /Users/michael/WeChatProjects/miniprogram-1/scripts/generate_audio_assets.js
   ```
   该脚本会自动跳过已存在的文件，仅生成新增的 mp3。

4. **部署资源**：
   生成后的文件位于 `miniprogram/audio_assets/`。
   - 如果使用**云端存储模式**：需将新生成的 mp3 手动上传至云开发后台的 `audio/` 目录。
   - 如果使用**本地存储模式**：直接通过微信开发者工具预览/上传代码即可。

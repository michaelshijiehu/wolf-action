# Wolf Action - Werewolf Game Moderator

## Project Overview

**Wolf Action** is a WeChat Mini Program designed to act as a moderator/judge for the social deduction game "Werewolf" (狼人杀). It automates the game flow, manages night/day phases, plays audio cues, handles voting logic, and tracks player status (alive/dead, roles).

The project utilizes **Tencent Cloud Base (TCB)** for backend logic (Cloud Functions) and database storage.

## Architecture

The project follows the standard WeChat Mini Program Cloud Development structure:

### Frontend (`miniprogram/`)
*   **`app.js`**: Global lifecycle and data (user info).
*   **`pages/`**: UI Screens.
    *   `index/`: Landing page (Create/Join room).
    *   `room/`: Main game interface. Handles audio playback, role actions, and real-time state updates.
    *   `setup/`: Game configuration (roles count).
    *   `records/` & `recordDetail/`: Game history and logs.
    *   `rules/`: Rule book display.
*   **`audio_assets/`**: Contains MP3 files for voice prompts (e.g., "Werewolves, close your eyes").
*   **`constants/`**: Game configuration constants (audio scripts, etc.).

### Backend (`cloudfunctions/`)
*   **`quickstartFunctions/`**: The primary backend service. It likely handles:
    *   Room creation and management.
    *   Game state transitions (Night -> Day).
    *   Action processing (Voting, Killing, Saving).
    *   **Note:** Despite the name `quickstartFunctions`, this appears to be the main container for business logic.
*   **`cleanExpiredRooms/`**: Scheduled task to cleanup inactive game rooms.

## Key Workflows

### 1. Game Loop
The core game logic is documented in **`GAME_FLOW.md`**. It defines the strict sequence of phases:
*   **Preparation:** Room creation, role assignment.
*   **Night Cycle:** Cupid -> Lovers -> Guard -> Werewolf -> Witch -> Seer -> Hunter.
*   **Day Cycle:** Sheriff Election (Day 1) -> Death Announcement -> Discussion -> Voting.

### 2. Audio Management
*   The game relies heavily on audio cues.
*   Audio files are stored in `miniprogram/audio_assets/`.
*   Scripts in `scripts/` (e.g., `generate_audio_assets.js`) are used to manage or generate these assets.

### 3. Database
*   Uses the TCB JSON Database.
*   Likely stores `Rooms`, `Players`, and `GameLogs`.

## Development & Usage

### Prerequisites
*   **WeChat Developer Tools**: Required to run and simulate the project.
*   **Node.js**: Required for cloud functions and local scripts.

### Running the Project
1.  Open the root directory in **WeChat Developer Tools**.
2.  Set the `appid` in `project.config.json` to your own if deploying, or use a test ID.
3.  Ensure Cloud Development environment is initialized.
4.  Deploy Cloud Functions: Right-click `cloudfunctions/quickstartFunctions` and select "Upload and Deploy".

### Scripts
*   `node scripts/generate_audio_manifest.js`: Generates the mapping of audio files for the frontend.
*   `node scripts/generate_manifest.js`: General manifest generation.

## Development Red Lines (开发红线)

- **接口稳定性 (Mandatory)**: 严禁在重构或优化代码时擅自删减、重命名已有的 API 接口 (Actions/Interfaces)。除非用户明确要求删除某个功能，否则必须确保 `acts` 对象或相关路由映射中的所有接口保持完整。
- **功能回退检查**: 每次执行 `replace` 或 `write_file` 操作后，必须自查是否导致了原有功能的回退（如统计数据消失、调试工具失效等）。

## Conventions
*   **Styling**: Standard WXSS.
*   **Logic**: Heavy reliance on `room.js` for frontend state management during the game.
*   **Configuration**: `project.config.json` manages IDE settings; `miniprogram/app.json` manages global app config.

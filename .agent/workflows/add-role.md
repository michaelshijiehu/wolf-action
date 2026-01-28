---
description: 自动添加新游戏角色 (Automated workflow to add a new game role)
---

# Add New Role Workflow

This workflow automates the process of adding a new character to the Werewolf game.

**Prerequisites**:
The user MUST provide:
1.  **Role Key**: e.g., `knight`
2.  **Role Name**: e.g., `骑士`
3.  **Phase Logic**: When does it wake up? What does it do?
4.  **Audio Text**: What should the judge say?

## Steps

### 1. Backend Configuration (`constants.js`)

1.  Read `cloudfunctions/quickstartFunctions/constants.js`.
2.  Add the new role's phase configuration to `flowConfig`.
    *   **Wake Phase**: `[role]_wake`
    *   **Action Phase**: `[role]_action` (if active skill)
    *   **Sleep Phase**: `[role]_sleep`
3.  Ensure the `next` pointers are correctly chained (insert the new role into the night sequence).

### 2. Audio Script (`audioScripts.js`)

1.  Read `miniprogram/constants/audioScripts.js`.
2.  Add a new entry for the role:
    ```javascript
    ROLE_KEY: {
      start: "Role Name请睁眼。",
      action: "请执行行动。",
      end: "Role Name请闭眼。"
    }
    ```

### 3. Frontend Map (`room.js`)

1.  Read `miniprogram/pages/room/room.js`.
2.  Update `ROLE_NAMES` to include the new role mapping.

### 4. Setup Page (`setup` folder)

1.  Read `miniprogram/pages/setup/setup.js` and `.wxml`.
2.  **JS**: Add the new role to the default `config` object (default `false` or `0`).
3.  **JS**: Update `recalc()` to include the new role in seat counting.
4.  **WXML**: Add a toggle button (if God) or counter (if Villager/Wolf side) in the UI.

### 5. Generate Audio

1.  Run the generation script to create audio assets including the new role's voice.
    // turbo
    `node scripts/generate_audio_assets.js`

### 6. Logic Implementation (Optional)

1.  If the role has complex active skills (not just "judge speaks, player acts physically"), verify if `index.js` needs logic updates in `nextPhase` to handle the specific action payload.

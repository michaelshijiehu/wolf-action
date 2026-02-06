# Audio Tasks Checklist

## Missing Audio Phases
The following game phases require audio files but currently return empty arrays:

1. **Sheriff Speech** (`sheriff_speech`)
   - Description: Prompt candidates to start speaking.
   - Recommended Key: `SPEECH_START`
   - Content: "请竞选玩家按顺序发言"

2. **Sheriff Voting** (`sheriff_voting`)
   - Description: Prompt players to vote for sheriff.
   - Recommended Key: `VOTE_START_SHERIFF`
   - Content: "请所有玩家进行投票"

3. **Exile Voting** (`day_voting`)
   - Description: Prompt players to vote for exile.
   - Recommended Key: `VOTE_START_EXILE` (or reuse `VOTE_START`)
   - Content: "请所有玩家进行放逐投票"

4. **Hunter Action** (`hunter_action`)
   - Description: Prompt hunter to shoot upon death.
   - Recommended Key: `HUNTER_ACTION`
   - Content: "请猎人选择开枪目标或跳过"

5. **Sheriff Handover** (`sheriff_handover`)
   - Description: Prompt dead sheriff to handover badge.
   - Recommended Key: `HANDOVER_BADGE`
   - Content: "请移交警徽"

## Implementation Steps

### 1. Update `audioManifest.js`
Add the new keys with cloud storage URLs (placeholders or real).

```javascript
module.exports = {
  // ... existing keys
  "SPEECH_START": "cloud://.../audio/SPEECH_START.mp3",
  "VOTE_START_SHERIFF": "cloud://.../audio/VOTE_START_SHERIFF.mp3",
  "VOTE_START_EXILE": "cloud://.../audio/VOTE_START_EXILE.mp3",
  "HUNTER_ACTION": "cloud://.../audio/HUNTER_ACTION.mp3",
  "HANDOVER_BADGE": "cloud://.../audio/HANDOVER_BADGE.mp3"
};
```

### 2. Update `constants.js`
Update `flowConfig` to return these keys in `getAudio`.

```javascript
  sheriff_speech: {
    // ...
    getAudio: () => ['SPEECH_START'],
  },
  sheriff_voting: {
    // ...
    getAudio: () => ['VOTE_START_SHERIFF'],
  },
  // etc...
```

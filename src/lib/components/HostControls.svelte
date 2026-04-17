<script lang="ts">
  let {
    playerRoomKey,
    audienceRoomKey,
    isConnected,
    localReady,
    phase,
    charsPerPlayer,
    minCharFloor,
    turnLimitSeconds,
    voteWindowSeconds,
    gracePeriodSeconds,
    correspondenceMode,
    sharePlayerCode,
    shareAudienceCode,
    onPlayerRoomKeyInput,
    onAudienceRoomKeyInput,
    onCharsPerPlayerInput,
    onMinCharFloorInput,
    onTurnLimitInput,
    onVoteWindowInput,
    onGraceInput,
    onCorrespondenceToggle,
    onSharePlayerCodeToggle,
    onShareAudienceCodeToggle,
    onConnect,
    onDisconnect,
    onToggleReady,
    onStart,
    onEnd,
  }: {
    playerRoomKey: string
    audienceRoomKey: string
    isConnected: boolean
    localReady: boolean
    phase: string
    charsPerPlayer: number
    minCharFloor: number
    turnLimitSeconds: number
    voteWindowSeconds: number
    gracePeriodSeconds: number
    correspondenceMode: boolean
    sharePlayerCode: boolean
    shareAudienceCode: boolean
    onPlayerRoomKeyInput: (value: string) => void
    onAudienceRoomKeyInput: (value: string) => void
    onCharsPerPlayerInput: (value: number) => void
    onMinCharFloorInput: (value: number) => void
    onTurnLimitInput: (value: number) => void
    onVoteWindowInput: (value: number) => void
    onGraceInput: (value: number) => void
    onCorrespondenceToggle: (value: boolean) => void
    onSharePlayerCodeToggle: (value: boolean) => void
    onShareAudienceCodeToggle: (value: boolean) => void
    onConnect: () => void
    onDisconnect: () => void
    onToggleReady: () => void
    onStart: () => void
    onEnd: () => void
  } = $props()

  let showPlayerRoomKey = $state(false)
  let showAudienceRoomKey = $state(false)

  const copyToClipboard = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    try {
      await navigator.clipboard.writeText(trimmed)
    } catch {
      // Browser clipboard APIs can fail in insecure contexts.
    }
  }
</script>

<div class="panel">
  <h3>Host Controls</h3>

  <label>
    Player code
    <div class="code-row">
      <input
        type={showPlayerRoomKey ? 'text' : 'password'}
        value={playerRoomKey}
        oninput={(e) => onPlayerRoomKeyInput((e.currentTarget as HTMLInputElement).value)}
        disabled={isConnected}
      />
      <button type="button" class="mini" onclick={() => (showPlayerRoomKey = !showPlayerRoomKey)}>
        {showPlayerRoomKey ? 'Hide' : 'Show'}
      </button>
      <button type="button" class="mini" onclick={() => void copyToClipboard(playerRoomKey)} disabled={!playerRoomKey.trim()}>
        Copy
      </button>
    </div>
  </label>

  <label>
    Audience code
    <div class="code-row">
      <input
        type={showAudienceRoomKey ? 'text' : 'password'}
        value={audienceRoomKey}
        oninput={(e) => onAudienceRoomKeyInput((e.currentTarget as HTMLInputElement).value)}
        disabled={isConnected}
      />
      <button type="button" class="mini" onclick={() => (showAudienceRoomKey = !showAudienceRoomKey)}>
        {showAudienceRoomKey ? 'Hide' : 'Show'}
      </button>
      <button type="button" class="mini" onclick={() => void copyToClipboard(audienceRoomKey)} disabled={!audienceRoomKey.trim()}>
        Copy
      </button>
    </div>
  </label>

  <div class="grid">
    <label>
      Chars per player
      <input type="number" value={charsPerPlayer} min="1" oninput={(e) => onCharsPerPlayerInput(Number((e.currentTarget as HTMLInputElement).value))} />
    </label>
    <label>
      Min floor
      <input type="number" value={minCharFloor} min="0" oninput={(e) => onMinCharFloorInput(Number((e.currentTarget as HTMLInputElement).value))} />
    </label>
    <label>
      Turn sec
      <input type="number" value={turnLimitSeconds} min="1" disabled={correspondenceMode} oninput={(e) => onTurnLimitInput(Number((e.currentTarget as HTMLInputElement).value))} />
    </label>
    <label>
      Vote sec
      <input type="number" value={voteWindowSeconds} min="1" oninput={(e) => onVoteWindowInput(Number((e.currentTarget as HTMLInputElement).value))} />
    </label>
    <label>
      Grace sec
      <input type="number" value={gracePeriodSeconds} min="1" oninput={(e) => onGraceInput(Number((e.currentTarget as HTMLInputElement).value))} />
    </label>
    <label class="check">
      <input type="checkbox" checked={correspondenceMode} onchange={(e) => onCorrespondenceToggle((e.currentTarget as HTMLInputElement).checked)} />
      Correspondence mode
    </label>
    <label class="check">
      <input type="checkbox" checked={sharePlayerCode} onchange={(e) => onSharePlayerCodeToggle((e.currentTarget as HTMLInputElement).checked)} />
      Share Player code
    </label>
    <label class="check">
      <input type="checkbox" checked={shareAudienceCode} onchange={(e) => onShareAudienceCodeToggle((e.currentTarget as HTMLInputElement).checked)} />
      Share Audience code
    </label>
  </div>

  <div class="actions">
    <button onclick={onConnect} disabled={isConnected}>Connect</button>
    <button onclick={onDisconnect} disabled={!isConnected}>Disconnect</button>
    <button onclick={onToggleReady} disabled={!isConnected}>{localReady ? 'Unready' : 'Ready'}</button>
    <button onclick={onStart} disabled={!isConnected || phase !== 'lobby'}>Start Game</button>
    <button onclick={onEnd} disabled={!isConnected || phase === 'ended'}>End Game</button>
  </div>
</div>

<style>
  .panel {
    background: #0e1e33;
    border: 1px solid #253d59;
    padding: 0.7rem;
    display: grid;
    gap: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  input {
    width: 100%;
    border: 1px solid #2a3f59;
    background: #0c1522;
    color: #eff4ff;
    padding: 0.35rem 0.45rem;
  }

  .code-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 0.35rem;
    align-items: center;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.45rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 1.2rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  button {
    border: 1px solid #2d4f6f;
    background: #16314a;
    color: #d8ecff;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .mini {
    padding: 0.3rem 0.5rem;
    font-size: 0.78rem;
    white-space: nowrap;
  }
</style>

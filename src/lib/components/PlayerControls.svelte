<script lang="ts">
  let {
    playerRoomKey,
    isConnected,
    localReady,
    activeBudget,
    onPlayerRoomKeyInput,
    onConnect,
    onDisconnect,
    onToggleReady,
  }: {
    playerRoomKey: string
    isConnected: boolean
    localReady: boolean
    activeBudget: number
    onPlayerRoomKeyInput: (value: string) => void
    onConnect: () => void
    onDisconnect: () => void
    onToggleReady: () => void
  } = $props()
</script>

<div class="panel">
  <h3>Player Controls</h3>
  <label>
    Player code
    <input value={playerRoomKey} oninput={(e) => onPlayerRoomKeyInput((e.currentTarget as HTMLInputElement).value)} disabled={isConnected} />
  </label>

  <div class="actions">
    <button onclick={onConnect} disabled={isConnected}>Connect</button>
    <button onclick={onDisconnect} disabled={!isConnected}>Disconnect</button>
    <button onclick={onToggleReady} disabled={!isConnected}>{localReady ? 'Unready' : 'Ready'}</button>
  </div>

  <p class="hint">Your budget this round: {activeBudget}</p>
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

  .hint {
    margin: 0;
    font-family: monospace;
    color: #a2bbd7;
  }
</style>

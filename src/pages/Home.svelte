<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { fromStore } from 'svelte/store'
  import { gameState } from '../lib/game/state'

  const playerName = fromStore(gameState.playerName)
  const charsPerPlayer = fromStore(gameState.charsPerPlayer)
  const minCharFloor = fromStore(gameState.minCharFloor)
  const turnLimitSeconds = fromStore(gameState.turnLimitSeconds)
  const voteWindowSeconds = fromStore(gameState.voteWindowSeconds)
  const gracePeriodSeconds = fromStore(gameState.gracePeriodSeconds)
  const correspondenceMode = fromStore(gameState.correspondenceMode)
  const statusMessage = fromStore(gameState.statusMessage)
  const setupError = fromStore(gameState.setupError)

  let playerCode = $state('')
  let audienceCode = $state('')

  const goHost = async () => {
    gameState.prepareHostSession()
    await gameState.connect()
    push('/host')
  }

  const goPlayer = async () => {
    if (!gameState.preparePlayerSession(playerCode)) return
    await gameState.connect()
    push('/player')
  }

  const goAudience = async () => {
    if (!gameState.prepareAudienceSession(audienceCode)) return
    await gameState.connect()
    push('/audience')
  }
</script>

<main>
  <h1>Bonzonet</h1>
  <p class="subtitle">P2P shader duel with audience voting</p>

  <label>
    Player Name
    <input value={playerName.current} oninput={(e) => gameState.setPlayerName((e.currentTarget as HTMLInputElement).value)} />
  </label>

  {#if statusMessage.current !== 'Disconnected'}
    <p class="status">{statusMessage.current}</p>
  {/if}

  <div class="split-layout">
    <section class="card">
      <h2>Host Game</h2>
      <div class="grid">
        <label>
          Chars per player
          <input type="number" value={charsPerPlayer.current} min="1" oninput={(e) => gameState.setCharsPerPlayer(Number((e.currentTarget as HTMLInputElement).value))} />
        </label>
        <label>
          Min floor
          <input type="number" value={minCharFloor.current} min="0" oninput={(e) => gameState.setMinCharFloor(Number((e.currentTarget as HTMLInputElement).value))} />
        </label>
        <label>
          Turn sec
          <input type="number" value={turnLimitSeconds.current} min="1" disabled={correspondenceMode.current} oninput={(e) => gameState.setTurnLimitSeconds(Number((e.currentTarget as HTMLInputElement).value))} />
        </label>
        <label>
          Vote sec
          <input type="number" value={voteWindowSeconds.current} min="1" oninput={(e) => gameState.setVoteWindowSeconds(Number((e.currentTarget as HTMLInputElement).value))} />
        </label>
        <label>
          Grace sec
          <input type="number" value={gracePeriodSeconds.current} min="1" oninput={(e) => gameState.setGracePeriodSeconds(Number((e.currentTarget as HTMLInputElement).value))} />
        </label>
        <label class="check">
          <input type="checkbox" checked={correspondenceMode.current} onchange={(e) => gameState.setCorrespondenceMode((e.currentTarget as HTMLInputElement).checked)} />
          Correspondence mode
        </label>
      </div>
      <button onclick={goHost} disabled={!!setupError.current}>Host New Game</button>
    </section>

    <section class="card">
      <h2>Join Game</h2>
      <label>
        Player code
        <input bind:value={playerCode} placeholder="players-..." />
      </label>
      <button onclick={goPlayer} disabled={!!setupError.current}>Join as Player</button>

      <label>
        Audience code
        <input bind:value={audienceCode} placeholder="aud-..." />
      </label>
      <button onclick={goAudience} disabled={!!setupError.current}>Join as Audience</button>
    </section>
  </div>
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    padding: 2rem 1rem;
    display: grid;
    gap: 1rem;
    color: #eff4ff;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3rem);
    letter-spacing: 0.03em;
  }

  .subtitle {
    margin: 0;
    color: #9bb6d4;
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
    padding: 0.4rem 0.5rem;
  }

  .split-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .card {
    background: #101e31;
    border: 1px solid #253d59;
    padding: 1rem;
    display: grid;
    gap: 0.7rem;
  }

  .card h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .grid {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 1.2rem;
  }

  button {
    border: 1px solid #2d4f6f;
    background: #16314a;
    color: #d8ecff;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
  }

  .status {
    margin: 0;
    font-family: monospace;
  }

  @media (max-width: 1000px) {
    .split-layout {
      grid-template-columns: 1fr;
    }
  }
</style>

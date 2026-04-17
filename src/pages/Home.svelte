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
  const broadcastEnabled = fromStore(gameState.broadcastEnabled)
  const sharePlayerCode = fromStore(gameState.sharePlayerCode)
  const shareAudienceCode = fromStore(gameState.shareAudienceCode)
  const broadcastListings = fromStore(gameState.broadcastListings)

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

  const goPlayerWithCode = async (code: string) => {
    if (!gameState.preparePlayerSession(code)) return
    await gameState.connect()
    push('/player')
  }

  const goAudienceWithCode = async (code: string) => {
    if (!gameState.prepareAudienceSession(code)) return
    await gameState.connect()
    push('/audience')
  }

  const listings = $derived(
    Object.values(broadcastListings.current)
      .filter((listing) => !!listing.playerRoomKey.trim() || !!listing.audienceRoomKey.trim())
      .sort((a, b) => b.timestamp - a.timestamp),
  )

  const relativeAge = (timestamp: number) => {
    const deltaMs = Date.now() - timestamp
    if (deltaMs < 1000) return 'just now'
    const deltaSec = Math.floor(deltaMs / 1000)
    if (deltaSec < 60) return `${deltaSec}s ago`
    const deltaMin = Math.floor(deltaSec / 60)
    return `${deltaMin}m ago`
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
        <label class="check">
          <input type="checkbox" checked={broadcastEnabled.current} onchange={(e) => gameState.setBroadcastEnabled((e.currentTarget as HTMLInputElement).checked)} />
          Advertise this Game to all Players
        </label>
        <label class="check">
          <input type="checkbox" checked={sharePlayerCode.current} onchange={(e) => gameState.setSharePlayerCode((e.currentTarget as HTMLInputElement).checked)} />
          Share Player code
        </label>
        <label class="check">
          <input type="checkbox" checked={shareAudienceCode.current} onchange={(e) => gameState.setShareAudienceCode((e.currentTarget as HTMLInputElement).checked)} />
          Share Audience code
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

  <section class="card broadcast-room">
    <div class="broadcast-head">
      <h2>Broadcast Room</h2>
      <span>{listings.length} live host{listings.length === 1 ? '' : 's'}</span>
    </div>

    {#if listings.length === 0}
      <p class="empty-broadcast">No live broadcasts yet. Hosts can enable advertising from the Host Game card.</p>
    {:else}
      <div class="broadcast-grid">
        {#each listings as listing (listing.hostPubKey)}
          <article class="broadcast-tile">
            <div class="tile-head">
              <strong>{listing.hostName}</strong>
              <span>{relativeAge(listing.timestamp)}</span>
            </div>
            <p class="tile-meta">Phase: {listing.phase} | Round {listing.round}</p>
            <div class="tile-codes">
              {#if listing.playerRoomKey.trim()}
                <p>Player: {listing.playerRoomKey}</p>
              {/if}
              {#if listing.audienceRoomKey.trim()}
                <p>Audience: {listing.audienceRoomKey}</p>
              {/if}
            </div>
            <div class="tile-config">
              <span>Chars: {listing.charsPerPlayer}</span>
              <span>Min floor: {listing.minCharFloor}</span>
              <span>Turn: {listing.correspondenceMode ? 'correspondence' : `${listing.turnLimitSeconds}s`}</span>
              <span>Vote: {listing.voteWindowSeconds}s</span>
              <span>Grace: {listing.gracePeriodSeconds}s</span>
            </div>
            <div class="tile-actions">
              {#if listing.playerRoomKey.trim()}
                <button onclick={() => void goPlayerWithCode(listing.playerRoomKey)} disabled={!!setupError.current}>Join as Player</button>
              {/if}
              {#if listing.audienceRoomKey.trim()}
                <button onclick={() => void goAudienceWithCode(listing.audienceRoomKey)} disabled={!!setupError.current}>Join as Audience</button>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
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

  .broadcast-room {
    gap: 0.9rem;
  }

  .broadcast-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.8rem;
  }

  .broadcast-head span {
    color: #9bb6d4;
    font-size: 0.9rem;
  }

  .empty-broadcast {
    margin: 0;
    color: #9bb6d4;
  }

  .broadcast-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.7rem;
  }

  .broadcast-tile {
    display: grid;
    gap: 0.55rem;
    background: #0b1624;
    border: 1px solid #28415f;
    padding: 0.75rem;
  }

  .tile-head {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    align-items: baseline;
  }

  .tile-head strong {
    font-size: 1rem;
  }

  .tile-head span,
  .tile-meta {
    color: #9bb6d4;
    margin: 0;
    font-size: 0.82rem;
  }

  .tile-codes {
    display: grid;
    gap: 0.2rem;
    font-family: monospace;
    font-size: 0.8rem;
  }

  .tile-codes p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .tile-config {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem 0.5rem;
    color: #b7d0ea;
    font-size: 0.8rem;
  }

  .tile-actions {
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
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

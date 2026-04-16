<script lang="ts">
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { fromStore } from 'svelte/store'
  import ShaderStage from '../lib/components/ShaderStage.svelte'
  import GameStateBanner from '../lib/components/GameStateBanner.svelte'
  import GameInfo from '../lib/components/GameInfo.svelte'
  import PlayerControls from '../lib/components/PlayerControls.svelte'
  import PlayerList from '../lib/components/PlayerList.svelte'
  import { gameState } from '../lib/game/state'

  const role = fromStore(gameState.role)
  const isConnected = fromStore(gameState.isConnected)
  const statusMessage = fromStore(gameState.statusMessage)
  const phase = fromStore(gameState.phase)
  const round = fromStore(gameState.round)
  const activePlayerPubKey = fromStore(gameState.activePlayerPubKey)
  const turnEndsAtMs = fromStore(gameState.turnEndsAtMs)
  const votingEndsAtMs = fromStore(gameState.votingEndsAtMs)
  const nowMs = fromStore(gameState.nowMs)
  const identity = fromStore(gameState.identity)
  const playerRoomKey = fromStore(gameState.playerRoomKey)
  const localReady = fromStore(gameState.localReady)
  const activeBudget = fromStore(gameState.activeBudget)
  const shaderSource = fromStore(gameState.shaderSource)
  const canEdit = fromStore(gameState.canEdit)
  const playerPubKeys = fromStore(gameState.playerPubKeys)
  const playersByPubKey = fromStore(gameState.playersByPubKey)
  const charBudgetByPlayer = fromStore(gameState.charBudgetByPlayer)
  const completedPlayerPubKeys = fromStore(gameState.completedPlayerPubKeys)
  const charsPerPlayer = fromStore(gameState.charsPerPlayer)
  const currentVotes = fromStore(gameState.currentVotes)
  const votesByRound = fromStore(gameState.votesByRound)
  const confirmedShader = fromStore(gameState.confirmedShader)
  const compileError = fromStore(gameState.compileError)
  const lastLine = fromStore(gameState.lastLine)

  onMount(async () => {
    if (role.current !== 'player') {
      gameState.preparePlayerSession(playerRoomKey.current)
    }
    await gameState.ensureConnected()
  })

  $effect(() => {
    if (role.current !== 'player') {
      push('/')
    }
  })

  const playerRows = $derived(
    playerPubKeys.current.map((pubKey) => ({
      pubKey: gameState.short(pubKey),
      name: playersByPubKey.current[pubKey]?.name ?? gameState.short(pubKey),
      budget: charBudgetByPlayer.current[pubKey] ?? charsPerPlayer.current,
      isReady: playersByPubKey.current[pubKey]?.isReady ?? false,
      isOnline: playersByPubKey.current[pubKey]?.isOnline ?? false,
      isDone: completedPlayerPubKeys.current.includes(pubKey),
    })),
  )

  const playerOptions = $derived(
    playerPubKeys.current.map((pubKey) => ({
      pubKey,
      name: playersByPubKey.current[pubKey]?.name ?? gameState.short(pubKey),
    })),
  )

  const activePlayerName = $derived(
    activePlayerPubKey.current
      ? (playersByPubKey.current[activePlayerPubKey.current]?.name ?? gameState.short(activePlayerPubKey.current))
      : 'none',
  )

  const activePlayerBudget = $derived(
    activePlayerPubKey.current
      ? (charBudgetByPlayer.current[activePlayerPubKey.current] ?? charsPerPlayer.current)
      : charsPerPlayer.current,
  )

  const turnCharsUsed = $derived(Math.max(0, shaderSource.current.length - confirmedShader.current.length))

  const knownAudienceCount = $derived(
    (() => {
      const voters = new Set<string>()
      Object.values(votesByRound.current).forEach((roundVotes) => {
        Object.keys(roundVotes).forEach((voter) => voters.add(voter))
      })
      return Math.max(voters.size, Object.keys(currentVotes.current).length)
    })(),
  )

  const turnSeconds = $derived(gameState.remainingSeconds(turnEndsAtMs.current, nowMs.current))
  const voteSeconds = $derived(gameState.remainingSeconds(votingEndsAtMs.current, nowMs.current))
</script>

<main class="page-shell">
  <header>
    <button onclick={() => push('/')}>Back Home</button>
    <span class="route">/player</span>
  </header>

  <section class="hero">
    <div class="viewer-wrap">
      <ShaderStage
        fragmentShader={shaderSource.current}
        editorValue={shaderSource.current}
        charBudget={activeBudget.current}
        editorEnabled={canEdit.current}
        compileError={compileError.current}
        lastLine={lastLine.current}
        showEditor={true}
        onConfirm={gameState.onConfirm}
        onLiveChange={gameState.onLiveChange}
        onCompileError={gameState.onCompileError}
      />
    </div>

    <div class="info-band">
      <GameStateBanner
        phase={phase.current}
        activePlayerName={activePlayerName}
        isMyTurn={canEdit.current}
        turnSeconds={turnSeconds}
        turnEndsAtMs={turnEndsAtMs.current}
        charsUsed={turnCharsUsed}
        charBudget={activePlayerBudget}
        audienceVoted={Object.keys(currentVotes.current).length}
        audienceTotal={knownAudienceCount}
        players={playerOptions}
        currentVotes={currentVotes.current}
        votesByRound={votesByRound.current}
      />
    </div>
  </section>

  <section class="content-grid">
    <PlayerList players={playerRows} />

    <PlayerControls
      playerRoomKey={playerRoomKey.current}
      isConnected={isConnected.current}
      localReady={localReady.current}
      activeBudget={activeBudget.current}
      onPlayerRoomKeyInput={gameState.setPlayerRoomKey}
      onConnect={() => void gameState.connect()}
      onDisconnect={gameState.disconnect}
      onToggleReady={gameState.toggleReady}
    />

    <div class="below-fold-info">
      <GameInfo
        status={statusMessage.current}
        phase={phase.current}
        round={round.current}
        activePlayer={activePlayerPubKey.current ? gameState.short(activePlayerPubKey.current) : 'none'}
        turnSeconds={turnSeconds}
        voteSeconds={voteSeconds}
        me={identity.current ? gameState.short(identity.current.publicKey) : '...'}
      />
    </div>
  </section>
</main>

<style>
  .page-shell {
    --top-bar-h: 52px;
    --info-band-h: 96px;
    min-height: 100svh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    color: #eff4ff;
    background: #0b1220;
  }

  header {
    display: flex;
    justify-content: space-between;
    padding: 0.6rem 0.75rem;
    background: #0f1826;
    border-bottom: 1px solid #223349;
  }

  .route {
    font-family: monospace;
  }

  .hero {
    min-height: calc(100svh - var(--top-bar-h));
    display: grid;
    grid-template-rows: minmax(180px, calc(100svh - var(--top-bar-h) - var(--info-band-h))) var(--info-band-h);
  }

  .viewer-wrap {
    min-height: 0;
    height: calc(100svh - var(--top-bar-h) - var(--info-band-h));
  }

  .content-grid {
    padding: 0.75rem;
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .info-band {
    padding: 0.55rem 0.75rem 0.7rem;
    display: grid;
    grid-template-columns: 1fr;
    background: #0e1622;
    border-top: 1px solid #223349;
    height: var(--info-band-h);
    overflow: hidden;
    align-items: stretch;
  }

  .content-grid {
    align-content: start;
  }

  .below-fold-info {
    grid-column: 1 / -1;
  }

  button {
    border: 1px solid #2d4f6f;
    background: #16314a;
    color: #d8ecff;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
  }

  @media (max-width: 1000px) {
    .page-shell {
      --info-band-h: 154px;
    }

    .hero {
      min-height: calc(100svh - var(--top-bar-h));
      grid-template-rows: minmax(180px, calc(100svh - var(--top-bar-h) - var(--info-band-h))) var(--info-band-h);
    }

    .content-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .page-shell {
      --info-band-h: 188px;
    }

    .content-grid {
      padding: 0.55rem;
      gap: 0.55rem;
    }

    .info-band {
      padding: 0.45rem 0.55rem 0.6rem;
    }
  }
</style>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte'

  type PlayerOption = {
    pubKey: string
    name: string
  }

  let {
    phase,
    activePlayerName,
    isMyTurn,
    turnSeconds,
    turnEndsAtMs = null,
    charsUsed,
    charBudget,
    audienceVoted,
    audienceTotal,
    players,
    currentVotes,
    votesByRound,
    canVote = false,
    onVote,
  }: {
    phase: string
    activePlayerName: string
    isMyTurn: boolean
    turnSeconds: string
    turnEndsAtMs?: number | null
    charsUsed: number
    charBudget: number
    audienceVoted: number
    audienceTotal: number
    players: PlayerOption[]
    currentVotes: Record<string, string>
    votesByRound: Record<number, Record<string, string>>
    canVote?: boolean
    onVote?: (pubKey: string) => void
  } = $props()

  const roundVotesByPlayer = $derived(
    (() => {
      const result = players.reduce<Record<string, number>>((acc, player) => {
        acc[player.pubKey] = 0
        return acc
      }, {})

      Object.values(currentVotes).forEach((votedFor) => {
        if (result[votedFor] !== undefined) {
          result[votedFor] += 1
        }
      })

      return result
    })(),
  )

  const totalVotesByPlayer = $derived(
    (() => {
      const result = players.reduce<Record<string, number>>((acc, player) => {
        acc[player.pubKey] = 0
        return acc
      }, {})

      Object.values(votesByRound).forEach((roundVotes) => {
        Object.values(roundVotes).forEach((votedFor) => {
          if (result[votedFor] !== undefined) {
            result[votedFor] += 1
          }
        })
      })

      return result
    })(),
  )

  const scoreRows = $derived(
    (() => {
      const maxTotal = Math.max(0, ...players.map((player) => totalVotesByPlayer[player.pubKey] ?? 0))
      const maxRound = Math.max(0, ...players.map((player) => roundVotesByPlayer[player.pubKey] ?? 0))

      return players.map((player) => {
        const totalVotes = totalVotesByPlayer[player.pubKey] ?? 0
        const roundVotes = roundVotesByPlayer[player.pubKey] ?? 0
        return {
          ...player,
          totalVotes,
          roundVotes,
          isGameLeader: totalVotes === maxTotal && maxTotal > 0,
          isRoundLeader: roundVotes === maxRound && maxRound > 0,
        }
      })
    })(),
  )

  let clockNowMs = $state(Date.now())
  let clockTimer: ReturnType<typeof setInterval> | null = null

  onMount(() => {
    clockTimer = setInterval(() => {
      clockNowMs = Date.now()
    }, 500)
  })

  onDestroy(() => {
    if (clockTimer !== null) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  })

  const liveTurnSeconds = $derived(
    turnEndsAtMs === null ? turnSeconds : Math.max(0, Math.ceil((turnEndsAtMs - clockNowMs) / 1000)).toString(),
  )

  const statusText = $derived(
    phase === 'lobby'
      ? 'Waiting for game to start ...'
      : phase === 'turn'
        ? `${isMyTurn ? 'Your turn' : `${activePlayerName}'s turn`}: ${liveTurnSeconds}s, ${charsUsed}/${charBudget} characters`
        : phase === 'voting'
          ? `Voting ... ${audienceVoted}/${audienceTotal} audience members voted.`
          : 'Game ended.',
  )
</script>

<div class="panel">
  <div class="status-row">
    <p class="status">{statusText}</p>
    <div class="audience-meta" aria-label="Audience count">
      <span>Audience {audienceTotal}</span>
      <span>Voted {audienceVoted}</span>
    </div>
  </div>

  {#if canVote}
    <div class="vote-actions">
      {#each players as player}
        <button type="button" onclick={() => onVote?.(player.pubKey)}>{player.name}</button>
      {/each}
    </div>
  {/if}

  <div class="score-strip" role="list">
    {#if scoreRows.length === 0}
      <span class="empty">No players yet.</span>
    {:else}
      {#each scoreRows as row (row.pubKey)}
        <span class="score-pill" class:game-leader={row.isGameLeader} class:round-leader={row.isRoundLeader} role="listitem">
          <strong>{row.name}</strong>
          <span>Total {row.totalVotes}</span>
          <span>Round {row.roundVotes}</span>
        </span>
      {/each}
    {/if}
  </div>
</div>

<style>
  .panel {
    height: 100%;
    border: 1px solid #2b455f;
    background:
      linear-gradient(145deg, rgba(15, 30, 49, 0.9), rgba(8, 18, 30, 0.95)),
      radial-gradient(circle at 12% 25%, rgba(120, 184, 255, 0.14), transparent 50%);
    padding: 0.55rem 0.65rem;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.42rem;
    overflow: hidden;
  }

  .status {
    margin: 0;
    font-size: 0.9rem;
    color: #e7f2ff;
    letter-spacing: 0.01em;
  }

  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.7rem;
  }

  .audience-meta {
    display: flex;
    gap: 0.5rem;
    font-family: monospace;
    font-size: 0.75rem;
    color: #a6c1dc;
    white-space: nowrap;
  }

  .score-strip {
    display: flex;
    gap: 0.45rem;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0.12rem;
    align-items: stretch;
  }

  .vote-actions {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 0.35rem;
    padding-bottom: 0.1rem;
  }

  button {
    border: 1px solid #2d4f6f;
    background: #16314a;
    color: #d8ecff;
    padding: 0.32rem 0.55rem;
    cursor: pointer;
    white-space: nowrap;
    font-family: monospace;
    font-size: 0.74rem;
  }

  .score-pill {
    min-width: 160px;
    border: 1px solid #2a3f59;
    background: rgba(8, 20, 33, 0.85);
    color: #dcecff;
    padding: 0.36rem 0.5rem;
    display: grid;
    gap: 0.16rem;
    font-family: monospace;
    font-size: 0.76rem;
  }

  .score-pill strong {
    font-size: 0.79rem;
    color: #f4fbff;
  }

  .score-pill.game-leader {
    background: rgba(26, 56, 34, 0.88);
    border-color: #56bb6a;
  }

  .score-pill.round-leader {
    box-shadow: inset 0 0 0 2px rgba(255, 196, 93, 0.75);
  }

  .empty {
    color: #9eb8d2;
    font-family: monospace;
    font-size: 0.78rem;
  }

  @media (max-width: 720px) {
    .status-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }

    .audience-meta {
      font-size: 0.72rem;
    }

    .status {
      font-size: 0.8rem;
    }

    .score-pill {
      min-width: 138px;
      font-size: 0.72rem;
    }
  }
</style>

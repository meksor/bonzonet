<script lang="ts">
  type PlayerRow = {
    pubKey: string
    name: string
    budget: number
    isReady: boolean
    isOnline: boolean
    isDone: boolean
  }

  let { players }: { players: PlayerRow[] } = $props()
</script>

<div class="panel">
  <h3>Players</h3>
  {#if players.length === 0}
    <p>none</p>
  {:else}
    <ul class="rows">
      {#each players as player}
        <li>
          <span class="name">{player.name}</span>
          <span>{player.pubKey}</span>
          <span>b:{player.budget}</span>
          <span>{player.isReady ? 'rdy' : 'wait'}</span>
          <span>{player.isOnline ? 'on' : 'off'}</span>
          <span>{player.isDone ? 'done' : 'act'}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .panel {
    background: #0e1e33;
    border: 1px solid #253d59;
    padding: 0.55rem 0.65rem;
    display: grid;
    gap: 0.35rem;
  }

  h3 {
    margin: 0;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #b6cae0;
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.24rem;
    font-family: monospace;
    font-size: 0.74rem;
  }

  li {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.3fr) auto auto auto auto;
    gap: 0.3rem;
    align-items: center;
    border: 1px solid #21354e;
    background: #0a1728;
    padding: 0.24rem 0.34rem;
    white-space: nowrap;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    color: #dbe8f6;
  }

  li span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 760px) {
    li {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      row-gap: 0.18rem;
    }
  }
</style>

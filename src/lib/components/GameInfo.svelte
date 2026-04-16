<script lang="ts">
  let {
    status,
    phase,
    round,
    activePlayer,
    turnSeconds,
    voteSeconds,
    me,
    compact = false,
  }: {
    status: string
    phase: string
    round: number
    activePlayer: string
    turnSeconds: string
    voteSeconds: string
    me: string
    compact?: boolean
  } = $props()
</script>

<div class="panel" class:compact>
  <div class="grid">
    <div class="stat">
      <span class="label">Status</span>
      <span class="value">{status}</span>
    </div>
    <div class="stat">
      <span class="label">Phase</span>
      <span class="value">{phase}</span>
    </div>
    <div class="stat">
      <span class="label">Round</span>
      <span class="value">{round}</span>
    </div>
    <div class="stat">
      <span class="label">Active</span>
      <span class="value">{activePlayer}</span>
    </div>
    <div class="stat">
      <span class="label">Turn</span>
      <span class="value">{turnSeconds}s</span>
    </div>
    <div class="stat">
      <span class="label">Vote</span>
      <span class="value">{voteSeconds}s</span>
    </div>
    <div class="stat">
      <span class="label">Me</span>
      <span class="value">{me}</span>
    </div>
  </div>
</div>

<style>
  .panel {
    background: #0e1e33;
    border: 1px solid #253d59;
    padding: 0.55rem 0.65rem;
    display: grid;
    gap: 0.35rem;
  }

  .panel.compact {
    height: 100%;
    overflow: hidden;
    align-content: start;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    gap: 0.35rem;
    font-family: monospace;
    font-size: 0.76rem;
  }

  .panel.compact .grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .stat {
    display: grid;
    gap: 0.08rem;
    padding: 0.32rem 0.4rem;
    border: 1px solid #21354e;
    background: #0a1728;
    min-width: 0;
  }

  .label {
    color: #89a5c2;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.64rem;
  }

  .value {
    color: #eff4ff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

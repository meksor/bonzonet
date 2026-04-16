<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import Router from 'svelte-spa-router'
  import Home from './pages/Home.svelte'
  import HostPage from './pages/HostPage.svelte'
  import PlayerPage from './pages/PlayerPage.svelte'
  import AudiencePage from './pages/AudiencePage.svelte'
  import { gameState } from './lib/game/state'

  const routes = {
    '/': Home,
    '/host': HostPage,
    '/player': PlayerPage,
    '/audience': AudiencePage,
  }

  onMount(() => {
    void gameState.init()
  })

  onDestroy(() => {
    gameState.destroy()
  })
</script>

<main>
  <Router {routes} />
</main>

<style>
  main {
    min-height: 100vh;
    background: #0b0f16;
  }
</style>

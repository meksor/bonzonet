<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import ShaderEditor from './ShaderEditor.svelte'
  import ShaderView from './ShaderView.svelte'

  type EditorDetail = CustomEvent<{ text: string; line: number }>
  type CompileDetail = CustomEvent<string>

  interface Props {
    fragmentShader: string
    editorValue?: string
    charBudget?: number
    editorEnabled?: boolean
    editorReadOnly?: boolean
    compileError?: string
    lastLine?: number
    showEditor?: boolean
    onConfirm?: (event: EditorDetail) => void
    onLiveChange?: (event: EditorDetail) => void
    onCompileError?: (event: CompileDetail) => void
  }

  let {
    fragmentShader,
    editorValue = '',
    charBudget = 0,
    editorEnabled = false,
    editorReadOnly = false,
    compileError = '',
    lastLine = 1,
    showEditor = false,
    onConfirm,
    onLiveChange,
    onCompileError,
  }: Props = $props()

  let overlayOpen = $state(false)
  let errorExpanded = $state(false)
  let previousError = ''
  let charsUsed = $state(0)

  const closeOverlay = () => {
    overlayOpen = false
  }

  const toggleOverlay = () => {
    if (!showEditor) return
    overlayOpen = !overlayOpen
  }

  const toggleErrorExpanded = () => {
    errorExpanded = !errorExpanded
  }

  const confirmFromTopBar = () => {
    if (!editorEnabled || editorReadOnly) return
    onConfirm?.(
      new CustomEvent('confirm', {
        detail: {
          text: editorValue,
          line: lastLine,
        },
      }),
    )
  }

  const handleCompileError = (event: CompileDetail) => {
    onCompileError?.(event)
  }

  const handleConfirm = (event: EditorDetail) => {
    onConfirm?.(event)
  }

  const handleUpdateUsage = (event: CustomEvent<number>) => {
    charsUsed = event.detail
  }

  const handleLiveChange = (event: EditorDetail) => {
    onLiveChange?.(event)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!showEditor) return
    if (event.defaultPrevented) return

    if (event.shiftKey && event.key === 'Enter') {
      if (editorReadOnly) return
      event.preventDefault()
      confirmFromTopBar()
      return
    }

    if (event.key === 'F1') {
      event.preventDefault()
      toggleOverlay()
      return
    }

    if (event.key === 'Escape') {
      closeOverlay()
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  $effect(() => {
    if (!compileError || compileError === previousError) return
    errorExpanded = false
    previousError = compileError
  })

  $effect(() => {
    if (!showEditor || !editorReadOnly) return
    if (!overlayOpen) {
      overlayOpen = true
    }
  })

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
</script>

<div class="stage-shell" class:overlay-active={showEditor && overlayOpen}>
  <ShaderView fragmentShader={fragmentShader} on:compileerror={handleCompileError} />

  {#if showEditor && !editorReadOnly}
    <div class="stage-actions">
      <button class="stage-action" type="button" onclick={toggleOverlay}>Toggle Editor (F1)</button>
      <button class="stage-action" type="button" onclick={confirmFromTopBar} disabled={!editorEnabled}>
        Confirm Shader (Shift+Enter)
      </button>
    </div>
  {/if}

  {#if showEditor && overlayOpen}
    <div class="editor-overlay">
      <div class="overlay-header">
        <div>
          <h3>Shader Editor</h3>
          <p>{editorReadOnly ? 'Read-only shader code feed for audience.' : 'F1 toggles overlay mode. Shift+Enter confirms shader.'}</p>
        </div>
      </div>

      <ShaderEditor
        value={editorValue}
        charBudget={charBudget}
        disabled={!editorEnabled}
        autofocus={true}
        compileError={compileError}
        on:updateUsage={handleUpdateUsage}
        on:confirm={handleConfirm}
        on:livechange={handleLiveChange}
      />

      <div class="overlay-footer">
      <span class:over-budget={charsUsed > charBudget}>{charsUsed} / {charBudget}</span>
        {#if compileError}
          <button class="error-toggle" type="button" onclick={toggleErrorExpanded}>
            {errorExpanded ? 'Hide' : 'Show'} Compile Error
          </button>
          {#if errorExpanded}
            <p class="error">{compileError}</p>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .stage-shell {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-bottom: 1px solid #223349;
    background: #000;
  }

  .overlay-active::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(3, 8, 15, 0.35);
    pointer-events: none;
  }

  .stage-actions {
    position: absolute;
    top: 0.9rem;
    right: 0.9rem;
    display: flex;
    gap: 0.5rem;
    z-index: 20;
  }

  .stage-action {
    border: 1px solid #42678b;
    background: rgba(11, 24, 39, 0.82);
    color: #eff4ff;
    padding: 0.4rem 0.7rem;
    cursor: pointer;
    backdrop-filter: blur(10px);
  }

  .stage-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }


  .editor-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0.7rem;
    padding: 0.9rem;
  }

  .overlay-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 0.8rem;
  }

  h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .overlay-header p,
  .error {
    margin: 0;
    font-family: monospace;
    font-size: 0.78rem;
  }

  .overlay-header p {
    color: #b5c8dd;
  }

  .overlay-footer {
    display: grid;
    gap: 0.35rem;
  }
  
  .over-budget {
    color: #d44949;
  }

  .error {
    padding: 0.5rem 0.6rem;
    border: 1px solid #7a3d47;
    background: rgba(70, 36, 42, 0.96);
    color: #ffd1d1;
    white-space: pre-wrap;
  }

  .error-toggle {
    justify-self: start;
    border: 1px solid #456482;
    background: rgba(11, 24, 39, 0.78);
    color: #d9e7f6;
    padding: 0.28rem 0.52rem;
    font-family: monospace;
    font-size: 0.74rem;
  }

  button {
    border: 1px solid #2d4f6f;
    background: #16314a;
    color: #d8ecff;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
  }

  @media (max-width: 720px) {
    .editor-overlay {
      padding: 0.65rem;
      gap: 0.55rem;
    }

    .overlay-header {
      grid-template-columns: 1fr;
      display: grid;
    }

    .stage-actions {
      right: 0.65rem;
      top: 0.65rem;
    }
  }
</style>
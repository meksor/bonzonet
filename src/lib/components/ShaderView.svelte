<script lang="ts">
  import { onDestroy, onMount, createEventDispatcher } from 'svelte'
  import { createProgramInfo, createBufferInfoFromArrays, setBuffersAndAttributes, setUniforms, drawBufferInfo, resizeCanvasToDisplaySize } from 'twgl.js'
  import { wrapFragmentShader } from '../game/shaderCompile'

  export const FALLBACK_SHADER = `precision mediump float;
uniform float time;
uniform vec2 resolution;
void main(out vec4 color, in vec2 coord) {
  vec2 uv = coord / resolution;
  color = vec4(uv.x, uv.y, sin(time) * 0.5 + 0.5, 1.0);
}`

  const VERTEX_SHADER = `attribute vec4 position;
void main() {
  gl_Position = position;
}`

  const dispatch = createEventDispatcher<{ compileerror: string }>()

  let { fragmentShader = FALLBACK_SHADER }: { fragmentShader: string } = $props()

  let canvas: HTMLCanvasElement
  let gl: WebGLRenderingContext | null = null
  let bufferInfo: ReturnType<typeof createBufferInfoFromArrays> | null = null
  let programInfo: ReturnType<typeof createProgramInfo> | null = null
  let animationFrame = 0
  let startTime = 0
  let lastCompiledSource = ''

  const tryCompile = (source: string) => {
    if (!gl) return

    let compileError = ''
    const candidate = createProgramInfo(gl, [VERTEX_SHADER, wrapFragmentShader(source)], {
      errorCallback: (error) => {
        compileError = error
      },
    })

    if (!candidate) {
      dispatch('compileerror', compileError || 'Shader compilation failed.')
      return
    }

    if (programInfo?.program) {
      gl.deleteProgram(programInfo.program)
    }
    programInfo = candidate
    lastCompiledSource = source
  }

  const render = (now: number) => {
    if (!gl || !bufferInfo || !programInfo) {
      animationFrame = requestAnimationFrame(render)
      return
    }

    if (resizeCanvasToDisplaySize(gl.canvas as HTMLCanvasElement)) {
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    }

    gl.useProgram(programInfo.program)
    setBuffersAndAttributes(gl, programInfo, bufferInfo)
    setUniforms(programInfo, {
      time: (now - startTime) * 0.001,
      resolution: [gl.canvas.width, gl.canvas.height],
    })
    drawBufferInfo(gl, bufferInfo)

    animationFrame = requestAnimationFrame(render)
  }

  onMount(() => {
    gl = canvas.getContext('webgl')
    if (!gl) {
      dispatch('compileerror', 'WebGL is not supported in this browser.')
      return
    }

    bufferInfo = createBufferInfoFromArrays(gl, {
      position: {
        numComponents: 2,
        data: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
      },
    })

    const initialSource = fragmentShader || FALLBACK_SHADER
    tryCompile(initialSource)
    if (!programInfo) {
      tryCompile(FALLBACK_SHADER)
    }

    startTime = performance.now()
    animationFrame = requestAnimationFrame(render)
  })

  $effect(() => {
    if (!gl) return

    const nextSource = fragmentShader || FALLBACK_SHADER
    if (nextSource === lastCompiledSource) return

    tryCompile(nextSource)
  })

  onDestroy(() => {
    cancelAnimationFrame(animationFrame)
    if (programInfo?.program && gl) {
      gl.deleteProgram(programInfo.program)
    }
  })
</script>

<canvas bind:this={canvas} class="shader-view" aria-label="Shader output"></canvas>

<style>
  .shader-view {
    width: 100%;
    height: 100%;
    display: block;
    background: black;
  }
</style>

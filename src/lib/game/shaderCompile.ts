const VERTEX_SHADER = `attribute vec4 position;\nvoid main() {\n  gl_Position = position;\n}`

/**
 * Wraps a shadertoy-style fragment shader:
 *   void main(out vec4 color, in vec2 coord) { ... }
 * into a valid WebGL fragment shader by renaming it to mainImage and
 * injecting a real void main() that bridges gl_FragColor / gl_FragCoord.
 */
export const wrapFragmentShader = (source: string): string => {
  // Match `void main(` with optional whitespace, handling both shadertoy style and plain style
  const shadertoyRe = /void\s+main\s*\(\s*out\s+vec4\s+\w+\s*,\s*in\s+vec2\s+\w+\s*\)/
  if (!shadertoyRe.test(source)) return source

  const wrapped = source.replace(
    /void\s+main\s*\(/,
    'void mainImage('
  )
  return wrapped + `\nvoid main() {\n  vec4 _fragColor;\n  mainImage(_fragColor, gl_FragCoord.xy);\n  gl_FragColor = _fragColor;\n}`
}

let cachedCanvas: HTMLCanvasElement | null = null
let cachedGl: WebGLRenderingContext | null = null

const getValidationContext = (): WebGLRenderingContext | null => {
  if (cachedGl && !cachedGl.isContextLost()) return cachedGl
  cachedCanvas = document.createElement('canvas')
  cachedGl = cachedCanvas.getContext('webgl')
  return cachedGl
}

export const validateFragmentShader = (source: string): { ok: true } | { ok: false; error: string } => {
  const gl = getValidationContext()

  if (!gl) {
    return { ok: false, error: 'WebGL not available in this browser.' }
  }

  const compileShader = (type: number, code: string) => {
    const shader = gl.createShader(type)
    if (!shader) {
      return { shader: null, error: 'Failed to create shader.' }
    }

    gl.shaderSource(shader, code)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || 'Unknown shader compile error.'
      gl.deleteShader(shader)
      return { shader: null, error }
    }

    return { shader, error: '' }
  }

  const vert = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER)
  if (!vert.shader) {
    return { ok: false, error: vert.error }
  }

  const frag = compileShader(gl.FRAGMENT_SHADER, wrapFragmentShader(source))
  if (!frag.shader) {
    gl.deleteShader(vert.shader)
    return { ok: false, error: frag.error }
  }

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vert.shader)
    gl.deleteShader(frag.shader)
    return { ok: false, error: 'Failed to create shader program.' }
  }

  gl.attachShader(program, vert.shader)
  gl.attachShader(program, frag.shader)
  gl.linkProgram(program)

  const linked = gl.getProgramParameter(program, gl.LINK_STATUS)
  const linkError = gl.getProgramInfoLog(program) || 'Unknown program link error.'

  gl.deleteProgram(program)
  gl.deleteShader(vert.shader)
  gl.deleteShader(frag.shader)

  if (!linked) {
    return { ok: false, error: linkError }
  }

  return { ok: true }
}

/**
 * Live camera decoder: Annex-B H.264 off a WebSocket, straight into WebCodecs.
 *
 * Ported from OverDrive's own SotaPlayer, keeping the parts that matter and
 * dropping the two software fallbacks (JMuxer/MSE and Broadway). Those exist in
 * OD to cover old WebViews; this app can just say "not supported" and point at
 * OD's viewer, which is a far smaller thing to carry than an asm.js decoder.
 *
 * Wire format is bare Annex-B — no container, no framing header — so a socket
 * message may hold several NAL units, or part of one.
 */

export type PlayerState = 'connecting' | 'live' | 'stopped' | 'error'

export interface PlayerHandle {
  stop(): void
  /** Change dewarp strength (0-100) without touching the stream. */
  setStrength(v: number): void
}

/*
 * Lens dewarp, ported verbatim from OverDrive's GpuMosaicRecorder shader.
 *
 * OD's own correction never reaches this stream: recording.rectifyStrength is
 * applied in the RECORDER, and blindspot.rectifyStrength drives a separate
 * pipeline with its own encoder and socket ("completely separate from the
 * /api/stream/* live-view stream", per StreamingApiHandler). So the same maths
 * runs here instead, on the decoded frame.
 *
 * strength 0..100 -> k1 = 0.30t, k2 = 0.10t, which is OD's 3:1 split; 0 is
 * bit-exact identity, so the shader can run unconditionally.
 */
const VERT = `attribute vec2 aPos;varying vec2 vUV;
void main(){vUV=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}`

const FRAG = `precision mediump float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform float uK1, uK2, uAspect;
void main(){
  vec2 t = vec2(vUV.x, 1.0 - vUV.y);
  vec2 n = t * 2.0 - 1.0;
  vec2 na = vec2(n.x, n.y * uAspect);
  float r2 = dot(na, na);
  float r4 = r2 * r2;
  float invDenom = 1.0 / (1.0 + uK1 * r2 + uK2 * r4);
  float a2 = uAspect * uAspect;
  float zoom = 1.0 + uK1 * a2 + uK2 * a2 * a2;
  vec2 sa = (na * invDenom) * zoom;
  vec2 src = vec2(sa.x, sa.y / uAspect);
  vec2 uv = src * 0.5 + 0.5;
  gl_FragColor = texture2D(uTex, uv);
}`

interface Renderer {
  draw(frame: VideoFrame): void
  setStrength(v: number): void
  destroy(): void
}

/** WebGL renderer; returns null if WebGL is unavailable so the 2D path can run. */
function makeGlRenderer(canvas: HTMLCanvasElement, strength: number): Renderer | null {
  const gl = canvas.getContext('webgl', { alpha: false, preserveDrawingBuffer: false })
  if (!gl) return null

  function shader(type: number, src: string) {
    const sh = gl!.createShader(type)!
    gl!.shaderSource(sh, src)
    gl!.compileShader(sh)
    return gl!.getShaderParameter(sh, gl!.COMPILE_STATUS) ? sh : null
  }
  const vs = shader(gl.VERTEX_SHADER, VERT)
  const fs = shader(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  // CLAMP_TO_EDGE matters: the dewarp samples outside [0,1] at the corners, and
  // repeating there would wrap the opposite edge into frame.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const uK1 = gl.getUniformLocation(prog, 'uK1')
  const uK2 = gl.getUniformLocation(prog, 'uK2')
  const uAspect = gl.getUniformLocation(prog, 'uAspect')
  let k1 = 0
  let k2 = 0
  const apply = (v: number) => {
    const t = Math.max(0, Math.min(100, v)) / 100
    k1 = 0.3 * t
    k2 = 0.1 * t
  }
  apply(strength)

  return {
    draw(frame) {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)
      gl.uniform1f(uK1, k1)
      gl.uniform1f(uK2, k2)
      // Per-tile aspect (height/width) — 0.75 for the 4:3 camera tiles OD
      // assumes, but taken from the frame so a different profile still lines up.
      gl.uniform1f(uAspect, canvas.height / Math.max(1, canvas.width))
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    setStrength: apply,
    destroy() {
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    },
  }
}

export function webCodecsSupported(): boolean {
  return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined'
}

/** Split a buffer on Annex-B start codes (00 00 01 or 00 00 00 01). */
function splitNalUnits(data: Uint8Array): Uint8Array[] {
  const units: Uint8Array[] = []
  let start = -1
  for (let i = 0; i + 2 < data.length; i++) {
    const three = data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1
    const four = i + 3 < data.length && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1
    if (!three && !four) continue
    if (start >= 0) units.push(data.subarray(start, i))
    start = i
    i += four ? 3 : 2
  }
  if (start >= 0) units.push(data.subarray(start))
  else if (data.length) units.push(data)
  return units
}

/** Offset of the NAL header byte, past the start code. */
function payloadStart(nal: Uint8Array): number {
  if (nal[0] === 0 && nal[1] === 0 && nal[2] === 0 && nal[3] === 1) return 4
  if (nal[0] === 0 && nal[1] === 0 && nal[2] === 1) return 3
  return -1
}

/**
 * Codec string from the SPS itself.
 *
 * The encoder is ASKED for Baseline but MediaFormat.KEY_PROFILE is only a
 * request — plenty of devices emit Main or High anyway. A decoder configured
 * for Baseline and then fed High chunks is exactly the case that decodes fine
 * on a lenient desktop decoder and rejects every frame on a stricter mobile
 * one, so the profile is read from the bitstream rather than assumed.
 */
function codecFromSps(sps: Uint8Array): string {
  const p = payloadStart(sps)
  if (p < 0 || sps.length < p + 4) return 'avc1.42C01F'
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `avc1.${hex(sps[p + 1])}${hex(sps[p + 2])}${hex(sps[p + 3])}`
}

function sameBytes(a: Uint8Array | null, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function startPlayer(opts: {
  url: string
  canvas: HTMLCanvasElement
  strength?: number
  onState: (s: PlayerState, detail?: string) => void
}): PlayerHandle {
  const { url, canvas, onState } = opts
  let renderer = makeGlRenderer(canvas, opts.strength ?? 0)
  // WebGL missing (or blocked) is not fatal: fall back to a plain 2D blit, which
  // simply cannot dewarp.
  const ctx = renderer ? null : canvas.getContext('2d')
  let ws: WebSocket | null = null
  let decoder: VideoDecoder | null = null
  let sps: Uint8Array | null = null
  let pps: Uint8Array | null = null
  let gotKeyframe = false
  let stopped = false
  let painted = false
  let errors = 0

  function fail(detail: string) {
    if (stopped) return
    stopped = true
    cleanup()
    onState('error', detail)
  }

  function paint(frame: VideoFrame) {
    if (stopped || (!renderer && !ctx)) {
      frame.close()
      return
    }
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth
      canvas.height = frame.displayHeight
    }
    if (renderer) renderer.draw(frame)
    else ctx!.drawImage(frame, 0, 0)
    frame.close()
    if (!painted) {
      painted = true
      onState('live') // a decoded frame is the only honest proof it works
    }
  }

  /** Try progressively less demanding configs — some Mali/Adreno builds reject
   *  hardware acceleration outright rather than falling back on their own. */
  function configure(codec: string): boolean {
    const attempts: VideoDecoderConfig[] = [
      { codec, hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true },
      { codec, optimizeForLatency: true },
      { codec: 'avc1.42C01F', optimizeForLatency: true },
    ]
    for (const cfg of attempts) {
      try {
        decoder!.configure(cfg)
        return true
      } catch {
        /* try the next one */
      }
    }
    return false
  }

  function decodeChunk(data: Uint8Array, key: boolean) {
    if (stopped || !decoder) return
    try {
      decoder.decode(
        new EncodedVideoChunk({
          type: key ? 'key' : 'delta',
          timestamp: performance.now() * 1000,
          data,
        }),
      )
    } catch {
      // decode() throws synchronously when the decoder is in a bad state.
      // Tolerate a few — a transient error right after a config change is
      // normal — but do not sit on a black canvas forever.
      if (++errors > 40 && !painted) fail('decode failed')
    }
  }

  /** A keyframe must carry its SPS/PPS or the decoder has nothing to configure from. */
  function withParamSets(idr: Uint8Array): Uint8Array {
    const out = new Uint8Array((sps?.length ?? 0) + (pps?.length ?? 0) + idr.length)
    let o = 0
    if (sps) { out.set(sps, o); o += sps.length }
    if (pps) { out.set(pps, o); o += pps.length }
    out.set(idr, o)
    return out
  }

  function onNal(nal: Uint8Array) {
    const p = payloadStart(nal)
    if (p < 0) return
    const type = nal[p] & 0x1f

    if (type === 7) {
      if (sps && !sameBytes(sps, nal)) {
        // Resolution/quality switch — the old config no longer describes the
        // stream, so reset and wait for the next keyframe.
        sps = nal
        gotKeyframe = false
        try {
          decoder!.reset()
          configure(codecFromSps(nal))
        } catch { /* next keyframe will retry */ }
        return
      }
      if (!sps) {
        sps = nal
        const real = codecFromSps(nal)
        try {
          decoder!.reset()
          if (!configure(real)) fail('codec unsupported')
        } catch { /* ignore */ }
      }
      return
    }
    if (type === 8) { pps = nal; return }

    if (type === 5) {
      if (!sps) return // cannot configure yet; drop until the SPS arrives
      decodeChunk(withParamSets(nal), true)
      gotKeyframe = true
      return
    }
    if (type === 1 && gotKeyframe) decodeChunk(nal, false)
  }

  function cleanup() {
    try { renderer?.destroy() } catch { /* context may already be lost */ }
    renderer = null
    try { ws?.close() } catch { /* already closing */ }
    ws = null
    try { if (decoder && decoder.state !== 'closed') decoder.close() } catch { /* ignore */ }
    decoder = null
  }

  if (!webCodecsSupported()) {
    onState('error', 'unsupported')
    return { stop() {}, setStrength() {} }
  }

  decoder = new VideoDecoder({
    output: paint,
    error: () => { if (!painted) fail('decoder error') },
  })
  // Provisional: the real profile comes from the first SPS, above.
  configure('avc1.42C01F')

  onState('connecting')
  try {
    ws = new WebSocket(url)
  } catch {
    fail('connect failed')
    return { stop() {}, setStrength() {} }
  }
  ws.binaryType = 'arraybuffer'
  ws.onmessage = (e) => {
    if (stopped || !(e.data instanceof ArrayBuffer)) return
    for (const nal of splitNalUnits(new Uint8Array(e.data))) onNal(nal)
  }
  ws.onerror = () => { if (!painted) fail('connect failed') }
  ws.onclose = () => {
    if (stopped) return
    stopped = true
    cleanup()
    onState('stopped')
  }

  return {
    stop() {
      if (stopped) return
      stopped = true
      cleanup()
      onState('stopped')
    },
    // Live: no stream restart, the next frame just renders with new coefficients.
    setStrength(v) {
      renderer?.setStrength(v)
    },
  }
}

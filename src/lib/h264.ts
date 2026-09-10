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
  /** 1 for a single camera, 2 for the 2x2 mosaic. */
  setTiles(n: number): void
}

/*
 * Lens dewarp.
 *
 * NOT OverDrive's model. OD's rectify is a two-term radial polynomial capped at
 * k1=0.30 / k2=0.10, and its own documentation calls it a fix for the "residual
 * fisheye barrel curve" — a finishing pass on tiles that are already close to
 * rectilinear. Ported faithfully and run against these cameras it does almost
 * nothing: at full strength the horizontal edge pulls in ~14% while a 1.2x zoom
 * is applied on top, so the picture just crops. The BYD lenses are true ~180°
 * fisheyes with the image circle visible in frame, which is a different problem.
 *
 * This is the rectilinear unwrap for that case, derived rather than guessed.
 * An equidistant fisheye puts a ray at angle θ at radius rs = θ/B; a
 * rectilinear projection puts the same ray at ro = tan θ / tan B. A fragment
 * shader maps OUTPUT to SOURCE, so inverting gives
 *
 *     rs = rmax * atan(u * tan A) / A
 *
 * with u normalised so the CORNER is 1, not the edge — normalising to the edge
 * sends corners past the source, where CLAMP_TO_EDGE smears them.
 *
 * The direction matters and is easy to get backwards: this samples FURTHER OUT
 * at mid radii, so source 0.66..1 is spread across the outer half of the frame.
 * That is what un-squeezes a fisheye. The mirror form, tan(u·A)/tan(A), does
 * the opposite — magnifies the centre and compresses the rim — which looks
 * straighter only because it shows a narrower field, and reads as a plain zoom.
 *
 * As A -> 0 the ratio tends to u, so zero is exact identity and "off" needs no
 * branch. u=1 is a fixed point, so the frame corners hold and nothing is
 * cropped, unlike OD's zoom-to-fill.
 *
 * uTiles handles the mosaic view: it is a 2x2 of four separate cameras, so one
 * radial correction across the whole frame would be meaningless — each lens has
 * its own optical centre. With uTiles=2 the maths runs per tile, which is what
 * OD's rectifyTile() does for the same reason.
 */
const VERT = `attribute vec2 aPos;varying vec2 vUV;
void main(){vUV=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}`

const FRAG = `precision highp float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform float uA, uAspect, uTiles;
void main(){
  vec2 t = vec2(vUV.x, 1.0 - vUV.y);
  // Per-tile: which cell we are in, and the position inside it.
  vec2 cell = floor(t * uTiles);
  vec2 local = t * uTiles - cell;
  vec2 n = local * 2.0 - 1.0;
  vec2 na = vec2(n.x, n.y * uAspect);
  float r = length(na);
  float rmax = sqrt(1.0 + uAspect * uAspect);
  float rs;
  if (uA < 0.0001) {
    rs = r;
  } else {
    rs = rmax * atan((r / rmax) * tan(uA)) / uA;
  }
  vec2 dir = r > 0.000001 ? na / r : vec2(0.0);
  vec2 sa = dir * rs;
  vec2 src = vec2(sa.x, sa.y / uAspect);
  vec2 localOut = src * 0.5 + 0.5;
  // Keep every sample inside its own cell, so a corrected tile can never bleed
  // into its neighbour.
  localOut = clamp(localOut, 0.0, 1.0);
  vec2 uv = (cell + localOut) / uTiles;
  gl_FragColor = texture2D(uTex, uv);
}`

interface Renderer {
  draw(frame: VideoFrame): void
  setStrength(v: number): void
  /** 1 for a single camera, 2 for the 2x2 mosaic. */
  setTiles(n: number): void
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

  const uA = gl.getUniformLocation(prog, 'uA')
  const uAspect = gl.getUniformLocation(prog, 'uAspect')
  const uTiles = gl.getUniformLocation(prog, 'uTiles')
  let a = 0
  let tiles = 1
  /** 0-100 -> 0..1.30 rad (~75°). Beyond that tan(A) runs away and the corners
   *  stretch into mush faster than the middle gains anything. */
  const apply = (v: number) => {
    a = (Math.max(0, Math.min(100, v)) / 100) * 1.3
  }
  apply(strength)

  return {
    draw(frame) {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame)
      gl.uniform1f(uA, a)
      gl.uniform1f(uTiles, tiles)
      // Per-tile aspect (height/width) — 0.75 for the 4:3 camera tiles OD
      // assumes, but taken from the frame so a different profile still lines up.
      gl.uniform1f(uAspect, canvas.height / Math.max(1, canvas.width))
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    setStrength: apply,
    setTiles(n: number) { tiles = n >= 2 ? 2 : 1 },
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
  tiles?: number
  onState: (s: PlayerState, detail?: string) => void
}): PlayerHandle {
  const { url, canvas, onState } = opts
  let renderer = makeGlRenderer(canvas, opts.strength ?? 0)
  renderer?.setTiles(opts.tiles ?? 1)
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
    return { stop() {}, setStrength() {}, setTiles() {} }
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
    return { stop() {}, setStrength() {}, setTiles() {} }
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
    setTiles(n) {
      renderer?.setTiles(n)
    },
  }
}

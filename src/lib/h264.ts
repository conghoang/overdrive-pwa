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
  onState: (s: PlayerState, detail?: string) => void
}): PlayerHandle {
  const { url, canvas, onState } = opts
  const ctx = canvas.getContext('2d')
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
    if (stopped || !ctx) {
      frame.close()
      return
    }
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth
      canvas.height = frame.displayHeight
    }
    ctx.drawImage(frame, 0, 0)
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
    try { ws?.close() } catch { /* already closing */ }
    ws = null
    try { if (decoder && decoder.state !== 'closed') decoder.close() } catch { /* ignore */ }
    decoder = null
  }

  if (!webCodecsSupported()) {
    onState('error', 'unsupported')
    return { stop() {} }
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
    return { stop() {} }
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
  }
}

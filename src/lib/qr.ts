/**
 * QR scanning for the setup screen.
 *
 * The car's OverDrive dashboard renders a QR of its plain tunnel URL, so a scan
 * just needs to yield that string.
 *
 * Two decoders: the native BarcodeDetector (Chrome/Android — fast, nothing to
 * download) and jsQR as a fallback for Safari/Firefox, which don't implement it.
 * jsQR is imported lazily so browsers with the native API never pay for it.
 */

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

function nativeCtor(): BarcodeDetectorCtor | null {
  const c = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return typeof c === 'function' ? c : null
}

/**
 * Whether scanning can work here. Only needs a camera in a secure context —
 * decoding is covered either natively or by the jsQR fallback, so this is true
 * on Safari and Firefox too.
 */
export function qrSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
}

/**
 * The video cameras available to pick from. Labels and stable deviceIds are
 * only populated once camera permission has been granted, so this is worth
 * calling after a scan has actually started (see QrScanner.start's onStart).
 */
export async function listCameras(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'videoinput')
  } catch {
    return []
  }
}

export class QrScanner {
  private stream: MediaStream | null = null
  private raf: number | null = null
  private stopped = false
  private canvas: HTMLCanvasElement | null = null
  private video: HTMLVideoElement | null = null
  private onEnded: (() => void) | null = null

  /**
   * Open a camera, decode into `video`, and resolve with the first QR payload
   * found. Rejects if permission is denied or the camera dies.
   *
   * With no `deviceId` it asks for the rear camera; pass one to use a specific
   * camera (for switching). `onStart` fires once the stream is live, with the
   * camera that actually opened — the moment the camera list has real labels.
   */
  async start(
    video: HTMLVideoElement,
    opts?: { deviceId?: string; onStart?: (activeDeviceId?: string) => void },
  ): Promise<string> {
    this.stopped = false
    const stream = await navigator.mediaDevices.getUserMedia({
      video: opts?.deviceId
        ? { deviceId: { exact: opts.deviceId } }
        : { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    /*
     * The permission prompt can sit open for seconds, and the user may cancel
     * the scanner in that time. stop() ran while `stream` was still null, so it
     * had nothing to release — the tracks arrive here orphaned, with the phone's
     * camera indicator lit and no reference left that could ever turn it off.
     * Releasing them is the whole point of the check.
     */
    if (this.stopped) {
      stream.getTracks().forEach((t) => t.stop())
      throw new Error('cancelled')
    }
    this.stream = stream
    this.video = video
    video.srcObject = this.stream
    video.setAttribute('playsinline', 'true') // iOS: don't go fullscreen
    video.muted = true
    await video.play()

    // Camera is live now, so labels/deviceIds are populated — tell the caller
    // which one opened so it can offer a switch.
    if (!this.stopped) {
      opts?.onStart?.(stream.getVideoTracks()[0]?.getSettings?.().deviceId)
    }

    const Native = nativeCtor()
    const detector = Native ? new Native({ formats: ['qr_code'] }) : null
    // Safari/Firefox: pull in the JS decoder only when actually needed.
    const jsQR = detector ? null : (await import('jsqr')).default

    return new Promise<string>((resolve, reject) => {
      const finish = (val: string) => {
        this.stop()
        resolve(val)
      }

      const scan = async () => {
        if (this.stopped) return
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            if (detector) {
              const hits = await detector.detect(video)
              const val = hits.find((h) => h.rawValue)?.rawValue
              if (val) return finish(val)
            } else if (jsQR) {
              // Downscale: jsQR is O(pixels) and runs on the main thread.
              const w = 400
              const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w))
              if (!this.canvas) this.canvas = document.createElement('canvas')
              this.canvas.width = w
              this.canvas.height = h
              const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
              if (ctx) {
                ctx.drawImage(video, 0, 0, w, h)
                const img = ctx.getImageData(0, 0, w, h)
                const hit = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
                if (hit?.data) return finish(hit.data)
              }
            }
          }
        } catch {
          /* transient decode error — keep scanning */
        }
        this.raf = requestAnimationFrame(scan)
      }
      this.raf = requestAnimationFrame(scan)

      // Surface a camera that dies mid-scan (unplugged / permission revoked).
      // Kept in a field so switchCamera can re-arm it on the new track.
      this.onEnded = () => {
        this.stop()
        reject(new Error('camera ended'))
      }
      this.stream?.getVideoTracks()[0]?.addEventListener('ended', this.onEnded)
    })
  }

  /**
   * Switch to another camera WITHOUT restarting the scan — grab the new camera
   * first, swap it into the same <video>, then release the old one. Keeping a
   * stream live throughout means no black flash and no second permission prompt.
   */
  async switchCamera(deviceId: string): Promise<void> {
    if (this.stopped || !this.video) return
    const next = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: false,
    })
    if (this.stopped) {
      next.getTracks().forEach((t) => t.stop())
      return
    }
    const old = this.stream
    this.stream = next
    this.video.srcObject = next
    try { await this.video.play() } catch { /* play races are harmless here */ }
    if (this.onEnded) next.getVideoTracks()[0]?.addEventListener('ended', this.onEnded)
    old?.getTracks().forEach((t) => t.stop()) // release the previous camera last
  }

  stop(): void {
    this.stopped = true
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.canvas = null
    this.video = null
    this.onEnded = null
  }
}

/**
 * Pull a usable base URL out of a scanned payload. The car encodes a bare URL,
 * but be liberal: accept a full URL anywhere in the text and reduce it to its
 * origin (the setup screen wants scheme://host).
 */
export function urlFromScan(raw: string): string | null {
  const text = (raw || '').trim()
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s"'<>]+/i)
  const candidate = m ? m[0] : text
  try {
    return new URL(/^https?:\/\//i.test(candidate) ? candidate : 'https://' + candidate).origin
  } catch {
    return null
  }
}

const puppeteer = require('puppeteer-core')

const URL = 'https://conghoang.github.io/overdrive-pwa/dev/misc/car3d-test.html'
const OUT = '/private/tmp/claude-503/-Users-conghoang-Documents-development-byd/a0b0e0f8-4d29-4402-a439-06a8a6bb2945/scratchpad'

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 640, height: 420 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })

  await page.waitForFunction(() => {
    const c = document.querySelector('#stage canvas')
    return c && c.width > 10 && c.height > 10
  }, { timeout: 40000 }).catch(() => console.log('(canvas wait timed out)'))
  await new Promise((r) => setTimeout(r, 4000))

  const info = await page.evaluate(() => {
    const sr = document.querySelector('#stage').getBoundingClientRect()
    const rel = (r) => ({ x: Math.round(r.left - sr.left), y: Math.round(r.top - sr.top), w: Math.round(r.width), h: Math.round(r.height) })
    const vis = [...document.querySelectorAll('#stage *')].filter((e) => {
      const cs = getComputedStyle(e)
      if (cs.position === 'static' || cs.display === 'none' || cs.visibility === 'hidden' || e.hidden || parseFloat(cs.opacity) < 0.05) return false
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.width < 160
    }).map((e) => {
      const cs = getComputedStyle(e)
      return { cls: String(e.className), ...rel(e.getBoundingClientRect()), radius: cs.borderRadius, bg: cs.backgroundColor }
    })
    // probe several points around the top-left circle; list EVERY element there
    const probe = {}
    for (const [px, py] of [[72, 58], [64, 50], [80, 66], [60, 46]]) {
      probe[`${px},${py}`] = document.elementsFromPoint(px, py).map((e) => (String(e.className) || e.tagName.toLowerCase()))
    }
    const canvas = document.querySelector('#stage canvas')
    const cr = canvas && canvas.getBoundingClientRect()
    const k = document.querySelector('#kind')
    return { kind: k && k.textContent, vis, probe, canvasRect: cr && { x: Math.round(cr.left), y: Math.round(cr.top), w: Math.round(cr.width), h: Math.round(cr.height) } }
  })

  console.log('render kind:', info.kind)
  console.log('elements at stage top-left (28,28):', JSON.stringify(info.atTopLeft))
  console.log('visible positioned chrome in stage:')
  for (const v of info.vis) console.log('  ' + JSON.stringify(v))
  await page.screenshot({ path: `${OUT}/pup_shot.png` })
  console.log('screenshot saved')
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })

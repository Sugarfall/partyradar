/**
 * PartyRadar — Icon Generator
 * Generates PWA icons in all required sizes using sharp.
 * Run: node apps/web/scripts/generate-icons.js
 */
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]
const outDir = path.join(__dirname, '../public/icons')

fs.mkdirSync(outDir, { recursive: true })

// SVG lightning bolt on #04040d background
function makeSvg(size) {
  const pad = size * 0.15
  const inner = size - pad * 2
  // Simple ⚡ shape as SVG path
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#04040d"/>
  <!-- Outer glow -->
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="${size * 0.04}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- Lightning bolt -->
  <polygon
    points="${size*0.58},${size*0.08} ${size*0.28},${size*0.52} ${size*0.50},${size*0.52} ${size*0.42},${size*0.92} ${size*0.72},${size*0.48} ${size*0.50},${size*0.48}"
    fill="#00e5ff"
    filter="url(#glow)"
    opacity="0.95"
  />
</svg>`)
}

async function generate() {
  console.log('⚡ Generating PartyRadar icons...')
  for (const size of sizes) {
    const svg = makeSvg(size)
    const out = path.join(outDir, `icon-${size}.png`)
    await sharp(svg).png().toFile(out)
    console.log(`  ✅ icon-${size}.png`)
  }
  console.log(`\nIcons saved to: ${outDir}\n`)
}

generate().catch((err) => {
  console.error('Failed:', err.message)
  console.error('Run: npm install sharp --save-dev')
  process.exit(1)
})

const fs = require('fs')

const manifestPath = process.argv[2]
if (!manifestPath) throw new Error('Usage: node scripts/update-release-manifest.js <manifest-path>')

const { version } = require('../package.json')
const isPreview = process.env.GITHUB_REF == 'refs/heads/master'
const channel = isPreview ? 'preview' : 'stable'
const tag = isPreview ? `test-v${version}-${process.env.GITHUB_RUN_NUMBER}` : process.env.GITHUB_REF_NAME
const assetName = `lx-music-mobile-mobile-v${version}-universal.apk`
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

manifest[channel] = {
  version,
  desc: isPreview ? `测试版 v${version}` : `正式版 v${version}`,
  assets: [{
    name: assetName,
    browser_download_url: `https://github.com/Tingfe/lx-music-mobile/releases/download/${tag}/${assetName}`,
  }],
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

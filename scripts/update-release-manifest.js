const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const manifestPath = process.argv[2]
const repository = process.env.GITHUB_REPOSITORY
if (!manifestPath || !/^Tingfe\/lx-music-(mobile|car|desktop)$/.test(repository || '')) throw new Error('Invalid update manifest target')
const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`], { encoding: 'utf8' }))
if (!Array.isArray(pages)) throw new Error('Invalid release list')
const releases = pages.flat()
const compare = (a, b) => {
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i]
  return 0
}
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {}
const manifest = { schemaVersion: 1, stable: null, preview: null }
for (const release of releases) {
  if (release.draft) continue
  const match = release.prerelease
    ? release.tag_name.match(/^(?:test-v(\d+\.\d+\.\d+)-\d+|v(\d+\.\d+\.\d+)-test\.\d+)$/)
    : release.tag_name.match(/^v(\d+\.\d+\.\d+)$/)
  if (!match) continue
  const version = match[1] || match[2]
  const assets = release.assets.filter(asset => /\.(?:apk|exe|dmg|deb|rpm|AppImage|pacman|7z)$/.test(asset.name))
  if (!assets.length) continue
  const channel = release.prerelease ? 'preview' : 'stable'
  if (manifest[channel] && compare(manifest[channel].version, version) >= 0) continue
  manifest[channel] = {
    version,
    desc: release.body || '',
    releaseUrl: `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}`,
    assets: assets.map(asset => ({ name: asset.name, browser_download_url: asset.browser_download_url })),
  }
}
for (const channel of ['stable', 'preview']) {
  if (previous[channel] && (!manifest[channel] || compare(previous[channel].version, manifest[channel].version) > 0)) manifest[channel] = previous[channel]
}
if (!manifest.stable && !manifest.preview) throw new Error('No published release with installable assets')
fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

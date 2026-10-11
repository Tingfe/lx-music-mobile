const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.join(__dirname, '..')
const desktop = fs.existsSync(path.join(root, 'src/renderer'))
const base = desktop ? 'src/renderer' : 'src'
const load = (file, deps = {}, globals = {}) => {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, console, process, setTimeout, clearTimeout, require(name) { if (name in deps) return deps[name]; throw new Error('Unexpected dependency: ' + name) }, ...globals })
  return module.exports
}
const compare = (a, b) => {
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i]
  return 0
}
const reader = load(base + '/utils/releaseManifest.js').getReleaseInfo
const asset = { name: 'lx-music-mobile-mobile-v1.9.3-universal.apk', browser_download_url: 'https://github.com/Tingfe/lx-music-mobile/releases/download/test-v1.9.3-1/fixture.apk' }
const stable = { version: '1.9.2', desc: 'stable', assets: [asset] }
const preview = { version: '1.9.3', desc: 'preview', assets: [asset] }
const manifest = { schemaVersion: 1, stable, preview }
const respond = body => (url, options, callback) => callback(null, { statusCode: 200 }, body)
test('release manifest accepts already-parsed objects and raw JSON strings', async() => {
  for (const body of [manifest, JSON.stringify(manifest)]) {
    const result = await reader(respond(body), ['https://fixture.invalid/update.json'], true, compare)
    assert.equal(result.version, '1.9.3')
    assert.equal(result.desc, 'preview')
    assert.equal(result.manualDownload, true)
  }
})
test('403, malformed JSON and invalid HTTP 200 data fall through to another endpoint', async() => {
  const urls = ['limited', 'html', 'bad-version', 'no-assets', 'valid']
  const seen = []
  const request = (url, options, callback) => {
    const id = url.split('?')[0]
    seen.push(id)
    const bodies = { html: '<html>blocked</html>', 'bad-version': { schemaVersion: 1, stable: { version: '0.0.0' } }, 'no-assets': { schemaVersion: 1, stable: { version: '1.9.2', assets: [] } }, valid: manifest }
    callback(null, { statusCode: id === 'limited' ? 403 : 200 }, bodies[id])
  }
  const result = await reader(request, urls, true, compare, item => item.name.endsWith('.apk'))
  assert.equal(result.version, '1.9.3')
  assert.deepEqual(seen, urls)
})
test('all failed endpoints reject without inventing version 0.0.0', async() => {
  await assert.rejects(reader((url, options, callback) => callback(new Error('timeout')), ['one', 'two'], true, compare), /UPDATE_INFO_UNAVAILABLE/)
})
test('stable and preview channels never offer an older preview over a newer stable', async() => {
  assert.equal((await reader(respond(manifest), ['fixture'], false, compare)).version, '1.9.2')
  assert.equal((await reader(respond({ ...manifest, preview: { ...preview, version: '1.8.9' } }), ['fixture'], true, compare)).version, '1.9.2')
  assert.equal((await reader(respond({ schemaVersion: 1, preview }), ['fixture'], true, compare)).version, '1.9.3')
  await assert.rejects(reader(respond({ schemaVersion: 1, preview }), ['fixture'], false, compare), /UPDATE_INFO_UNAVAILABLE/)
})
test('the real client update entry accepts parsed responses without a GitHub API request', async() => {
  const request = (url, options, callback) => {
    assert.ok(!url.includes('api.github.com'))
    callback(null, { statusCode: 200 }, manifest)
  }
  const deps = desktop ? {
    './request': { httpGet: request }, '@common/utils': { compareVer: compare },
  } : {
    '@/utils/request': { httpGet: request }, '@/utils/fs': {}, '@/utils/nativeModules/utils': { getPackageName: async() => 'cn.toside.music.mobile' },
    '@/config/constant': {}, '@/config/release': { RELEASE_MANIFEST_URLS: ['https://fixture.invalid/update.json'] }, '@/utils': { compareVer: compare },
  }
  deps['./releaseManifest'] = { getReleaseInfo: reader }
  const api = load(base + '/utils/' + (desktop ? 'update.js' : 'version.js'), deps)
  assert.equal((await api.getVersionInfo(true)).version, '1.9.3')
})
test('manifest publisher selects newest public stable/preview and excludes drafts and unsupported tags', () => {
  let written
  const releases = [
    { tag_name: 'test-v9.9.9-9', prerelease: true, draft: true, assets: [asset] },
    { tag_name: 'v1.9.3-test.2', prerelease: true, draft: false, assets: [asset], body: 'new preview' },
    { tag_name: 'test-v1.9.3-1', prerelease: true, draft: false, assets: [asset], body: 'old preview' },
    { tag_name: 'v1.9.2', prerelease: false, draft: false, assets: [asset] },
    { tag_name: 'test-v4', prerelease: true, draft: false, assets: [asset] },
  ]
  load('scripts/update-release-manifest.js', {
    'node:fs': { existsSync: () => false, mkdirSync() {}, writeFileSync: (target, value) => { written = JSON.parse(value) } },
    'node:path': path,
    'node:child_process': { execFileSync: () => JSON.stringify(releases) },
  }, { process: { argv: ['node', 'script', '/tmp/fixture.json'], env: { GITHUB_REPOSITORY: 'Tingfe/lx-music-mobile' } } })
  assert.equal(written.stable.version, '1.9.2')
  assert.equal(written.preview.version, '1.9.3')
  assert.equal(written.preview.desc, 'new preview')
})
if (!desktop) test('failed update check clears latest status and keeps an unknown version unknown', async() => {
  const state = { versionInfo: { version: '1.9.3', newVersion: null, isLatest: true } }
  const api = load('src/core/version.ts', {
    '@/utils': { compareVer: compare }, '@/utils/version': { getVersionInfo: async() => { throw new Error('offline') } },
    '@/store/version/action': { setVersionInfo: info => Object.assign(state.versionInfo, info) }, '@/store/version/state': state,
    '@/utils/data': { getIgnoreVersionFailTipTime: async() => Date.now() }, '@/navigation': {}, 'react-native-navigation': {}, '@/utils/tools': {},
    '@/store/setting/state': { setting: {} },
  })
  await api.checkUpdate()
  assert.equal(state.versionInfo.isLatest, false)
  assert.equal(state.versionInfo.isUnknown, true)
  assert.equal(state.versionInfo.newVersion, null)
})

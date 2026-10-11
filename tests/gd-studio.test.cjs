const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.join(__dirname, '..')
const desktop = fs.existsSync(path.join(root, 'src/renderer'))
const base = desktop ? 'src/renderer' : 'src'
const load = (file, dependencies = {}, extra = {}, append = '') => {
  const module = { exports: {} }
  const source = fs.readFileSync(path.join(root, file), 'utf8') + append
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(code, {
    module, exports: module.exports, console: { log() {} }, setTimeout, clearTimeout,
    require(name) {
      if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name)
      return dependencies[name]
    },
    ...extra,
  })
  return module.exports
}
const gd = load(base + '/utils/musicSdk/gd-studio.js')
const make = (body = { url: 'https://audio.example.invalid/fixture', br: 320 }) => {
  let time = 0
  let active = true
  let calls = 0
  const urls = []
  const api = gd.createGdStudioApi((url, options) => {
    calls++
    urls.push(url)
    assert.equal(options.timeout, 12000)
    return { promise: Promise.resolve({ statusCode: 200, body }), cancelHttp() {} }
  }, () => active, () => time)
  return { api, urls, calls: () => calls, setTime: v => { time = v }, setActive: v => { active = v } }
}

test('maps Netease IDs and quality without search or audio download requests', async() => {
  for (const [quality, br] of [['128k',128], ['320k',320], ['flac',740]]) {
    const f = make()
    const result = await f.api.getMusicUrl({ songmid: 1698603 }, quality).promise
    assert.match(f.urls[0], new RegExp('types=url&source=netease&id=1698603&br=' + br + '$'))
    assert.equal(result.type, '320k')
  }
  assert.deepEqual(Array.from(gd.GD_QUALITYS), ['128k','320k','flac'])
})

test('uses actual bitrate and does not advertise unverified 24-bit', async() => {
  for (const [br, expected] of [[128,'128k'], [192,'128k'], [320,'320k'], [586,'flac'], [1411,'flac']]) {
    const f = make(JSON.stringify({ url: 'https://audio.example.invalid/fixture', br }))
    const result = await f.api.getMusicUrl({ songmid: '1' }, 'flac').promise
    assert.equal(result.type, expected)
    assert.equal(result.bitrate, br)
  }
})

test('rejects invalid IDs, unsupported quality, insecure URL, invalid body and bitrate', async() => {
  const f = make()
  await assert.rejects(f.api.getMusicUrl({ songmid: '../secret' }).promise, /歌曲 ID/)
  await assert.rejects(f.api.getMusicUrl({ songmid: '1' }, 'flac24bit').promise, /音质/)
  assert.equal(f.calls(), 0)
  for (const body of [null, '<html>', {}, { url: 'http://audio.example.invalid/a', br: 320 }, { url: 'file:///tmp/a', br: 320 }, { url: 'https://audio.example.invalid/a', br: 0 }]) {
    await assert.rejects(make(body).api.getMusicUrl({ songmid: '1' }).promise)
  }
})

test('short-lived memory cache expires and explicit refresh bypasses it', async() => {
  const f = make()
  await f.api.getMusicUrl({ songmid: '1' }).promise
  await f.api.getMusicUrl({ songmid: '1' }).promise
  assert.equal(f.calls(), 1)
  await f.api.getMusicUrl({ songmid: '1' }, '320k', true).promise
  assert.equal(f.calls(), 2)
  f.setTime(120001)
  await f.api.getMusicUrl({ songmid: '1' }).promise
  assert.equal(f.calls(), 3)
})

test('limits client requests and recovers after the five-minute window', async() => {
  const f = make()
  for (let i = 1; i <= 40; i++) await f.api.getMusicUrl({ songmid: String(i) }).promise
  await assert.rejects(f.api.getMusicUrl({ songmid: '41' }).promise, /频繁/)
  assert.equal(f.calls(), 40)
  f.setTime(300001)
  await f.api.getMusicUrl({ songmid: '41' }).promise
  assert.equal(f.calls(), 41)
})

test('handles HTTP errors and network failures without leaking endpoint tokens', async() => {
  for (const statusCode of [429, 500]) {
    const api = gd.createGdStudioApi(() => ({ promise: Promise.resolve({ statusCode }), cancelHttp() {} }), () => true)
    await assert.rejects(api.getMusicUrl({ songmid: '1' }).promise, statusCode === 429 ? /频繁/ : /不可用/)
  }
  const api = gd.createGdStudioApi(() => ({ promise: Promise.reject(new Error('https://private.invalid?token=secret')), cancelHttp() {} }), () => true)
  await assert.rejects(api.getMusicUrl({ songmid: '1' }).promise, error => /失败或超时/.test(error.message) && !error.message.includes('secret'))
})

test('cancellation and changing active source discard in-flight responses', async() => {
  let resolve
  let cancelled = 0
  let active = true
  const api = gd.createGdStudioApi(() => ({ promise: new Promise(r => { resolve = r }), cancelHttp: () => { cancelled++ } }), () => active)
  const req = api.getMusicUrl({ songmid: '1' })
  await Promise.resolve()
  req.canceleFn()
  resolve({ statusCode: 200, body: { url: 'https://audio.example.invalid/a', br: 320 } })
  await assert.rejects(req.promise, /取消/)
  assert.equal(cancelled, 1)
  const second = api.getMusicUrl({ songmid: '2' })
  await Promise.resolve()
  active = false
  resolve({ statusCode: 200, body: { url: 'https://audio.example.invalid/a', br: 320 } })
  await assert.rejects(second.promise, /切换/)
})

test('download policy blocks only GD; permitted and custom sources are unchanged', () => {
  assert.throws(() => gd.assertDownloadAllowed('gd_studio'), /禁止下载/)
  for (const id of ['', 'user_api_fixture', 'other_api']) assert.doesNotThrow(() => gd.assertDownloadAllowed(id))
})

test('GD is a selectable option, not an automatic fallback or default', () => {
  const source = fs.readFileSync(path.join(root, base + '/utils/musicSdk/api-source.js'), 'utf8')
  assert.match(source, /gd_studio_api_wy/)
  assert.match(source, /GD_QUALITYS/)
  const autoList = fs.readFileSync(path.join(root, base + '/utils/musicSdk/api-source-info.ts'), 'utf8')
  assert.doesNotMatch(autoList, /gd_studio/)
  const ui = fs.readFileSync(path.join(root, desktop ? base + '/views/Setting/components/SettingBasic.vue' : base + '/screens/Home/Views/Setting/settings/Basic/Source.tsx'), 'utf8')
  assert.match(ui, /GD_SOURCE_NAME/)
  assert.match(ui, /禁止下载/)
})

test('GD playback URLs never enter the legacy shared persistent cache', async() => {
  const setting = { 'common.apiSource': 'gd_studio' }
  let calls = 0
  const ipc = name => { calls++; return Promise.resolve(name.includes('get') ? 'fixture-url' : undefined) }
  const file = desktop ? base + '/utils/ipc.ts' : base + '/utils/data.ts'
  const deps = desktop ? {
    '@common/rendererIpc': { rendererInvoke: ipc },
    '@common/ipcNames': { HOTKEY_RENDERER_EVENT_NAME: {}, WIN_MAIN_RENDERER_EVENT_NAME: { get_music_url: 'get', save_music_url: 'save' }, CMMON_EVENT_NAME: {} },
    'electron-updater': {}, '@common/utils/vueTools': {}, '@common/hotKey': {},
    '@common/constants': { APP_EVENT_NAMES: {}, DATA_KEYS: {}, DEFAULT_SETTING: {} },
    '@renderer/store/setting': { appSetting: setting },
    './musicSdk/gd-studio': gd,
    './musicSdk/api-source': {},
  } : {
    '@/plugins/storage': { getData: () => ipc('get'), saveData: () => ipc('save') },
    '@/config/constant': { DEFAULT_SETTING: {}, LIST_IDS: {}, storageDataPrefix: {} },
    './common': { throttle: fn => fn }, '@/store/setting/state': { default: { setting } },
    './musicSdk/gd-studio': gd,
    './musicSdk/api-source': {},
  }
  const cache = load(file, deps)
  assert.equal(await cache.getMusicUrl({ id: 'fixture' }, '320k'), '')
  await cache.saveMusicUrl({ id: 'fixture' }, '320k', 'https://audio.example.invalid/a')
  assert.equal(calls, 0)
  setting['common.apiSource'] = 'user_api_fixture'
  assert.equal(await cache.getMusicUrl({ id: 'fixture' }, '320k'), 'fixture-url')
  await cache.saveMusicUrl({ id: 'fixture' }, '320k', 'https://audio.example.invalid/a')
  assert.equal(calls, 2)
})

if (desktop) test('actual desktop download entry rejects GD before creating tasks', async() => {
  let messages = []
  let resolve
  const setting = { 'common.apiSource': 'gd_studio' }
  const mod = load(base + '/store/download/action.ts', {
    '@renderer/utils/ipc': {}, './state': {}, '@common/utils/vueTools': {},
    '@renderer/core/music/online': { getMusicUrl: () => new Promise(r => { resolve = r }) },
    '@renderer/utils/musicSdk/gd-studio': gd,
    '@renderer/plugins/Dialog': { dialog: async({ message }) => { messages.push(message) } },
    '../setting': { appSetting: setting }, '..': {}, '@renderer/worker/utils': {},
    '@renderer/utils': {}, '@common/constants': {}, '../index': {}, './utils': {},
  }, {}, '\nexport const testGetMusicUrl = getMusicUrl\n')
  await mod.createDownloadTasks([{ source: 'wy' }], '320k')
  assert.equal(messages.length, 1)
  assert.match(messages[0], /禁止下载/)
  await assert.rejects(mod.testGetMusicUrl({}), /禁止下载/)
  setting['common.apiSource'] = 'user_api_fixture'
  const pending = mod.testGetMusicUrl({})
  setting['common.apiSource'] = 'gd_studio'
  resolve('https://audio.example.invalid/a')
  await assert.rejects(pending, /禁止下载/)
})

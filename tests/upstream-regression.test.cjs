const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.join(__dirname, '..')
const desktop = fs.existsSync(path.join(root, 'src/renderer'))
const base = desktop ? 'src/renderer' : 'src'
const load = (file, deps = {}, globals = {}, append = '') => {
  const module = { exports: {} }
  const source = fs.readFileSync(path.join(root, file), 'utf8') + append
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer, URL, Uint8Array, console, setTimeout, clearTimeout,
    require(name) {
      if (name in deps) return deps[name]
      if (['pako', 'zlib', 'crypto', 'url'].includes(name)) return require(name)
      throw new Error('Unexpected dependency: ' + name)
    }, ...globals,
  }, { filename: file })
  return module.exports
}
const compareVer = (a, b) => {
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1
  return 0
}

test('QQ search uses current desktop request and reads current response shape', async() => {
  let request
  const sdk = load(base + '/utils/musicSdk/tx/musicSearch.js', {
    '../../index': {}, '../utils': {}, './utils': { signRequest: async body => {
      request = body
      return { body: { code: 0, 'music.search.SearchCgiService': { code: 0, data: { body: { song: { list: [] } }, meta: { sum: 0 } } } } }
    } },
  }).default
  const data = await sdk.musicSearch('fixture', 2, 50)
  assert.equal(request['music.search.SearchCgiService'].method, 'DoSearchForQQMusicDesktop')
  assert.equal(request['music.search.SearchCgiService'].param.page_num, 2)
  assert.match(request['music.search.SearchCgiService'].param.searchid, /^[0-9A-F]{32}[0-9]{5}$/)
  assert.equal(data.meta.sum, 0)
})

test('Kugou shared playlist fetches every page without dropping songs', async() => {
  const sdk = load(base + '/utils/musicSdk/kg/songList.js', {
    '../../request': {}, '../../index': {},
    './vendors/infSign.min': {}, '@renderer/utils/musicSdk/kg/vendors/infSign.min': {},
    './util': { signatureParams: () => 'fixture-signature' },
  }).default
  const pages = []
  sdk.createHttp = async url => {
    const page = Number(new URL(url).searchParams.get('page'))
    pages.push(page)
    const items = Array.from({ length: page === 3 ? 1 : 50 }, (_, i) => ({ hash: String((page - 1) * 50 + i) }))
    return { info: [{ count: 101, name: 'fixture' }], list: { info: items } }
  }
  sdk.getMusicInfos = async items => items
  const result = await sdk.getListDetailByGcidChain('fixture-id', 'fixture-chain')
  assert.deepEqual(pages, [1, 2, 3])
  assert.equal(result.list.length, 101)
  assert.equal(result.total, 101)
})

test('automatic source matching excludes live and instrumental versions', async() => {
  let name = 'Fixture Song (Live)'
  const deps = { './api-source': {}, './versionChars': load(base + '/utils/musicSdk/versionChars.ts') }
  for (const id of ['kw', 'kg', 'tx', 'wy', 'mg', 'xm']) deps['./' + id] = {}
  deps['./kw'] = { musicSearch: { search: async() => ({ list: [{ name, singer: 'Fixture Singer', interval: '03:05', albumName: 'Fixture Album' }] }) } }
  const sdk = load(base + '/utils/musicSdk/index.js', deps)
  const original = { name: 'Fixture Song', singer: 'Fixture Singer', interval: '03:00', albumName: 'Fixture Album', source: 'wy' }
  assert.equal((await sdk.findMusic(original)).length, 0)
  name = 'Fixture Song (Instrumental)'
  assert.equal((await sdk.findMusic(original)).length, 0)
  name = 'Fixture Song'
  assert.equal((await sdk.findMusic(original)).length, 1)
})

test('GD single-track cache clearing preserves other tracks and invalidates in-flight cache writes', async() => {
  const gd = load(base + '/utils/musicSdk/gd-studio.js')
  let calls = 0
  const api = gd.createGdStudioApi(() => ({ promise: Promise.resolve({ statusCode: 200, body: { url: 'https://audio.example.invalid/fixture', br: 320 } }), cancelHttp() {} }), () => true)
  await api.getMusicUrl({ songmid: '1' }).promise
  await api.getMusicUrl({ songmid: '2' }).promise
  assert.equal(api.hasMusicUrl({ meta: { songId: '1' } }), true)
  api.clearMusicUrl({ meta: { songId: '1' } })
  assert.equal(api.hasMusicUrl({ songmid: '1' }), false)
  assert.equal(api.hasMusicUrl({ songmid: '2' }), true)
  let resolve
  const pendingApi = gd.createGdStudioApi(() => {
    calls++
    return { promise: new Promise(r => { resolve = r }), cancelHttp() {} }
  }, () => true)
  const pending = pendingApi.getMusicUrl({ songmid: '3' })
  await Promise.resolve()
  pendingApi.clearMusicUrl({ songmid: '3' })
  resolve({ statusCode: 200, body: { url: 'https://audio.example.invalid/fixture', br: 320 } })
  await pending.promise
  assert.equal(pendingApi.hasMusicUrl({ songmid: '3' }), false)
  assert.equal(calls, 1)
})

test('pure JS QRC decoding handles empty, malformed and encrypted lyric fixtures', async() => {
  const qrc = load(base + '/utils/musicSdk/tx/qrcDecode.js', {}, {},
    '\nexport const encryptFixture = (bytes) => { const schedule = tripledes_key_setup(QRC_KEY, DES_ENCRYPT); const result = new Uint8Array(Math.ceil(bytes.length / 8) * 8); result.set(bytes); const block = new Uint8Array(8); for (let i = 0; i < result.length; i += 8) { tripledes_crypt(result.subarray(i, i + 8), schedule, block); result.set(block, i); } return Buffer.from(result).toString("hex") }\n')
  const text = '[00:01.005]Fixture lyric 歌词'
  const encrypted = qrc.encryptFixture(require('node:zlib').deflateSync(Buffer.from(text)))
  assert.equal(await qrc.decodeQrc(encrypted), text)
  assert.equal(await qrc.decodeQrc(''), '')
  assert.equal(await qrc.decodeQrc('invalid'), '')
})


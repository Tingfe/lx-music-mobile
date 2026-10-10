const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const load = require('./load-source.cjs')

test('portable settings reject local fields, invalid types and out-of-range values', () => {
  const { filterSettingsSyncData } = load('src/plugins/sync/settings.ts')
  const data = filterSettingsSyncData({
    'theme.id': 'desktop-theme', 'common.langId': 'bad-language', 'sync.enable': false,
    'player.playbackRate': -99, 'list.isClickPlayList': 'false',
    'player.togglePlayMethod': 'invalid', 'player.playQuality': '320k',
    'search.isShowHotSearch': false, 'list.addMusicLocationType': 'bottom',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(data)), {
    'player.playQuality': '320k', 'search.isShowHotSearch': false, 'list.addMusicLocationType': 'bottom',
  })
  for (const value of [null, [], 'invalid']) assert.equal(Object.keys(filterSettingsSyncData(value)).length, 0)
  for (const value of [NaN, Infinity, 0.59, 2.01, '1']) {
    assert.equal(Object.keys(filterSettingsSyncData({ 'player.playbackRate': value })).length, 0)
  }
  for (const value of [0.6, 1, 2]) assert.equal(filterSettingsSyncData({ 'player.playbackRate': value })['player.playbackRate'], value)
})

test('update check clears latest state and ignores an older in-flight check', async() => {
  const state = { showModal: false, versionInfo: { version: '1.8.12', isLatest: false } }
  let offered = async() => ({ version: '1.8.12', assets: [] })
  let modalCount = 0
  const { checkUpdate } = load('src/core/version.ts', {
    '@/utils': { compareVer: (a, b) => a === b ? 0 : a < b ? -1 : 1 },
    '@/utils/version': { getVersionInfo: () => offered() },
    '@/store/version/action': { default: { setVersionInfo: data => Object.assign(state.versionInfo, data), setVisibleModal() {} } },
    '@/store/version/state': { default: state },
    '@/utils/data': { getIgnoreVersion: async() => null },
    '@/navigation': { showVersionModal: () => modalCount++ },
    'react-native-navigation': {}, '@/utils/tools': { toast() {} },
    '@/store/setting/state': { default: { setting: {} } },
  })
  await checkUpdate()
  assert.equal(state.versionInfo.isLatest, true)
  offered = async() => ({ version: '1.8.13', assets: [] })
  await checkUpdate()
  assert.equal(state.versionInfo.isLatest, false)
  assert.equal(modalCount, 1)
  let resolveOld
  offered = () => new Promise(resolve => { resolveOld = resolve })
  const oldCheck = checkUpdate()
  offered = async() => ({ version: '1.8.14', assets: [] })
  await checkUpdate()
  resolveOld({ version: '1.8.12', assets: [] })
  await oldCheck
  assert.equal(state.versionInfo.newVersion.version, '1.8.14')
})

test('remote deletion of an active source selects a valid fallback', async() => {
  const state = { list: [{ id: 'user_api_old' }] }
  let selected
  const { overwriteUserApisFromSync } = load('src/core/userApi.ts', {
    '@/store/userApi': { action: { setUserApiList: list => { state.list = list } }, state },
    '@/utils/data': { overwriteUserApiSyncData: async() => [] },
    '@/utils/nativeModules/userApi': {}, '@/utils/log': { log: {} },
    '@/store/setting/state': { default: { setting: { 'common.apiSource': 'user_api_old' } } },
    './apiSource': { setApiSource: id => { selected = id } },
    '@/utils/musicSdk/api-source-info': { default: [{ id: 'disabled', disabled: true }, { id: 'safe', disabled: false }] },
  })
  await overwriteUserApisFromSync([])
  assert.equal(selected, 'safe')
  assert.equal(state.list.length, 0)
})

test('deleting the last active source clears selection and destroys its runtime', async() => {
  const setting = { 'common.apiSource': 'user_api_old' }
  let destroyed = 0
  const apiSource = load('src/core/apiSource.ts', {
    '@/utils/musicSdk': { default: { supportQuality: {} } },
    './common': { updateSetting: data => Object.assign(setting, data) },
    '@/store/setting/state': { default: { setting } },
    './userApi': { destroyUserApi: () => { destroyed++ } },
    '@/utils/musicSdk/api-source-info': { default: [] },
  }, { global: { lx: { apiInitPromise: [null, true] }, state_event: { apiSourceUpdated() {} } }, requestAnimationFrame: callback => callback() })
  const { overwriteUserApisFromSync } = load('src/core/userApi.ts', {
    '@/store/userApi': { action: { setUserApiList() {} }, state: { list: [] } },
    '@/utils/data': { overwriteUserApiSyncData: async() => [] },
    '@/utils/nativeModules/userApi': {}, '@/utils/log': { log: {} },
    '@/store/setting/state': { default: { setting } },
    './apiSource': apiSource, '@/utils/musicSdk/api-source-info': { default: [] },
  })
  await overwriteUserApisFromSync([])
  assert.equal(setting['common.apiSource'], '')
  assert.equal(destroyed, 1)
})

test('closing an old settings session leaves the new session listener registered', async() => {
  const listeners = new Set()
  const event = { on: (_, callback) => { listeners.add(callback) }, off: (_, callback) => { listeners.delete(callback) } }
  const handler = load('src/plugins/sync/client/modules/settings/handler.ts', {
    '@/core/common': { updateSetting() {} }, '@/store/setting/state': { default: { setting: {} } },
    '@/plugins/sync/constants': { SYNC_CLOSE_CODE: { failed: 4100 } },
    '@/plugins/sync/settings': load('src/plugins/sync/settings.ts'),
  }, { global: { state_event: event } }).default
  let closeOld
  let closeNew
  await handler.settings_sync_finished({ moduleReadys: {}, onClose: callback => { closeOld = callback } })
  await handler.settings_sync_finished({ moduleReadys: {}, onClose: callback => { closeNew = callback } })
  assert.equal(listeners.size, 1)
  closeOld()
  assert.equal(listeners.size, 1)
  closeNew()
  assert.equal(listeners.size, 0)
})

test('stale socket callbacks cannot publish readiness, send data or close a new connection', async() => {
  const sockets = []
  const configs = []
  const statuses = []
  let resolveEncrypt
  class FakeSocket {
    constructor() { this.listeners = {}; this.sent = []; this.closed = []; sockets.push(this) }
    addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler) }
    emit(name, data) { for (const handler of this.listeners[name] || []) handler(data) }
    send(data) { this.sent.push(data) }
    close(code) { this.closed.push(code) }
  }
  const client = load('src/plugins/sync/client/client.ts', {
    './utils': { encryptMsg: () => new Promise(resolve => { resolveEncrypt = resolve }), decryptMsg: async(_, data) => data },
    './sync': { callObj: {} }, '../log': { default: { info() {}, error() {} } },
    '../utils': { aesEncrypt: () => '' }, '@/core/sync': { setSyncStatus: data => statuses.push({ ...data }) },
    '@/utils/common': { dateFormat: () => '' },
    'message2call': { createMsg2call: config => { configs.push(config); return { remote: {}, createQueueRemote: () => ({}), destroy() {} } } },
    '@/utils/tools': { toast() {} },
    '../constants': { SYNC_CLOSE_CODE: { normal: 1000, failed: 4100 }, SYNC_CODE: { msgConnect: 'c' } },
  }, { WebSocket: FakeSocket })
  const url = { wsProtocol: 'ws:', hostPath: 'test' }
  client.connect(url, { clientId: 'old', key: 'a' })
  sockets[0].emit('open', {})
  configs[0].sendMessage({ oldData: true })
  client.connect(url, { clientId: 'new', key: 'b' })
  sockets[1].emit('open', {})
  const statusCount = statuses.length
  configs[0].funcsObj.finished()
  assert.equal(sockets[1].isReady, false)
  assert.throws(() => configs[0].onCallBeforeParams([]), /disconnected/)
  resolveEncrypt('encrypted-for-old')
  await Promise.resolve()
  sockets[0].emit('error', { message: 'old error' })
  sockets[0].emit('close', { code: 4100 })
  assert.equal(statuses.length, statusCount)
  assert.equal(sockets[1].sent.length, 0)
  assert.equal(sockets[1].closed.length, 0)
  configs[1].funcsObj.finished()
  assert.equal(client.getClient(), sockets[1])
  await client.disconnect()
  assert.equal(client.getClient(), null)
})

test('authentication does not print connection codes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/plugins/sync/client/auth.ts'), 'utf8')
  assert.doesNotMatch(source, /console\.log\([^\n]*authCode/)
})

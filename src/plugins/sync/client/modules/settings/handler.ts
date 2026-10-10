import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import { SYNC_CLOSE_CODE } from '@/plugins/sync/constants'
import { filterSettingsSyncData, syncedSettingKeys } from '@/plugins/sync/settings'

const syncKeys = syncedSettingKeys as Array<keyof LX.AppSetting>
const syncKeySet = new Set<string>(syncKeys)

const getSettingsSyncData = (): LX.Sync.SettingsSyncData => {
  const data: LX.Sync.SettingsSyncData = {}
  for (const key of syncKeys) data[key] = settingState.setting[key] as LX.Sync.SettingsSyncData[string]
  return filterSettingsSyncData(data)
}

const applySettingsSyncData = async(data: LX.Sync.SettingsSyncData) => {
  updateSetting(filterSettingsSyncData(data) as Partial<LX.AppSetting>)
}

let applyingRemoteData = false
let unregister: (() => void) | null

const handler: LX.Sync.ClientSyncHandlerSettingsActions<LX.Sync.Socket> = {
  async onSettingsSyncData(socket, data) {
    if (!socket.moduleReadys.settings) return
    applyingRemoteData = true
    try {
      await applySettingsSyncData(data)
    } finally {
      applyingRemoteData = false
    }
  },
  async settings_sync_get_data() {
    return getSettingsSyncData()
  },
  async settings_sync_set_data(socket, data) {
    applyingRemoteData = true
    try {
      await applySettingsSyncData(data)
    } finally {
      applyingRemoteData = false
    }
  },
  async settings_sync_finished(socket) {
    socket.moduleReadys.settings = true
    unregister?.()
    const listener = (keys: Array<keyof LX.AppSetting>) => {
      if (applyingRemoteData || !socket.moduleReadys.settings || !keys.some(key => syncKeySet.has(key))) return
      void socket.remoteQueueSettings.onSettingsSyncData(getSettingsSyncData()).catch(() => { socket.close(SYNC_CLOSE_CODE.failed) })
    }
    global.state_event.on('configUpdated', listener)
    const removeListener = () => { global.state_event.off('configUpdated', listener) }
    unregister = removeListener
    socket.onClose(() => {
      removeListener()
      if (unregister === removeListener) unregister = null
    })
  },
}

export default handler

import { setLanguage, updateSetting } from '@/core/common'
import { applyTheme } from '@/core/theme'
import { getTheme } from '@/theme/themes'
import settingState from '@/store/setting/state'
import { SYNC_CLOSE_CODE } from '@/plugins/sync/constants'

const syncKeys: Array<keyof LX.AppSetting> = [
  'common.langId', 'common.sourceNameType', 'common.autoHidePlayBar', 'common.homePageScroll', 'common.allowProgressBarSeek', 'common.showBackBtn', 'common.showExitBtn',
  'player.togglePlayMethod', 'player.playQuality', 'player.playbackRate', 'player.isSavePlayTime', 'player.isShowLyricTranslation', 'player.isShowLyricRoma', 'player.isShowNotificationImage',
  'search.isShowHotSearch', 'search.isShowHistorySearch',
  'list.isClickPlayList', 'list.isShowSource', 'list.isShowAlbumName', 'list.isShowInterval', 'list.isSaveScrollLocation', 'list.addMusicLocationType',
  'theme.id', 'theme.lightId', 'theme.darkId', 'theme.hideBgDark', 'theme.dynamicBg', 'theme.fontShadow',
]
const syncKeySet = new Set<string>(syncKeys)

const getSettingsSyncData = (): LX.Sync.SettingsSyncData => {
  const data: LX.Sync.SettingsSyncData = {}
  for (const key of syncKeys) data[key] = settingState.setting[key] as LX.Sync.SettingsSyncData[string]
  return data
}

const applySettingsSyncData = async(data: LX.Sync.SettingsSyncData) => {
  const setting: Partial<LX.AppSetting> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!syncKeySet.has(key)) continue
    ;(setting as Record<string, unknown>)[key] = value
  }
  updateSetting(setting)
  const language = setting['common.langId']
  if (language) setLanguage(language)
  if ('theme.id' in setting || 'theme.hideBgDark' in setting) applyTheme(await getTheme())
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
      void socket.remoteQueueSettings.onSettingsSyncData(getSettingsSyncData()).catch(() => socket.close(SYNC_CLOSE_CODE.failed))
    }
    global.state_event.on('configUpdated', listener)
    unregister = () => global.state_event.off('configUpdated', listener)
    socket.onClose(() => unregister?.())
  },
}

export default handler

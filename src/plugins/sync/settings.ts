const oneOf = (values: readonly string[]) => (value: unknown) => typeof value == 'string' && values.includes(value)
const isBoolean = (value: unknown) => typeof value == 'boolean'

// Only portable preferences belong here. Theme, language and layout stay local.
const validators: Record<string, (value: unknown) => boolean> = {
  'common.sourceNameType': oneOf(['alias', 'real']),
  'player.togglePlayMethod': oneOf(['listLoop', 'random', 'list', 'singleLoop', 'none']),
  'player.playQuality': oneOf(['128k', '192k', '320k', 'flac', 'flac24bit', 'ape', 'wav']),
  'player.playbackRate': value => typeof value == 'number' && Number.isFinite(value) && value >= 0.6 && value <= 2,
  'player.isSavePlayTime': isBoolean,
  'player.isShowLyricTranslation': isBoolean,
  'player.isShowLyricRoma': isBoolean,
  'search.isShowHotSearch': isBoolean,
  'search.isShowHistorySearch': isBoolean,
  'list.isClickPlayList': isBoolean,
  'list.isShowSource': isBoolean,
  'list.isSaveScrollLocation': isBoolean,
  'list.addMusicLocationType': oneOf(['top', 'bottom']),
}

export const syncedSettingKeys = Object.keys(validators)

export const filterSettingsSyncData = (data: unknown): LX.Sync.SettingsSyncData => {
  const filtered: LX.Sync.SettingsSyncData = {}
  if (!data || typeof data != 'object' || Array.isArray(data)) return filtered
  for (const key of syncedSettingKeys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue
    const value = (data as Record<string, unknown>)[key]
    if (validators[key](value)) filtered[key] = value as LX.Sync.SettingsSyncData[string]
  }
  return filtered
}

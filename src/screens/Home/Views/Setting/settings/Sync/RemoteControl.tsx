import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'

import Modal, { type ModalType } from '@/components/common/Modal'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useStatus } from '@/store/sync/hook'
import { usePlayMusicInfo } from '@/store/player/hook'
import { getClient } from '@/plugins/sync/client/client'
import { getOnlineCars, sendCarCommand } from '@/plugins/sync/client/remoteControl'
import { getData, saveData } from '@/plugins/storage'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'

const preferredCarKey = '@preferred_car'

const getMusicText = (status: LX.Sync.RemoteControl.Status) => {
  const musicInfo = status.musicInfo
  if (!musicInfo) return '未播放歌曲'
  return `${musicInfo.name} - ${musicInfo.singer}`
}

const formatUpdatedAt = (updatedAt: number | null) => {
  if (!updatedAt) return '正在读取车机状态'
  return `更新于 ${new Date(updatedAt).toLocaleTimeString()}`
}

interface RemoteControlProps {
  compact?: boolean
}

interface ControlButtonProps {
  icon: string
  label: string
  onPress: () => void
  disabled?: boolean
  primary?: boolean
}

const ControlButton = ({ icon, label, onPress, disabled = false, primary = false }: ControlButtonProps) => {
  const theme = useTheme()
  return (
    <TouchableOpacity
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      activeOpacity={0.72}
      style={{ ...styles.controlButton, opacity: disabled ? 0.4 : 1, backgroundColor: primary ? theme['c-primary'] : theme['c-primary-light-100-alpha-100'] }}
      onPress={onPress}
    >
      <Icon name={icon} size={primary ? 25 : 21} color={primary ? theme['c-primary-font'] : theme['c-primary-font']} />
      <Text style={styles.controlLabel} size={12} color={primary ? theme['c-primary-font'] : theme['c-primary-font']}>{label}</Text>
    </TouchableOpacity>
  )
}

export default memo(({ compact = false }: RemoteControlProps) => {
  const modalRef = useRef<ModalType>(null)
  const requestIdRef = useRef(0)
  const syncStatus = useStatus()
  const playMusicInfo = usePlayMusicInfo()
  const theme = useTheme()
  const [cars, setCars] = useState<LX.Sync.RemoteControl.CarInfo[]>([])
  const [pendingCarId, setPendingCarId] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [preferredCarId, setPreferredCarId] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [statusText, setStatusText] = useState('')

  const sortCars = useCallback((items: LX.Sync.RemoteControl.CarInfo[], preferredId = preferredCarId) => {
    return [...items].sort((a, b) => Number(b.clientId == preferredId) - Number(a.clientId == preferredId))
  }, [preferredCarId])

  useEffect(() => {
    void getData<string>(preferredCarKey).then(setPreferredCarId)
  }, [])

  const refresh = useCallback((silent = false) => {
    if (!syncStatus.status) {
      setCars([])
      setStatusText('同步服务未连接')
      return
    }
    const requestId = ++requestIdRef.current
    void getOnlineCars(getClient()).then(items => {
      if (requestId != requestIdRef.current) return
      setCars(sortCars(items))
      setUpdatedAt(Date.now())
      setStatusText(items.length ? '' : '暂无在线车机')
    }).catch(err => {
      if (requestId != requestIdRef.current) return
      setCars([])
      setStatusText(err.message == 'sync_offline' ? '同步服务未连接' : '状态刷新失败，请重试')
      if (!silent) toast(err.message == 'sync_offline' ? '同步服务未连接' : '状态刷新失败')
    })
  }, [sortCars, syncStatus.status])

  useEffect(() => {
    if (!syncStatus.status) {
      setCars([])
      return
    }
    refresh(true)
    const timer = setInterval(() => { refresh(true) }, visible ? 8000 : 15000)
    return () => { clearInterval(timer) }
  }, [refresh, syncStatus.status, visible])

  const show = useCallback(() => {
    setVisible(true)
    modalRef.current?.setVisible(true)
    refresh(true)
  }, [refresh])

  const hide = useCallback(() => {
    setVisible(false)
  }, [])

  const setPreferredCar = useCallback((clientId: string) => {
    const nextId = clientId == preferredCarId ? null : clientId
    setPreferredCarId(nextId)
    setCars(items => sortCars(items, nextId))
    void saveData(preferredCarKey, nextId)
  }, [preferredCarId, sortCars])

  const sendCommand = useCallback((car: LX.Sync.RemoteControl.CarInfo, command: LX.Sync.RemoteControl.Command) => {
    requestIdRef.current++
    setPendingCarId(car.clientId)
    setStatusText('')
    void sendCarCommand(getClient(), car.clientId, command).then(status => {
      setCars(items => items.map(item => item.clientId == car.clientId ? { ...item, status } : item))
      setUpdatedAt(Date.now())
      setStatusText(command.action == 'play' ? `已请求 ${car.deviceName} 播放歌曲` : `已控制 ${car.deviceName}`)
    }).catch(() => {
      setCars(items => items.filter(item => item.clientId != car.clientId))
      setStatusText(`${car.deviceName} 已离线或暂不支持遥控`)
      toast(`${car.deviceName} 已离线或暂不支持遥控`)
    }).finally(() => {
      setPendingCarId(null)
    })
  }, [])

  const playOnCar = useCallback((car: LX.Sync.RemoteControl.CarInfo) => {
    const musicInfo = playMusicInfo.musicInfo
    if (!musicInfo) {
      toast('请先在手机上选择一首歌曲')
      return
    }
    sendCommand(car, { action: 'play', musicInfo: musicInfo as LX.Music.MusicInfo })
  }, [playMusicInfo.musicInfo, sendCommand])

  return (
    <>
      {compact
        ? cars.length
          ? <TouchableOpacity accessibilityLabel="控制在线车机" accessibilityRole="button" hitSlop={8} style={styles.compactEntry} activeOpacity={0.65} onPress={show}>
              <View style={{ ...styles.onlineDot, backgroundColor: theme['c-primary'] }} />
              <Text size={13}>车机{cars.length > 1 ? ` · ${cars.length}` : ''}</Text>
            </TouchableOpacity>
          : null
        : <View style={styles.entry}>
            <TouchableOpacity disabled={!syncStatus.status} activeOpacity={0.7} style={{ ...styles.entryButton, opacity: syncStatus.status ? 1 : 0.4, backgroundColor: theme['c-primary'] }} onPress={show}>
              <Icon name="logo" size={18} color={theme['c-primary-font']} />
              <Text style={styles.entryButtonText} size={15} color={theme['c-primary-font']}>控制在线车机</Text>
            </TouchableOpacity>
            <Text style={styles.entryHint} size={12} color={theme['c-font-label']}>{syncStatus.status ? formatUpdatedAt(updatedAt) : '连接同步服务后可用'}</Text>
          </View>}
      <Modal ref={modalRef} bgColor="rgba(0,0,0,.42)" onHide={hide}>
        <View style={styles.sheetContainer}>
          <View style={{ ...styles.sheet, backgroundColor: theme['c-content-background'] }} onStartShouldSetResponder={() => true}>
            <View style={{ ...styles.sheetHeader, borderBottomColor: theme['c-border-background'] }}>
              <View style={styles.headerTitle}>
                <Text size={20}>车机控制</Text>
                <Text size={12} color={theme['c-font-label']}>{statusText || formatUpdatedAt(updatedAt)}</Text>
              </View>
              <TouchableOpacity accessibilityLabel="刷新车机状态" accessibilityRole="button" style={styles.headerButton} onPress={() => { refresh() }}>
                <Icon name="available_updates" size={21} color={theme['c-primary-font']} />
              </TouchableOpacity>
              <TouchableOpacity accessibilityLabel="关闭车机控制" accessibilityRole="button" style={styles.headerButton} onPress={() => { modalRef.current?.setVisible(false) }}>
                <Icon name="close" size={20} color={theme['c-font-label']} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {cars.length ? cars.map(car => {
                const pending = pendingCarId == car.clientId
                const preferred = preferredCarId == car.clientId
                return (
                  <View key={car.clientId} style={{ ...styles.carCard, borderColor: preferred ? theme['c-primary'] : theme['c-border-background'] }}>
                    <View style={styles.carHeader}>
                      <View style={styles.carIdentity}>
                        <View style={{ ...styles.carDot, backgroundColor: theme['c-primary'] }} />
                        <View style={styles.carNameWrap}>
                          <Text size={17} numberOfLines={1}>{car.deviceName}</Text>
                          <Text size={12} color={theme['c-font-label']}>{preferred ? '默认车机 · 在线' : '在线'}</Text>
                        </View>
                      </View>
                      <TouchableOpacity style={{ ...styles.preferredButton, borderColor: theme['c-border-background'] }} onPress={() => { setPreferredCar(car.clientId) }}>
                        <Text size={12} color={preferred ? theme['c-primary-font'] : theme['c-font-label']}>{preferred ? '默认' : '设为默认'}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ ...styles.track, backgroundColor: theme['c-primary-light-100-alpha-100'] }}>
                      <Icon name="album" size={20} color={theme['c-primary-font']} />
                      <View style={styles.trackText}>
                        <Text size={16} numberOfLines={1}>{getMusicText(car.status)}</Text>
                        <Text size={13} color={theme['c-font-label']}>{car.status.isPlaying ? '正在播放' : '已暂停'}</Text>
                      </View>
                    </View>
                    <View style={styles.transportControls}>
                      <ControlButton icon="prevMusic" label="上一首" disabled={pending} onPress={() => { sendCommand(car, { action: 'prev' }) }} />
                      <ControlButton icon={car.status.isPlaying ? 'pause' : 'play'} label={car.status.isPlaying ? '暂停' : '播放'} primary disabled={pending} onPress={() => { sendCommand(car, { action: 'toggle' }) }} />
                      <ControlButton icon="nextMusic" label="下一首" disabled={pending} onPress={() => { sendCommand(car, { action: 'next' }) }} />
                    </View>
                    <TouchableOpacity disabled={pending || !playMusicInfo.musicInfo} activeOpacity={0.72} style={{ ...styles.sendButton, opacity: pending || !playMusicInfo.musicInfo ? 0.4 : 1, backgroundColor: theme['c-primary'] }} onPress={() => { playOnCar(car) }}>
                      <Icon name="share" size={18} color={theme['c-primary-font']} />
                      <Text style={styles.sendButtonText} size={15} color={theme['c-primary-font']}>{playMusicInfo.musicInfo ? `在 ${car.deviceName} 播放手机当前歌曲` : '先在手机选择一首歌曲'}</Text>
                    </TouchableOpacity>
                  </View>
                )
              }) : <View style={styles.emptyState}>
                <Icon name="logo" size={32} color={theme['c-font-label']} />
                <Text style={styles.emptyTitle} size={17}>未发现在线车机</Text>
                <Text style={styles.emptyText} size={13} color={theme['c-font-label']}>确认车机已连接相同同步账号后，再刷新状态。</Text>
                <TouchableOpacity style={{ ...styles.retryButton, backgroundColor: theme['c-primary-light-100-alpha-100'] }} onPress={() => { refresh() }}>
                  <Text size={14} color={theme['c-primary-font']}>重新刷新</Text>
                </TouchableOpacity>
              </View>}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  )
})

const styles = createStyle({
  entry: { marginLeft: 25, marginBottom: 15, flexDirection: 'row', alignItems: 'center' },
  entryButton: { minHeight: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  entryButtonText: { marginLeft: 8 },
  entryHint: { marginLeft: 10, flexShrink: 1 },
  compactEntry: { height: 44, minWidth: 72, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  sheetContainer: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '82%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  sheetHeader: { height: 56, paddingLeft: 20, paddingRight: 8, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  headerTitle: { flex: 1, justifyContent: 'center' },
  headerButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  carCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  carHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  carDot: { width: 9, height: 9, borderRadius: 5, marginRight: 9 },
  carNameWrap: { flex: 1 },
  preferredButton: { minHeight: 36, marginLeft: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 18, justifyContent: 'center' },
  track: { minHeight: 60, borderRadius: 12, paddingHorizontal: 12, marginTop: 14, flexDirection: 'row', alignItems: 'center' },
  trackText: { flex: 1, marginLeft: 10 },
  transportControls: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 16 },
  controlButton: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  controlLabel: { marginTop: 2 },
  sendButton: { minHeight: 52, borderRadius: 14, marginTop: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  sendButtonText: { marginLeft: 8, flexShrink: 1 },
  emptyState: { minHeight: 220, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { marginTop: 12, marginBottom: 6 },
  emptyText: { textAlign: 'center', lineHeight: 20 },
  retryButton: { minHeight: 44, minWidth: 120, marginTop: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})

import { memo, useCallback, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'

import Popup, { type PopupType } from '@/components/common/Popup'
import Text from '@/components/common/Text'
import { useStatus } from '@/store/sync/hook'
import { usePlayMusicInfo } from '@/store/player/hook'
import { getClient } from '@/plugins/sync/client/client'
import { getOnlineCars, sendCarCommand } from '@/plugins/sync/client/remoteControl'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import Button from '../../components/Button'

const getMusicText = (status: LX.Sync.RemoteControl.Status) => {
  const musicInfo = status.musicInfo
  if (!musicInfo) return '未播放歌曲'
  return `${musicInfo.name} - ${musicInfo.singer}`
}

export default memo(() => {
  const popupRef = useRef<PopupType>(null)
  const syncStatus = useStatus()
  const playMusicInfo = usePlayMusicInfo()
  const theme = useTheme()
  const [cars, setCars] = useState<LX.Sync.RemoteControl.CarInfo[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    void getOnlineCars(getClient()).then(setCars).catch(err => {
      setCars([])
      toast(err.message == 'sync_offline' ? '同步服务未连接' : '未发现在线车机')
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  const show = useCallback(() => {
    popupRef.current?.setVisible(true)
    refresh()
  }, [refresh])

  const sendCommand = useCallback((clientId: string, command: LX.Sync.RemoteControl.Command) => {
    setLoading(true)
    void sendCarCommand(getClient(), clientId, command).then(status => {
      setCars(cars => cars.map(car => car.clientId == clientId ? { ...car, status } : car))
    }).catch(() => {
      setCars(cars => cars.filter(car => car.clientId != clientId))
      toast('车机已离线或暂不支持遥控')
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  const playOnCar = useCallback((clientId: string) => {
    const musicInfo = playMusicInfo.musicInfo
    if (!musicInfo) {
      toast('请先在手机上选择一首歌曲')
      return
    }
    sendCommand(clientId, { action: 'play', musicInfo: musicInfo as LX.Music.MusicInfo })
  }, [playMusicInfo.musicInfo, sendCommand])

  return (
    <>
      <View style={styles.entry}>
        <Button disabled={!syncStatus.status} onPress={show}>控制在线车机</Button>
        <Text size={12} color={theme['c-font-label']}>
          {syncStatus.status ? '仅显示当前在线的车机' : '连接同步服务后可用'}
        </Text>
      </View>
      <Popup ref={popupRef} title="在线车机控制">
        <ScrollView contentContainerStyle={styles.popupContent}>
          <View style={styles.topActions}>
            <Button disabled={loading} onPress={refresh}>{loading ? '处理中…' : '刷新状态'}</Button>
          </View>
          {cars.length ? cars.map(car => (
            <View key={car.clientId} style={{ ...styles.car, borderColor: theme['c-border-background'] }}>
              <Text size={15}>{car.deviceName}</Text>
              <Text size={12} color={theme['c-font-label']} numberOfLines={1}>{getMusicText(car.status)}</Text>
              <Text size={12} color={theme['c-font-label']}>{car.status.isPlaying ? '正在播放' : '已暂停'}</Text>
              <View style={styles.controls}>
                <Button disabled={loading} onPress={() => { sendCommand(car.clientId, { action: 'prev' }) }}>上一首</Button>
                <Button disabled={loading} onPress={() => { sendCommand(car.clientId, { action: 'toggle' }) }}>{car.status.isPlaying ? '暂停' : '播放'}</Button>
                <Button disabled={loading} onPress={() => { sendCommand(car.clientId, { action: 'next' }) }}>下一首</Button>
              </View>
              <Button disabled={loading || !playMusicInfo.musicInfo} onPress={() => { playOnCar(car.clientId) }}>在车机播放手机当前歌曲</Button>
            </View>
          )) : <Text style={styles.empty} color={theme['c-font-label']}>暂无在线车机，请确认车机版已连接同步服务。</Text>}
        </ScrollView>
      </Popup>
    </>
  )
})

const styles = createStyle({
  entry: {
    marginLeft: 25,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  popupContent: {
    padding: 15,
  },
  topActions: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  car: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  controls: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 10,
  },
  empty: {
    textAlign: 'center',
    paddingTop: 20,
    paddingBottom: 20,
  },
})

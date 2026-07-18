import playerState from '@/store/player/state'
import { playNext, playPrev, playRemoteMusic, togglePlay } from '@/core/player/player'

const getStatus = (): LX.Sync.RemoteControl.Status => ({
  isPlaying: playerState.isPlay,
  musicInfo: playerState.playMusicInfo.musicInfo as LX.Music.MusicInfo | null,
})

const handler: LX.Sync.ClientSyncHandlerRemoteControlActions<LX.Sync.Socket> = {
  async getStatus() {
    return getStatus()
  },
  async onCommand(_socket, command) {
    switch (command.action) {
      case 'toggle':
        togglePlay()
        break
      case 'next':
        await playNext()
        break
      case 'prev':
        await playPrev()
        break
      case 'play':
        await playRemoteMusic(command.musicInfo)
        break
    }
    return getStatus()
  },
}

export default handler

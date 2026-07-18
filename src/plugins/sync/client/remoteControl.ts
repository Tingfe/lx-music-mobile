const getSocket = (socket: LX.Sync.Socket | null): LX.Sync.Socket => {
  if (!socket?.isReady) throw new Error('sync_offline')
  return socket
}

export const registerCar = async(socket: LX.Sync.Socket) => socket.remoteQueueRemoteControl.registerCar()

export const getOnlineCars = async(socket: LX.Sync.Socket | null) => getSocket(socket).remoteQueueRemoteControl.getCars()

export const sendCarCommand = async(socket: LX.Sync.Socket | null, clientId: string, command: LX.Sync.RemoteControl.Command) => {
  return getSocket(socket).remoteQueueRemoteControl.sendCommand(clientId, command)
}

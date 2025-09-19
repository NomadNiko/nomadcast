export default {
  startBroadcast(): Promise<any> {
    return Promise.resolve({});
  },
  stopBroadcast(): Promise<void> {
    return Promise.resolve();
  },
  isBroadcasting(): Promise<boolean> {
    return Promise.resolve(false);
  },
  findLocalServer(): Promise<string | null> {
    return Promise.resolve(null);
  },
  getDebugInfo(): Promise<any> {
    return Promise.resolve({});
  }
};
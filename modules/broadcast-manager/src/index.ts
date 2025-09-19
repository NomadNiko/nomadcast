import { NativeModulesProxy } from 'expo-modules-core';
import BroadcastManagerModule from './BroadcastManagerModule';

export async function startBroadcast(): Promise<void> {
  return await BroadcastManagerModule.startBroadcast();
}

export async function stopBroadcast(): Promise<void> {
  return await BroadcastManagerModule.stopBroadcast();
}

export async function isBroadcasting(): Promise<boolean> {
  return await BroadcastManagerModule.isBroadcasting();
}

export async function findLocalServer(): Promise<string | null> {
  return await BroadcastManagerModule.findLocalServer();
}

export async function getDebugInfo(): Promise<any> {
  return await BroadcastManagerModule.getDebugInfo();
}

export default {
  startBroadcast,
  stopBroadcast,
  isBroadcasting,
  findLocalServer,
  getDebugInfo
};
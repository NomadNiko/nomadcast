/* eslint-disable react-hooks/exhaustive-deps */
// components/BroadcastControl.tsx
import { NativeModulesProxy } from "expo-modules-core";
import React, { useEffect, useState } from "react";
import {
    Alert,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const { BroadcastManager } = NativeModulesProxy;

interface BroadcastConfig {
  signalingServer: string;
}

export function BroadcastControl() {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      checkBroadcastStatus();
      const interval = setInterval(checkBroadcastStatus, 2000);
      return () => clearInterval(interval);
    }
  }, []);

  const checkBroadcastStatus = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const broadcasting = await BroadcastManager.isBroadcasting();
      setIsBroadcasting(broadcasting);
    } catch (error) {
      console.error("Error checking broadcast status:", error);
    } finally {
      setIsChecking(false);
    }
  };

  const startBroadcast = async () => {
    try {
      const config: BroadcastConfig = {
        signalingServer: "wss://your-signaling-server.com", // Update with your server
      };
      await BroadcastManager.startBroadcast(config);
      // The picker will be shown, status will update via polling
    } catch (error) {
      Alert.alert("Error", "Failed to start broadcast");
      console.error(error);
    }
  };

  const stopBroadcast = async () => {
    try {
      await BroadcastManager.stopBroadcast();
      setIsBroadcasting(false);
    } catch (error) {
      Alert.alert("Error", "Failed to stop broadcast");
      console.error(error);
    }
  };

  if (Platform.OS !== "ios") {
    return (
      <View style={styles.container}>
        <Text>Broadcasting is only available on iOS</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isBroadcasting && styles.buttonActive]}
        onPress={isBroadcasting ? stopBroadcast : startBroadcast}
      >
        <Text style={styles.buttonText}>
          {isBroadcasting ? "Stop Broadcasting" : "Start Broadcasting"}
        </Text>
      </TouchableOpacity>
      <Text style={styles.status}>
        Status: {isBroadcasting ? "🔴 Live" : "⚫ Offline"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 20,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  buttonActive: {
    backgroundColor: "#FF3B30",
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  status: {
    fontSize: 16,
    color: "#666",
  },
});

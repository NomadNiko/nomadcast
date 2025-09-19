/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import BroadcastManager from "broadcast-manager";

export function BroadcastControl() {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  const addDebug = (msg: string) => {
    console.log(`[BroadcastControl] ${msg}`);
    setDebugInfo(prev => [...prev.slice(-9), `${new Date().toISOString().substr(11, 8)}: ${msg}`]);
  };

  useEffect(() => {
    addDebug(`Component mounted. Platform: ${Platform.OS}, BroadcastManager exists: ${!!BroadcastManager}`);

    if (Platform.OS === "ios" && BroadcastManager) {
      addDebug("Starting broadcast status polling...");
      checkBroadcastStatus();
      const interval = setInterval(checkBroadcastStatus, 2000);
      return () => {
        addDebug("Cleaning up broadcast status polling");
        clearInterval(interval);
      };
    }
  }, []);

  const checkBroadcastStatus = async () => {
    if (isChecking || !BroadcastManager) return;
    setIsChecking(true);
    try {
      const broadcasting = await BroadcastManager.isBroadcasting();
      if (broadcasting !== isBroadcasting) {
        addDebug(`Broadcast status changed: ${broadcasting ? "LIVE" : "OFFLINE"}`);
      }
      setIsBroadcasting(broadcasting);
    } catch (error) {
      addDebug(`Error checking status: ${error}`);
      console.error("Error checking broadcast status:", error);
    } finally {
      setIsChecking(false);
    }
  };

  const startBroadcast = async () => {
    addDebug("Start broadcast button pressed");
    setIsSearching(true);
    try {
      addDebug("Calling BroadcastManager.startBroadcast()...");
      const result = await BroadcastManager.startBroadcast();
      addDebug(`startBroadcast returned: ${JSON.stringify(result)}`);
      addDebug("Broadcast picker should be shown");
    } catch (error: any) {
      addDebug(`Start broadcast error: ${error.message || error}`);
      addDebug(`Error code: ${error.code}`);
      addDebug(`Error stack: ${error.stack}`);
      if (error.message?.includes("NoServerFound")) {
        Alert.alert("No Server Found", "Please ensure the Windows app is running on port 8877");
      } else {
        Alert.alert("Error", `Failed to start broadcast: ${error.message || error}`);
      }
      console.error("Full error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const stopBroadcast = async () => {
    addDebug("Stop broadcast button pressed");
    try {
      addDebug("Calling BroadcastManager.stopBroadcast()...");
      await BroadcastManager.stopBroadcast();
      addDebug("Stop broadcast completed");
      setIsBroadcasting(false);
    } catch (error: any) {
      addDebug(`Stop broadcast error: ${error.message || error}`);
      Alert.alert("Error", `Failed to stop broadcast: ${error.message || error}`);
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

  if (!BroadcastManager) {
    return (
      <View style={styles.container}>
        <Text style={styles.warningText}>
          Broadcast module not available.{'\n'}
          This feature requires a custom development build.
        </Text>
      </View>
    );
  }

  const testModule = async () => {
    addDebug("Testing module availability...");
    try {
      addDebug(`BroadcastManager type: ${typeof BroadcastManager}`);
      addDebug(`BroadcastManager keys: ${Object.keys(BroadcastManager).join(", ")}`);

      // Get debug info first
      addDebug("Getting debug info...");
      const debugInfo = await BroadcastManager.getDebugInfo();
      addDebug(`Local IP: ${debugInfo.localIP || "unknown"}`);
      addDebug(`Subnet: ${debugInfo.subnet || "unknown"}`);
      addDebug(`App Group: ${debugInfo.appGroupAccessible ? "accessible" : "NOT accessible"}`);
      if (debugInfo.storedServerIP) {
        addDebug(`Stored server: ${debugInfo.storedServerIP}:${debugInfo.storedServerPort}`);
      }

      // Then try finding server
      addDebug("Searching for server...");
      const serverIP = await BroadcastManager.findLocalServer();
      if (serverIP) {
        addDebug(`Test: Found server at ${serverIP}`);
      } else {
        addDebug("Test: No server found on network");
      }
    } catch (error: any) {
      addDebug(`Test error: ${error.message || error}`);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, isBroadcasting && styles.buttonActive]}
        onPress={isBroadcasting ? stopBroadcast : startBroadcast}
        disabled={isSearching}
      >
        {isSearching ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>
            {isBroadcasting ? "Stop Broadcasting" : "Start Broadcasting"}
          </Text>
        )}
      </TouchableOpacity>
      <Text style={styles.status}>
        {isSearching ? "🔍 Searching for server on port 8877..." :
         isBroadcasting ? "🔴 Live" : "⚫ Offline"}
      </Text>

      {/* Test button */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#666", marginTop: 10 }]}
        onPress={testModule}
      >
        <Text style={styles.buttonText}>Test Module</Text>
      </TouchableOpacity>

      {/* Debug console */}
      <View style={styles.debugContainer}>
        <Text style={styles.debugTitle}>Debug Log:</Text>
        {debugInfo.map((line, i) => (
          <Text key={i} style={styles.debugText}>{line}</Text>
        ))}
      </View>
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
  warningText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  debugContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    maxHeight: 200,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 5,
  },
  debugText: {
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    color: "#333",
  },
});

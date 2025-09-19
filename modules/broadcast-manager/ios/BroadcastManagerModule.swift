import ExpoModulesCore
import ReplayKit
import Network
import os.log

private let logger = OSLog(subsystem: "com.devnomad.nomadcast", category: "BroadcastManager")

public class BroadcastManagerModule: Module {
    private let broadcastPicker = RPSystemBroadcastPickerView()
    private let appGroupIdentifier = "group.com.devnomad.nomadcast.broadcast"
    private var serverDiscovery: ServerDiscovery?

    public func definition() -> ModuleDefinition {
        Name("BroadcastManager")

        Events("onServerFound", "onBroadcastStatusChanged")

        AsyncFunction("startBroadcast") { () -> [String: Any] in
            os_log("[BroadcastManager] startBroadcast called", log: logger, type: .info)
            return try await self.startBroadcastAsync()
        }

        AsyncFunction("stopBroadcast") {
            os_log("[BroadcastManager] stopBroadcast called", log: logger, type: .info)
            try await self.stopBroadcastAsync()
        }

        AsyncFunction("isBroadcasting") {
            let status = self.isBroadcastActive()
            os_log("[BroadcastManager] isBroadcasting called, returning: %{public}@", log: logger, type: .debug, status ? "true" : "false")
            return status
        }

        AsyncFunction("findLocalServer") { () -> String? in
            os_log("[BroadcastManager] findLocalServer called", log: logger, type: .info)
            return try await self.findLocalServerAsync()
        }

        AsyncFunction("getDebugInfo") { () -> [String: Any] in
            var info: [String: Any] = [:]

            // Check local IP
            if let localIP = ServerDiscovery().getLocalIPAddress() {
                info["localIP"] = localIP
                let components = localIP.split(separator: ".")
                if components.count == 4 {
                    info["subnet"] = "\(components[0]).\(components[1]).\(components[2])"
                }
            } else {
                info["localIP"] = "Could not determine"
            }

            // Check app group
            info["appGroupId"] = self.appGroupIdentifier
            if let userDefaults = UserDefaults(suiteName: self.appGroupIdentifier) {
                info["appGroupAccessible"] = true
                info["storedServerIP"] = userDefaults.string(forKey: "serverIP") ?? "none"
                info["storedServerPort"] = userDefaults.integer(forKey: "serverPort")
                info["broadcastingStatus"] = userDefaults.bool(forKey: "broadcasting")
            } else {
                info["appGroupAccessible"] = false
            }

            // Check extension
            info["extensionBundleId"] = "com.devnomad.nomadcast.BroadcastExtension"

            return info
        }
    }

    private func findLocalServerAsync() async throws -> String? {
        os_log("[BroadcastManager] Starting server discovery on port 8877", log: logger, type: .info)
        print("[BroadcastManager] Starting server discovery on port 8877")

        return await withCheckedContinuation { continuation in
            serverDiscovery = ServerDiscovery()
            serverDiscovery?.findServer(port: 8877) { serverIP in
                if let ip = serverIP {
                    os_log("[BroadcastManager] Server found at: %{public}@", log: logger, type: .info, ip)
                    print("[BroadcastManager] Server found at: \(ip)")
                } else {
                    os_log("[BroadcastManager] No server found", log: logger, type: .error)
                    print("[BroadcastManager] No server found")
                }
                continuation.resume(returning: serverIP)
            }
        }
    }

    private func startBroadcastAsync() async throws -> [String: Any] {
        var debugInfo: [String: Any] = [:]
        debugInfo["step"] = "startBroadcastAsync"

        os_log("[BroadcastManager] startBroadcastAsync - beginning", log: logger, type: .info)
        print("[BroadcastManager] startBroadcastAsync - beginning")

        debugInfo["findingServer"] = true
        // Find server first
        guard let serverIP = try await findLocalServerAsync() else {
            os_log("[BroadcastManager] Failed: No server found", log: logger, type: .error)
            print("[BroadcastManager] Failed: No server found")
            debugInfo["error"] = "No server found on port 8877"
            debugInfo["serverFound"] = false
            throw Exception(name: "NoServerFound", description: "No server found on port 8877")
        }

        debugInfo["serverFound"] = true
        debugInfo["serverIP"] = serverIP

        os_log("[BroadcastManager] Server found, storing IP: %{public}@", log: logger, type: .info, serverIP)
        print("[BroadcastManager] Server found, storing IP: \(serverIP)")

        await MainActor.run {
            // Store server IP in app group
            if let userDefaults = UserDefaults(suiteName: appGroupIdentifier) {
                userDefaults.set(serverIP, forKey: "serverIP")
                userDefaults.set(8877, forKey: "serverPort")
                userDefaults.synchronize()
                debugInfo["appGroupAccess"] = true
                os_log("[BroadcastManager] Stored server info in app group", log: logger, type: .info)
                print("[BroadcastManager] Stored server info in app group")
            } else {
                debugInfo["appGroupAccess"] = false
                debugInfo["appGroupError"] = "Could not access app group: \(appGroupIdentifier)"
                os_log("[BroadcastManager] ERROR: Could not access app group: %{public}@", log: logger, type: .error, appGroupIdentifier)
                print("[BroadcastManager] ERROR: Could not access app group: \(appGroupIdentifier)")
            }

            // Show the broadcast picker
            debugInfo["showingPicker"] = true
            os_log("[BroadcastManager] Showing broadcast picker", log: logger, type: .info)
            print("[BroadcastManager] Showing broadcast picker")
            self.showBroadcastPicker()
            debugInfo["pickerShown"] = true
        }

        return debugInfo
    }

    private func stopBroadcastAsync() async throws {
        os_log("[BroadcastManager] stopBroadcastAsync called", log: logger, type: .info)
        print("[BroadcastManager] stopBroadcastAsync called")

        await MainActor.run {
            if let userDefaults = UserDefaults(suiteName: appGroupIdentifier) {
                userDefaults.set(false, forKey: "broadcasting")
                userDefaults.synchronize()
                os_log("[BroadcastManager] Set broadcasting to false in app group", log: logger, type: .info)
                print("[BroadcastManager] Set broadcasting to false in app group")
            } else {
                os_log("[BroadcastManager] ERROR: Could not access app group", log: logger, type: .error)
                print("[BroadcastManager] ERROR: Could not access app group")
            }
        }
    }

    private func isBroadcastActive() -> Bool {
        if let userDefaults = UserDefaults(suiteName: appGroupIdentifier) {
            let status = userDefaults.bool(forKey: "broadcasting")
            return status
        }
        os_log("[BroadcastManager] Could not access app group for status", log: logger, type: .error)
        print("[BroadcastManager] Could not access app group for status")
        return false
    }

    @MainActor
    private func showBroadcastPicker() {
        let extensionBundleId = "com.devnomad.nomadcast.BroadcastExtension"
        os_log("[BroadcastManager] Configuring picker for extension: %{public}@", log: logger, type: .info, extensionBundleId)
        print("[BroadcastManager] Configuring picker for extension: \(extensionBundleId)")

        broadcastPicker.preferredExtension = extensionBundleId
        broadcastPicker.showsMicrophoneButton = false

        guard let window = UIApplication.shared.windows.first else {
            os_log("[BroadcastManager] ERROR: No window available", log: logger, type: .error)
            print("[BroadcastManager] ERROR: No window available")
            return
        }

        broadcastPicker.frame = CGRect(x: 0, y: 0, width: 44, height: 44)
        broadcastPicker.alpha = 0
        window.addSubview(broadcastPicker)

        os_log("[BroadcastManager] Added picker to window, triggering button", log: logger, type: .info)
        print("[BroadcastManager] Added picker to window, triggering button")

        var buttonFound = false
        for subview in broadcastPicker.subviews {
            if let button = subview as? UIButton {
                button.sendActions(for: .allTouchEvents)
                buttonFound = true
                os_log("[BroadcastManager] Triggered broadcast picker button", log: logger, type: .info)
                print("[BroadcastManager] Triggered broadcast picker button")
                break
            }
        }

        if !buttonFound {
            os_log("[BroadcastManager] WARNING: No button found in picker", log: logger, type: .error)
            print("[BroadcastManager] WARNING: No button found in picker")
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.broadcastPicker.removeFromSuperview()
            os_log("[BroadcastManager] Removed picker from view", log: logger, type: .debug)
            print("[BroadcastManager] Removed picker from view")
        }
    }
}

// Simple server discovery
class ServerDiscovery {
    func getLocalIPAddress() -> String? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?

        if getifaddrs(&ifaddr) == 0 {
            var ptr = ifaddr
            while ptr != nil {
                defer { ptr = ptr?.pointee.ifa_next }

                let interface = ptr?.pointee
                let addrFamily = interface?.ifa_addr.pointee.sa_family

                if addrFamily == UInt8(AF_INET) {
                    let name = String(cString: (interface?.ifa_name)!)
                    if name == "en0" {
                        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                        getnameinfo(interface?.ifa_addr, socklen_t((interface?.ifa_addr.pointee.sa_len)!),
                                   &hostname, socklen_t(hostname.count), nil, socklen_t(0), NI_NUMERICHOST)
                        address = String(cString: hostname)
                    }
                }
            }
            freeifaddrs(ifaddr)
        }
        return address
    }

    func findServer(port: Int, completion: @escaping (String?) -> Void) {
        print("[ServerDiscovery] Starting server scan on port \(port)")

        // Get local IP prefix
        guard let localIP = getLocalIPAddress() else {
            print("[ServerDiscovery] ERROR: Could not get local IP address")
            completion(nil)
            return
        }

        print("[ServerDiscovery] Local IP: \(localIP)")

        let components = localIP.split(separator: ".")
        guard components.count == 4 else {
            print("[ServerDiscovery] ERROR: Invalid IP format")
            completion(nil)
            return
        }

        let subnet = "\(components[0]).\(components[1]).\(components[2])"
        print("[ServerDiscovery] Scanning subnet: \(subnet).x on port \(port)")

        // Scan subnet for server
        DispatchQueue.global().async {
            for i in 1...254 {
                let testIP = "\(subnet).\(i)"

                if i % 50 == 0 {
                    print("[ServerDiscovery] Progress: Scanned up to \(testIP)")
                }

                let client = TCPClient(address: testIP, port: Int32(port))

                switch client.connect(timeout: 1) {
                case .success:
                    print("[ServerDiscovery] SUCCESS: Found server at \(testIP)")
                    client.close()
                    DispatchQueue.main.async {
                        completion(testIP)
                    }
                    return
                case .failure:
                    continue
                }
            }
            print("[ServerDiscovery] Scan complete: No server found")
            DispatchQueue.main.async {
                completion(nil)
            }
        }
    }

}

// Minimal TCP client for server detection
class TCPClient {
    private var socket: Int32 = -1
    private let address: String
    private let port: Int32

    init(address: String, port: Int32) {
        self.address = address
        self.port = port
    }

    func connect(timeout: Int) -> Result<Void, Error> {
        socket = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard socket >= 0 else {
            return .failure(NSError(domain: "TCPClient", code: -1))
        }

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = CFSwapInt16HostToBig(UInt16(port))
        addr.sin_addr.s_addr = inet_addr(address)

        var tv = timeval()
        tv.tv_sec = timeout
        tv.tv_usec = 0

        setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))

        let result = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(socket, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }

        if result == 0 {
            return .success(())
        } else {
            close()
            return .failure(NSError(domain: "TCPClient", code: -1))
        }
    }

    func close() {
        if socket >= 0 {
            Darwin.close(socket)
            socket = -1
        }
    }
}
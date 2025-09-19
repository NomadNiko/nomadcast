import ExpoModulesCore
import ReplayKit

public class BroadcastManager: Module {
    public func definition() -> ModuleDefinition {
        Name("BroadcastManager")
        
        AsyncFunction("startBroadcast") { (config: [String: Any], promise: Promise) in
            DispatchQueue.main.async {
                // Store config in shared defaults
                if let sharedDefaults = UserDefaults(suiteName: "group.com.devnomad.nomadcast.broadcast") {
                    if let server = config["signalingServer"] as? String {
                        sharedDefaults.set(server, forKey: "signalingServer")
                    }
                    sharedDefaults.synchronize()
                }
                
                // Show broadcast picker
                let picker = RPSystemBroadcastPickerView()
                picker.preferredExtension = "com.devnomad.nomadcast.BroadcastExtension"
                
                // Trigger the picker
                for subview in picker.subviews {
                    if let button = subview as? UIButton {
                        button.sendActions(for: .touchUpInside)
                        break
                    }
                }
                
                promise.resolve(true)
            }
        }
        
        AsyncFunction("stopBroadcast") { (promise: Promise) in
            promise.resolve(true)
        }
        
        AsyncFunction("isBroadcasting") { (promise: Promise) in
            if let sharedDefaults = UserDefaults(suiteName: "group.com.devnomad.nomadcast.broadcast") {
                let broadcasting = sharedDefaults.bool(forKey: "broadcasting")
                promise.resolve(broadcasting)
            } else {
                promise.resolve(false)
            }
        }
    }
}
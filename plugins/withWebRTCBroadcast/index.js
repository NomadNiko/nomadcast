// plugins/withWebRTCBroadcast/index.js
const {
  withXcodeProject,
  withDangerousMod,
  withEntitlementsPlist,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BUNDLE_ID = "com.devnomad.nomadcast";
const TEAM_ID = "843CNLD5C9";
const APP_GROUP = "group.com.devnomad.nomadcast.broadcast";
const EXTENSION_NAME = "BroadcastExtension";
const EXTENSION_BUNDLE_ID = `${BUNDLE_ID}.${EXTENSION_NAME}`;

const withWebRTCBroadcast = (config) => {
  // Add app group to main app
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.security.application-groups"] = [APP_GROUP];
    return config;
  });

  // Create extension files and configure Podfile
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      await createExtensionFiles(config);
      await configurePodfile(config);
      return config;
    },
  ]);

  // Configure Xcode project
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    addBroadcastExtension(xcodeProject);
    return config;
  });

  return config;
};

function addBroadcastExtension(xcodeProject) {
  if (xcodeProject.pbxTargetByName(EXTENSION_NAME)) {
    console.log(`${EXTENSION_NAME} target already exists.`);
    return;
  }

  const target = xcodeProject.addTarget(
    EXTENSION_NAME,
    "app_extension",
    EXTENSION_NAME,
    `${EXTENSION_NAME}`
  );

  const projectUuid = xcodeProject.getFirstProject().uuid;
  const targetUuid = target.uuid;
  const mainTargetUuid = xcodeProject.getFirstTarget().uuid;

  // Configure target attributes for proper signing
  if (
    !xcodeProject.pbxProjectSection()[projectUuid].attributes.TargetAttributes
  ) {
    xcodeProject.pbxProjectSection()[projectUuid].attributes.TargetAttributes =
      {};
  }

  const targetAttributes =
    xcodeProject.pbxProjectSection()[projectUuid].attributes.TargetAttributes;

  // Extension target attributes
  targetAttributes[targetUuid] = {
    CreatedOnToolsVersion: "14.0",
    DevelopmentTeam: TEAM_ID,
    ProvisioningStyle: "Automatic",
    SystemCapabilities: {
      "com.apple.ApplicationGroups.iOS": { enabled: 1 },
    },
  };

  // Main target app groups
  if (!targetAttributes[mainTargetUuid]) {
    targetAttributes[mainTargetUuid] = {};
  }
  if (!targetAttributes[mainTargetUuid].SystemCapabilities) {
    targetAttributes[mainTargetUuid].SystemCapabilities = {};
  }
  targetAttributes[mainTargetUuid].SystemCapabilities[
    "com.apple.ApplicationGroups.iOS"
  ] = { enabled: 1 };

  // Add frameworks
  xcodeProject.addFramework("ReplayKit.framework", { target: targetUuid });
  xcodeProject.addFramework("Network.framework", { target: targetUuid });

  // Configure build settings properly - FIXED SYNTAX HERE
  const configurations = xcodeProject.pbxXCBuildConfigurationSection();
  for (const key in configurations) {
    const config = configurations[key];
    if (config && config.buildSettings && !key.endsWith("_comment")) {
      // Check if this configuration belongs to our extension
      const buildConfigList =
        xcodeProject.pbxTargetByName(EXTENSION_NAME)?.buildConfigurationList;
      if (
        buildConfigList &&
        config.buildSettings &&
        xcodeProject
          .pbxXCConfigurationList()
          [buildConfigList]?.buildConfigurations?.some(
            (conf) => conf.value === key
          )
      ) {
        config.buildSettings = {
          ...config.buildSettings,
          PRODUCT_BUNDLE_IDENTIFIER: EXTENSION_BUNDLE_ID,
          PRODUCT_NAME: EXTENSION_NAME,
          SWIFT_VERSION: "5.0",
          TARGETED_DEVICE_FAMILY: "1,2",
          IPHONEOS_DEPLOYMENT_TARGET: "14.0",
          DEVELOPMENT_TEAM: TEAM_ID,
          CODE_SIGN_STYLE: "Automatic",
          CODE_SIGN_IDENTITY: "Apple Development",
          INFOPLIST_FILE: `${EXTENSION_NAME}/Info.plist`,
          LD_RUNPATH_SEARCH_PATHS:
            "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
          ENABLE_BITCODE: "NO",
          SKIP_INSTALL: "YES",
        };
      }
    }
  }

  // Add extension group and files
  const extensionGroup = xcodeProject.addPbxGroup(
    [],
    EXTENSION_NAME,
    EXTENSION_NAME
  );

  // Add Swift file
  const swiftFile = xcodeProject.addFile(
    `${EXTENSION_NAME}/SampleHandler.swift`,
    extensionGroup.uuid,
    { lastKnownFileType: "sourcecode.swift" }
  );
  xcodeProject.addToPbxBuildFileSection(swiftFile);
  xcodeProject.addToPbxSourcesBuildPhase(swiftFile);

  // Add Info.plist
  xcodeProject.addFile(`${EXTENSION_NAME}/Info.plist`, extensionGroup.uuid, {
    lastKnownFileType: "text.plist.xml",
  });
}

async function configurePodfile(config) {
  const projectRoot = config.modRequest.projectRoot;
  const podfilePath = path.join(projectRoot, "ios", "Podfile");

  if (!fs.existsSync(podfilePath)) {
    console.warn("Podfile not found. It will be created during prebuild.");
    return;
  }

  let podfileContent = fs.readFileSync(podfilePath, "utf8");

  if (!podfileContent.includes(`target '${EXTENSION_NAME}'`)) {
    const extensionPodTarget = `
target '${EXTENSION_NAME}' do
  use_frameworks! :linkage => :static
  pod 'GoogleWebRTC', '~> 1.1'
end`;

    // Add before post_install or at the end if no post_install
    if (podfileContent.includes("post_install do |installer|")) {
      podfileContent = podfileContent.replace(
        /post_install do \|installer\|/,
        extensionPodTarget + "\n\npost_install do |installer|"
      );
    } else {
      // Add at the end before the final 'end'
      const lastEndIndex = podfileContent.lastIndexOf("\nend");
      podfileContent =
        podfileContent.slice(0, lastEndIndex) +
        "\n" +
        extensionPodTarget +
        "\n" +
        podfileContent.slice(lastEndIndex);
    }

    // Ensure extension signing in post_install
    if (!podfileContent.includes("config.build_settings['DEVELOPMENT_TEAM']")) {
      const postInstallAddition = `
      # Configure extension signing
      if target.name == '${EXTENSION_NAME}'
        target.build_configurations.each do |config|
          config.build_settings['DEVELOPMENT_TEAM'] = '${TEAM_ID}'
          config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
        end
      end`;

      podfileContent = podfileContent.replace(
        "installer.pods_project.targets.each do |target|",
        "installer.pods_project.targets.each do |target|" + postInstallAddition
      );
    }

    fs.writeFileSync(podfilePath, podfileContent);
  }
}

async function createExtensionFiles(config) {
  const projectRoot = config.modRequest.projectRoot;
  const extensionPath = path.join(projectRoot, "ios", EXTENSION_NAME);

  if (!fs.existsSync(extensionPath)) {
    fs.mkdirSync(extensionPath, { recursive: true });
  }

  // Info.plist
  fs.writeFileSync(
    path.join(extensionPath, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDisplayName</key>
    <string>NomadCast</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>${EXTENSION_BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.broadcast-services-upload</string>
        <key>NSExtensionPrincipalClass</key>
        <string>$(PRODUCT_MODULE_NAME).SampleHandler</string>
        <key>RPBroadcastProcessMode</key>
        <string>RPBroadcastProcessModeSampleBuffer</string>
    </dict>
</dict>
</plist>`
  );

  // Entitlements file (CRITICAL for signing)
  fs.writeFileSync(
    path.join(extensionPath, `${EXTENSION_NAME}.entitlements`),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP}</string>
    </array>
</dict>
</plist>`
  );

  // SampleHandler.swift
  fs.writeFileSync(
    path.join(extensionPath, "SampleHandler.swift"),
    `import ReplayKit
import WebRTC

struct SignalMessage: Codable {
    let type: String
    let sdp: String?
    let candidate: Candidate?
}

struct Candidate: Codable {
    let sdp: String
    let sdpMLineIndex: Int32
    let sdpMid: String?
}

class SignalingClient {
    private var webSocket: URLSessionWebSocketTask?
    var onReceiveSdp: ((RTCSessionDescription) -> Void)?
    var onReceiveCandidate: ((RTCIceCandidate) -> Void)?

    func connect(url: URL) {
        let session = URLSession(configuration: .default)
        webSocket = session.webSocketTask(with: url)
        webSocket?.resume()
        receive()
    }

    func send(sdp: RTCSessionDescription) {
        let message = SignalMessage(type: sdp.type == .offer ? "offer" : "answer", sdp: sdp.sdp, candidate: nil)
        if let data = try? JSONEncoder().encode(message) {
            webSocket?.send(.data(data)) { _ in }
        }
    }

    func send(candidate: RTCIceCandidate) {
        let cand = Candidate(sdp: candidate.sdp, sdpMLineIndex: candidate.sdpMLineIndex, sdpMid: candidate.sdpMid)
        let message = SignalMessage(type: "candidate", sdp: nil, candidate: cand)
        if let data = try? JSONEncoder().encode(message) {
            webSocket?.send(.data(data)) { _ in }
        }
    }

    private func receive() {
        webSocket?.receive { [weak self] result in
            if case .success(let message) = result,
               case .data(let data) = message,
               let decoded = try? JSONDecoder().decode(SignalMessage.self, from: data) {
                if decoded.type == "answer", let sdp = decoded.sdp {
                    self?.onReceiveSdp?(RTCSessionDescription(type: .answer, sdp: sdp))
                } else if decoded.type == "candidate", let cand = decoded.candidate {
                    self?.onReceiveCandidate?(RTCIceCandidate(
                        sdp: cand.sdp,
                        sdpMLineIndex: cand.sdpMLineIndex,
                        sdpMid: cand.sdpMid
                    ))
                }
            }
            self?.receive()
        }
    }
    
    func disconnect() {
        webSocket?.cancel(with: .goingAway, reason: nil)
    }
}

class SampleHandler: RPBroadcastSampleHandler {
    private let appGroup = "${APP_GROUP}"
    private var peerConnection: RTCPeerConnection?
    private var videoSource: RTCVideoSource?
    private var videoTrack: RTCVideoTrack?
    private let signalingClient = SignalingClient()
    private var peerConnectionFactory: RTCPeerConnectionFactory?

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroup),
              let serverUrlString = sharedDefaults.string(forKey: "signalingServer"),
              let signalingUrl = URL(string: serverUrlString) else {
            finishBroadcastWithError(NSError(domain: "NomadCast", code: -1))
            return
        }
        
        sharedDefaults.set(true, forKey: "broadcasting")
        setupWebRTC()
        signalingClient.connect(url: signalingUrl)
        
        signalingClient.onReceiveSdp = { [weak self] sdp in
            self?.peerConnection?.setRemoteDescription(sdp) { _ in }
        }
        signalingClient.onReceiveCandidate = { [weak self] candidate in
            self?.peerConnection?.add(candidate)
        }
    }

    private func setupWebRTC() {
        RTCInitializeSSL()
        peerConnectionFactory = RTCPeerConnectionFactory()
        
        let config = RTCConfiguration()
        config.iceServers = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])]
        
        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        peerConnection = peerConnectionFactory!.peerConnection(with: config, constraints: constraints, delegate: self)
        
        videoSource = peerConnectionFactory!.videoSource()
        videoTrack = peerConnectionFactory!.videoTrack(with: videoSource!, trackId: "video0")
        peerConnection?.add(videoTrack!, streamIds: ["stream0"])
        
        peerConnection?.offer(for: constraints) { [weak self] sdp, _ in
            guard let sdp = sdp else { return }
            self?.peerConnection?.setLocalDescription(sdp) { _ in
                self?.signalingClient.send(sdp: sdp)
            }
        }
    }

    override func broadcastFinished() {
        signalingClient.disconnect()
        peerConnection?.close()
        
        if let sharedDefaults = UserDefaults(suiteName: appGroup) {
            sharedDefaults.set(false, forKey: "broadcasting")
        }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer),
              let videoSource = videoSource else { return }
        
        let timeStampNs = Int64(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1_000_000_000)
        let rtcPixelBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let rtcVideoFrame = RTCVideoFrame(buffer: rtcPixelBuffer, rotation: ._0, timeStampNs: timeStampNs)
        videoSource.capturer(nil, didCapture: rtcVideoFrame)
    }
}

extension SampleHandler: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange state: RTCPeerConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        signalingClient.send(candidate: candidate)
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}`
  );
}

module.exports = withWebRTCBroadcast;

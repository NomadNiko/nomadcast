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

  // Create extension files FIRST
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      await createExtensionFiles(config);
      return config;
    },
  ]);

  // Configure Xcode project with proper embedding
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const appName = config.name;
    addBroadcastExtensionWithEmbedding(xcodeProject, appName);
    return config;
  });

  // Fix Podfile LAST
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      await fixPodfileForExtension(config);
      return config;
    },
  ]);

  return config;
};

function addBroadcastExtensionWithEmbedding(xcodeProject, appName) {
  // Check if extension already exists
  if (xcodeProject.pbxTargetByName(EXTENSION_NAME)) {
    console.log(`${EXTENSION_NAME} target already exists.`);
    return;
  }

  // Add the extension target
  const target = xcodeProject.addTarget(
    EXTENSION_NAME,
    "app_extension",
    EXTENSION_NAME,
    `${appName}/${EXTENSION_NAME}` // Important: Use app name in path
  );

  const projectUuid = xcodeProject.getFirstProject().uuid;
  const targetUuid = target.uuid;
  const mainTarget = xcodeProject.getFirstTarget();
  const mainTargetUuid = mainTarget.uuid;

  // CRITICAL: Add the extension to the main app's embedded app extensions
  xcodeProject.addBuildPhase(
    [`${EXTENSION_NAME}.appex`],
    "PBXCopyFilesBuildPhase",
    "Embed App Extensions",
    mainTargetUuid,
    "app_extension",
    "13" // destination: PlugIns folder
  );

  // Configure target attributes
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
  ] = {
    enabled: 1,
  };

  // Add dependency from main app to extension
  xcodeProject.addTargetDependency(mainTargetUuid, [targetUuid]);

  // Add frameworks
  xcodeProject.addFramework("ReplayKit.framework", { target: targetUuid });

  // Configure build settings
  const configurations = xcodeProject.pbxXCBuildConfigurationSection();
  for (const key in configurations) {
    const config = configurations[key];
    if (config && config.buildSettings && !key.endsWith("_comment")) {
      const extensionTarget = xcodeProject.pbxTargetByName(EXTENSION_NAME);
      if (extensionTarget && extensionTarget.buildConfigurationList) {
        const configList =
          xcodeProject.pbxXCConfigurationList()[
            extensionTarget.buildConfigurationList
          ];
        if (configList && configList.buildConfigurations) {
          const isExtensionConfig = configList.buildConfigurations.some(
            (conf) => conf.value === key
          );
          if (isExtensionConfig) {
            config.buildSettings = {
              ...config.buildSettings,
              PRODUCT_BUNDLE_IDENTIFIER: EXTENSION_BUNDLE_ID,
              PRODUCT_NAME: EXTENSION_NAME,
              SWIFT_VERSION: "5.0",
              TARGETED_DEVICE_FAMILY: "1,2",
              IPHONEOS_DEPLOYMENT_TARGET: "14.0",
              DEVELOPMENT_TEAM: TEAM_ID,
              CODE_SIGN_STYLE: "Automatic",
              INFOPLIST_FILE: `${appName}/${EXTENSION_NAME}/Info.plist`,
              CODE_SIGN_ENTITLEMENTS: `${appName}/${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`,
              LD_RUNPATH_SEARCH_PATHS:
                "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks",
              SKIP_INSTALL: "YES",
            };
          }
        }
      }
    }
  }

  // Add extension files to project
  const extensionGroup = xcodeProject.addPbxGroup(
    [],
    EXTENSION_NAME,
    EXTENSION_NAME
  );

  // Add Swift file
  xcodeProject.addSourceFile(
    `${appName}/${EXTENSION_NAME}/SampleHandler.swift`,
    { target: targetUuid },
    extensionGroup.uuid
  );

  // Add Info.plist
  xcodeProject.addFile(
    `${appName}/${EXTENSION_NAME}/Info.plist`,
    extensionGroup.uuid
  );

  // Add entitlements
  xcodeProject.addFile(
    `${appName}/${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`,
    extensionGroup.uuid
  );
}

async function fixPodfileForExtension(config) {
  const projectRoot = config.modRequest.projectRoot;
  const appName = config.name;
  const podfilePath = path.join(projectRoot, "ios", "Podfile");

  if (!fs.existsSync(podfilePath)) {
    console.log("Podfile not found, will be created during build");
    return;
  }

  let podfileContent = fs.readFileSync(podfilePath, "utf8");

  // Check if extension target already exists
  if (podfileContent.includes(`target '${appName}-${EXTENSION_NAME}'`)) {
    console.log("Extension target already exists in Podfile");
    return;
  }

  // Find the main target end
  const mainTargetRegex = new RegExp(
    `target ['"]${appName}['"] do([\\s\\S]*?)^end`,
    "gm"
  );
  const match = mainTargetRegex.exec(podfileContent);

  if (!match) {
    console.error("Could not find main target in Podfile");
    return;
  }

  // Add extension target after the main target
  const extensionTarget = `

target '${appName}-${EXTENSION_NAME}' do
  inherit! :search_paths
  # Pods for BroadcastExtension
end`;

  const insertPosition = match.index + match[0].length;
  podfileContent =
    podfileContent.slice(0, insertPosition) +
    extensionTarget +
    podfileContent.slice(insertPosition);

  fs.writeFileSync(podfilePath, podfileContent);
  console.log("Updated Podfile with BroadcastExtension target");
}

async function createExtensionFiles(config) {
  const projectRoot = config.modRequest.projectRoot;
  const appName = config.name;
  const extensionPath = path.join(projectRoot, "ios", appName, EXTENSION_NAME);

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

  // Entitlements
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

class SampleHandler: RPBroadcastSampleHandler {
    private let appGroup = "${APP_GROUP}"

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        super.broadcastStarted(withSetupInfo: setupInfo)
        
        if let sharedDefaults = UserDefaults(suiteName: appGroup) {
            sharedDefaults.set(true, forKey: "broadcasting")
            sharedDefaults.synchronize()
        }
    }

    override func broadcastFinished() {
        if let sharedDefaults = UserDefaults(suiteName: appGroup) {
            sharedDefaults.set(false, forKey: "broadcasting")
            sharedDefaults.synchronize()
        }
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        // Process sample buffer here
    }
}`
  );
}

module.exports = withWebRTCBroadcast;

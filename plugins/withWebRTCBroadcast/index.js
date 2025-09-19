// plugins/withWebRTCBroadcast/index.js
const {
  withXcodeProject,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BUNDLE_ID = "com.devnomad.nomadcast";
const TEAM_ID = "843CNLD5C9";
const APP_GROUP = "group.com.devnomad.nomadcast.broadcast";
const EXTENSION_NAME = "BroadcastExtension";
const EXTENSION_BUNDLE_ID = `${BUNDLE_ID}.${EXTENSION_NAME}`;

// Helper function
const quoted = (str) => `"${str}"`;

const withWebRTCBroadcast = (config) => {
  // Step 1: Add app group to main app
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.security.application-groups"] = [APP_GROUP];
    return config;
  });

  // Step 2: Update Info.plist with extension info
  config = withInfoPlist(config, (config) => {
    config.modResults.RTCAppGroupIdentifier = APP_GROUP;
    config.modResults.RTCScreenSharingExtension = EXTENSION_BUNDLE_ID;
    config.modResults.RTCScreenSharingExtensionName = EXTENSION_BUNDLE_ID;
    return config;
  });

  // Step 3: Create extension files
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const extensionPath = path.join(
        config.modRequest.platformProjectRoot,
        EXTENSION_NAME
      );

      await fs.promises.mkdir(extensionPath, { recursive: true });

      // Create Info.plist with ALL required keys
      await fs.promises.writeFile(
        path.join(extensionPath, "Info.plist"),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>BroadcastExtension</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>com.devnomad.nomadcast.BroadcastExtension</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
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

      // Create Entitlements
      await fs.promises.writeFile(
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

      // Create SampleHandler.swift
      await fs.promises.writeFile(
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

      return config;
    },
  ]);

  // Step 4: Add extension target to Xcode project
  config = withXcodeProject(config, (config) => {
    const proj = config.modResults;
    const appName = config.modRequest.projectName;

    // Check if target already exists (important for idempotency)
    if (proj.pbxTargetByName(EXTENSION_NAME)) {
      console.log("Extension target already exists, skipping");
      return config;
    }

    addBroadcastExtensionXcodeTarget(proj, {
      appName,
      extensionName: EXTENSION_NAME,
      extensionBundleIdentifier: EXTENSION_BUNDLE_ID,
      currentProjectVersion: config.ios?.buildNumber || "1",
      marketingVersion: config.version || "1.0.0",
      appleTeamId: TEAM_ID,
    });

    return config;
  });

  return config;
};

function addBroadcastExtensionXcodeTarget(
  proj,
  {
    appName,
    extensionName,
    extensionBundleIdentifier,
    currentProjectVersion,
    marketingVersion,
    appleTeamId,
  }
) {
  // Only add if not already present
  if (proj.getFirstProject().firstProject.targets?.length > 1) return;

  const targetUuid = proj.generateUuid();
  const groupName = "Embed App Extensions";

  // Add XCConfigurationList
  const xCConfigurationList = addXCConfigurationList(proj, {
    extensionBundleIdentifier,
    currentProjectVersion,
    marketingVersion,
    extensionName,
    appleTeamId,
  });

  // Add Product File
  const productFile = addProductFile(proj, extensionName, groupName);

  // Add Native Target
  const target = addToPbxNativeTargetSection(proj, {
    extensionName,
    targetUuid,
    productFile,
    xCConfigurationList,
  });

  // Add to Project Section
  addToPbxProjectSection(proj, target, appleTeamId);

  // Add Target Dependency
  addTargetDependency(proj, target);

  // Add ReplayKit Framework
  const frameworkFile = proj.addFramework("ReplayKit.framework", {
    target: target.uuid,
    link: false,
  });

  // Add Build Phases
  addBuildPhases(
    proj,
    {
      groupName,
      productFile,
      targetUuid,
      frameworkPath: frameworkFile.path,
    },
    extensionName
  );

  // Add PBXGroup
  addPbxGroup(proj, productFile, extensionName);

  // Update main app build settings
  proj.updateBuildProperty(
    "ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES",
    "YES",
    null,
    proj.getFirstTarget().firstTarget.name
  );
  proj.updateBuildProperty("IPHONEOS_DEPLOYMENT_TARGET", "15.1");
}

function addXCConfigurationList(
  proj,
  {
    extensionBundleIdentifier,
    currentProjectVersion,
    marketingVersion,
    extensionName,
    appleTeamId,
  }
) {
  const commonBuildSettings = {
    CLANG_ANALYZER_NONNULL: "YES",
    CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION: "YES_AGGRESSIVE",
    CLANG_CXX_LANGUAGE_STANDARD: quoted("gnu++17"),
    CLANG_ENABLE_MODULES: "YES",
    CLANG_ENABLE_OBJC_WEAK: "YES",
    CLANG_WARN_DOCUMENTATION_COMMENTS: "YES",
    CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER: "YES",
    CLANG_WARN_UNGUARDED_AVAILABILITY: "YES_AGGRESSIVE",
    CODE_SIGN_ENTITLEMENTS: `${extensionName}/${extensionName}.entitlements`,
    CODE_SIGN_STYLE: "Automatic",
    CURRENT_PROJECT_VERSION: currentProjectVersion,
    DEVELOPMENT_TEAM: appleTeamId,
    GCC_C_LANGUAGE_STANDARD: "gnu11",
    GENERATE_INFOPLIST_FILE: "NO",
    INFOPLIST_FILE: `${extensionName}/Info.plist`,
    INFOPLIST_KEY_CFBundleDisplayName: extensionName,
    INFOPLIST_KEY_NSHumanReadableCopyright: quoted(""),
    IPHONEOS_DEPLOYMENT_TARGET: "15.1",
    LD_RUNPATH_SEARCH_PATHS: quoted(
      "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"
    ),
    MARKETING_VERSION: marketingVersion,
    MTL_FAST_MATH: "YES",
    PRODUCT_BUNDLE_IDENTIFIER: "com.devnomad.nomadcast.BroadcastExtension", // Hardcoded
    PRODUCT_NAME: quoted("$(TARGET_NAME)"),
    SKIP_INSTALL: "YES",
    SWIFT_EMIT_LOC_STRINGS: "YES",
    SWIFT_VERSION: "5.0",
    TARGETED_DEVICE_FAMILY: quoted("1,2"),
  };

  const buildConfigurationsList = [
    {
      name: "Debug",
      isa: "XCBuildConfiguration",
      buildSettings: {
        ...commonBuildSettings,
        DEBUG_INFORMATION_FORMAT: "dwarf",
        MTL_ENABLE_DEBUG_INFO: "INCLUDE_SOURCE",
        SWIFT_ACTIVE_COMPILATION_CONDITIONS: "DEBUG",
        SWIFT_OPTIMIZATION_LEVEL: quoted("-Onone"),
      },
    },
    {
      name: "Release",
      isa: "XCBuildConfiguration",
      buildSettings: {
        ...commonBuildSettings,
        COPY_PHASE_STRIP: "NO",
        DEBUG_INFORMATION_FORMAT: quoted("dwarf-with-dsym"),
        SWIFT_OPTIMIZATION_LEVEL: quoted("-Owholemodule"),
      },
    },
  ];

  return proj.addXCConfigurationList(
    buildConfigurationsList,
    "Release",
    `Build configuration list for PBXNativeTarget ${quoted(extensionName)}`
  );
}

function addProductFile(proj, extensionName, groupName) {
  const productFile = {
    basename: `${extensionName}.appex`,
    fileRef: proj.generateUuid(),
    uuid: proj.generateUuid(),
    group: groupName,
    explicitFileType: "wrapper.app-extension",
    settings: {
      ATTRIBUTES: ["RemoveHeadersOnCopy"],
    },
    includeInIndex: 0,
    path: `${extensionName}.appex`,
    sourceTree: "BUILT_PRODUCTS_DIR",
  };

  proj.addToPbxFileReferenceSection(productFile);
  proj.addToPbxBuildFileSection(productFile);

  return productFile;
}

function addToPbxNativeTargetSection(
  proj,
  { extensionName, targetUuid, productFile, xCConfigurationList }
) {
  const target = {
    uuid: targetUuid,
    pbxNativeTarget: {
      isa: "PBXNativeTarget",
      buildConfigurationList: xCConfigurationList.uuid,
      buildPhases: [],
      buildRules: [],
      dependencies: [],
      name: extensionName,
      productName: extensionName,
      productReference: productFile.fileRef,
      productType: quoted("com.apple.product-type.app-extension"),
    },
  };

  proj.addToPbxNativeTargetSection(target);
  return target;
}

function addToPbxProjectSection(proj, target, appleTeamId) {
  proj.addToPbxProjectSection(target);

  // Add target attributes
  if (
    !proj.pbxProjectSection()[proj.getFirstProject().uuid].attributes
      .TargetAttributes
  ) {
    proj.pbxProjectSection()[
      proj.getFirstProject().uuid
    ].attributes.TargetAttributes = {};
  }

  proj.pbxProjectSection()[
    proj.getFirstProject().uuid
  ].attributes.LastSwiftUpdateCheck = 1340;
  proj.pbxProjectSection()[
    proj.getFirstProject().uuid
  ].attributes.TargetAttributes[target.uuid] = {
    CreatedOnToolsVersion: "14.0",
    DevelopmentTeam: appleTeamId,
    ProvisioningStyle: "Automatic",
  };
}

function addTargetDependency(proj, target) {
  if (!proj.hash.project.objects["PBXTargetDependency"]) {
    proj.hash.project.objects["PBXTargetDependency"] = {};
  }
  if (!proj.hash.project.objects["PBXContainerItemProxy"]) {
    proj.hash.project.objects["PBXContainerItemProxy"] = {};
  }

  proj.addTargetDependency(proj.getFirstTarget().uuid, [target.uuid]);
}

function addBuildPhases(
  proj,
  { groupName, productFile, targetUuid, frameworkPath },
  extensionName
) {
  const buildPath = quoted("");

  // Sources build phase
  proj.addBuildPhase(
    ["SampleHandler.swift"],
    "PBXSourcesBuildPhase",
    "Sources",
    targetUuid,
    "app_extension",
    buildPath
  );

  // Copy files build phase (embed extension)
  proj.addBuildPhase(
    [productFile.path],
    "PBXCopyFilesBuildPhase",
    groupName,
    proj.getFirstTarget().uuid,
    "app_extension",
    buildPath
  );

  // Frameworks build phase
  proj.addBuildPhase(
    [frameworkPath],
    "PBXFrameworksBuildPhase",
    "Frameworks",
    targetUuid,
    "app_extension",
    buildPath
  );

  // Resources build phase
  proj.addBuildPhase(
    [],
    "PBXResourcesBuildPhase",
    "Resources",
    targetUuid,
    "app_extension",
    buildPath
  );
}

function addPbxGroup(proj, productFile, extensionName) {
  const { uuid: pbxGroupUuid } = proj.addPbxGroup(
    ["SampleHandler.swift", "Info.plist", `${extensionName}.entitlements`],
    extensionName,
    extensionName
  );

  const groups = proj.hash.project.objects["PBXGroup"];
  if (pbxGroupUuid) {
    Object.keys(groups).forEach(function (key) {
      if (groups[key].name === undefined && groups[key].path === undefined) {
        proj.addToPbxGroup(pbxGroupUuid, key);
      } else if (groups[key].name === "Products") {
        proj.addToPbxGroup(productFile, key);
      }
    });
  }
}

module.exports = withWebRTCBroadcast;

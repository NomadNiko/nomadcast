# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NomadCast is an Expo React Native application for iOS broadcasting with WebRTC capabilities. The app uses a custom native module for iOS screen broadcasting through ReplayKit.

## Development Commands

### Running the Application
```bash
# Start the Expo development server
npm start

# Run on specific platforms
npm run ios     # iOS simulator
npm run android # Android emulator
npm run web     # Web browser

# Lint code
npm run lint

# Reset project (moves current app to app-example)
npm run reset-project
```

### Building with EAS
```bash
# Development build with dev client
eas build --profile development --platform ios

# Production build with auto-increment
eas build --profile production --platform ios
```

## Architecture

### iOS Broadcast Extension
The app includes a custom iOS broadcast extension for screen sharing:
- **Plugin Location**: `plugins/withWebRTCBroadcast/index.js`
- **Extension Name**: BroadcastExtension
- **Bundle ID**: com.devnomad.nomadcast.BroadcastExtension
- **App Group**: group.com.devnomad.nomadcast.broadcast

The extension is automatically configured through an Expo config plugin that:
1. Creates the broadcast extension target in Xcode
2. Sets up app group entitlements for IPC between app and extension
3. Configures Info.plist for ReplayKit integration
4. Generates SampleHandler.swift for processing broadcast frames

### Native Module Integration
- **BroadcastManager**: Native module accessed via `expo-modules-core` for controlling broadcasts
- Provides methods: `startBroadcast()`, `stopBroadcast()`, `isBroadcasting()`
- Status polling implemented in `components/BroadcastControl.tsx`

### Project Structure
- **app/**: File-based routing with Expo Router
  - `(tabs)/`: Tab navigation screens
  - `_layout.tsx`: Root layout configuration
- **components/**: Reusable UI components
  - `BroadcastControl.tsx`: Main broadcast control interface
  - Themed components for consistent styling
- **plugins/**: Expo config plugins for native modifications

## Key Configuration Files
- **app.json**: Expo configuration with iOS-specific settings for broadcasting
- **eas.json**: EAS Build profiles for development and production
- **tsconfig.json**: TypeScript configuration with path alias `@/*`

## iOS-Specific Requirements
- Minimum iOS version: 15.1
- Required entitlements: Application Groups
- Info.plist keys configured for microphone, camera, and local network access
- Background modes: audio, voip
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'BroadcastManager'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = 'Native module for managing iOS broadcast extension and screen sharing'
  s.license        = package['license']
  s.author         = package['author'] || 'Unknown'
  s.homepage       = 'https://github.com/expo/expo'
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { :git => 'https://github.com/expo/expo.git', :tag => 'v1.0.0' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'React-Core'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
  s.frameworks = ['ReplayKit']
end
Pod::Spec.new do |s|
  s.name           = 'DriftWallpaper'
  s.version        = '0.1.0'
  s.summary        = 'Saves Drift wallpapers as Live Photos'
  s.description    = 'Renders a Drift wallpaper loop to a Live Photo and saves it to the photo library.'
  s.author         = 'CyKrome'
  s.homepage       = 'https://github.com/CyKrome-Nexus/drift'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.swift_version  = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
end

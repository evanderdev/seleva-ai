Pod::Spec.new do |s|
  s.name = 'SelevaPhotoEngine'
  s.version = '0.0.1'
  s.summary = 'Local photo library access for SelevaAI'
  s.description = 'Private native photo library capabilities and permissions.'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'SelevaAI'
  s.homepage = 'https://github.com/evanderdev/seleva-ai'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/evanderdev/seleva-ai.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Photos'
  s.swift_version = '5.9'
  s.source_files = '**/*.{h,m,mm,swift}'
end

# Build debug APK + install ke device (env ANDROID_SERIAL, default 9a9e4f65)
$ErrorActionPreference="Stop"
$root = $PSScriptRoot
if (!$root) { $root = "D:\Opencode" }
$device = $env:ANDROID_SERIAL
if (!$device) { $device = "9a9e4f65" }
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
Push-Location "$root\CyberPosApp"
# download gradle wrapper jar jika belum ada (pinned ke tag v8.7.0, bukan master)
if(!(Test-Path ".\gradle\wrapper\gradle-wrapper.jar")){
  New-Item -ItemType Directory -Force -Path ".\gradle\wrapper" | Out-Null
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $wrapperUrl = "https://github.com/gradle/gradle/raw/v8.7.0/gradle/wrapper/gradle-wrapper.jar"
  Invoke-WebRequest -Uri $wrapperUrl -OutFile ".\gradle\wrapper\gradle-wrapper.jar"
  $hash = (Get-FileHash ".\gradle\wrapper\gradle-wrapper.jar" -Algorithm SHA256).Hash.ToLower()
  Write-Host "gradle-wrapper.jar SHA256: $hash"
  if($env:GRADLE_WRAPPER_SHA256){
    if($hash -ne $env:GRADLE_WRAPPER_SHA256.ToLower()){
      Remove-Item ".\gradle\wrapper\gradle-wrapper.jar" -Force
      throw "SHA256 gradle-wrapper.jar tidak cocok. Set GRADLE_WRAPPER_SHA256 yang benar."
    }
  } else {
    Write-Warning "GRADLE_WRAPPER_SHA256 belum di-set - hash di atas belum diverifikasi. Set env untuk pin penuh."
  }
}
@"
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.7-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
"@ | Set-Content ".\gradle\wrapper\gradle-wrapper.properties"
# gradlew sederhana pakai java langsung
if(!(Test-Path ".\gradlew.bat")){
  Set-Content ".\gradlew.bat" 'java -cp "gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*'
}
.\gradlew.bat assembleDebug --no-daemon
Pop-Location
$apk="$root\CyberPosApp\app\build\outputs\apk\debug\app-debug.apk"
adb devices
adb -s $device install -r $apk
adb -s $device shell am start -n id.my.cyberpos/.MainActivity
Write-Host "SELESAI: APK terinstall ke $device & auto-login jalan ke https://cyberpos.my.id"

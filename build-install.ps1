# Build debug APK + install ke device 9a9e4f65
$ErrorActionPreference="Stop"
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
Set-Location "E:\Opencode\CyberPosApp"
# download gradle wrapper jar jika belum ada
if(!(Test-Path ".\gradle\wrapper\gradle-wrapper.jar")){
  New-Item -ItemType Directory -Force -Path ".\gradle\wrapper" | Out-Null
  Invoke-WebRequest -Uri "https://github.com/gradle/gradle/raw/master/gradle/wrapper/gradle-wrapper.jar" -OutFile ".\gradle\wrapper\gradle-wrapper.jar"
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
$apk="app\build\outputs\apk\debug\app-debug.apk"
adb devices
adb -s 9a9e4f65 install -r $apk
adb -s 9a9e4f65 shell am start -n id.my.cyberpos/.MainActivity
Write-Host "SELESAI: APK terinstall & auto-login jalan ke https://cyberpos.my.id"

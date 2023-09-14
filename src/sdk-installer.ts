import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as tc from '@actions/tool-cache';
import * as fs from 'fs';

const BUILD_TOOLS_VERSION = '33.0.2';
// SDK command-line tools 9.0
const CMDLINE_TOOLS_URL_MAC = 'https://dl.google.com/android/repository/commandlinetools-mac-9477386_latest.zip';
const CMDLINE_TOOLS_URL_LINUX = 'https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip';
const BASE_ANDROID_SDK_URL_MAC = 'https://dl.google.com/android/repository/sdk-tools-darwin-4333796.zip';
const BASE_ANDROID_SDK_URL_LINUX = 'https://dl.google.com/android/repository/sdk-tools-linux-4333796.zip';

/**
 * Installs & updates the Android SDK for the macOS platform, including SDK platform for the chosen API level, latest build tools, platform tools, Android Emulator,
 * and the system image for the chosen API level, CPU arch, and target.
 */
export async function installAndroidSdk(apiLevel: string, target: string, arch: string, channelId: number, emulatorBuild?: string, ndkVersion?: string, cmakeVersion?: string): Promise<void> {
  try {
    console.log(`::group::Install Android SDK`);
    const isOnMac = process.platform === 'darwin';
    const isArm = process.arch === 'arm64';

    // Check if ANDROID_HOME is set.
    if (!process.env.ANDROID_HOME) {
      core.setFailed('ANDROID_HOME is a required environment variable and is not set.\nPlease double check your host settings.');
      return;
    }

    if (fs.existsSync(process.env.ANDROID_HOME)) {
      console.log('Using previous installation of base Android SDK, found on ${process.env.ANDROID_HOME}');
    } else {
      const installed = await installBaseSdk();
      if (!installed) {
        core.setFailed('Could not install base Android SDK.');
        return;
      }
      const licenses = await acceptLicenses();
      if (!installed || !licenses) {
        core.setFailed('Could not accept Android SDK licenses.');
        return;
      }
    }

    // self-hosted
    const selfHosted = core.getInput('self-hosted');

    // It is not required to configure permissions on self-hosted and macos
    // environment.
    if (!isOnMac && !selfHosted) {
      await exec.exec(`sh -c \\"sudo chown $USER:$USER ${process.env.ANDROID_HOME} -R`);
    }

    const cmdlineToolsPath = `${process.env.ANDROID_HOME}/cmdline-tools`;
    if (!fs.existsSync(cmdlineToolsPath)) {
      console.log('Installing new cmdline-tools.');
      const sdkUrl = isOnMac ? CMDLINE_TOOLS_URL_MAC : CMDLINE_TOOLS_URL_LINUX;
      const downloadPath = await tc.downloadTool(sdkUrl);
      await tc.extractZip(downloadPath, cmdlineToolsPath);
      await io.mv(`${cmdlineToolsPath}/cmdline-tools`, `${cmdlineToolsPath}/latest`);
    }

    // add paths for commandline-tools and platform-tools
    core.addPath(`${cmdlineToolsPath}/latest:${cmdlineToolsPath}/latest/bin:${process.env.ANDROID_HOME}/platform-tools`);

    // set standard AVD path
    core.exportVariable('ANDROID_AVD_HOME', `${process.env.HOME}/.android/avd`);

    // accept all Android SDK licenses
    await exec.exec(`sh -c \\"yes | sdkmanager --licenses > /dev/null"`);

    console.log('Installing latest build tools, platform tools, and platform.');

    await exec.exec(`sh -c \\"sdkmanager --install 'build-tools;${BUILD_TOOLS_VERSION}' platform-tools > /dev/null"`);

    console.log('Installing latest emulator.');
    await exec.exec(`sh -c \\"sdkmanager --install emulator --channel=${channelId} > /dev/null"`);

    if (emulatorBuild) {
      console.log(`Installing emulator build ${emulatorBuild}.`);
      // TODO find out the correct download URLs for all build ids
      var downloadUrlSuffix: string;
      const majorBuildVersion = Number(emulatorBuild);
      if (majorBuildVersion >= 8000000) {
        if (isArm) {
          downloadUrlSuffix = `_aarch64-${emulatorBuild}`;
        } else {
          downloadUrlSuffix = `_x64-${emulatorBuild}`;
        }
      } else if (majorBuildVersion >= 7000000) {
        downloadUrlSuffix = `_x64-${emulatorBuild}`;
      } else {
        downloadUrlSuffix = `-${emulatorBuild}`;
      }
      await exec.exec(`curl -fo emulator.zip https://dl.google.com/android/repository/emulator-${isOnMac ? 'darwin' : 'linux'}${downloadUrlSuffix}.zip`);
      await exec.exec(`unzip -o -q emulator.zip -d ${process.env.ANDROID_HOME}`);
      await io.rmRF('emulator.zip');
    }

    console.log('Installing platforms.');
    await exec.exec(`sh -c \\"sdkmanager 'platform-tools' 'platforms;android-${apiLevel}' > /dev/null"`);

    console.log('Installing system images.');
    await exec.exec(`sh -c \\"sdkmanager --install 'system-images;android-${apiLevel};${target};${arch}' --channel=${channelId} > /dev/null"`);

    if (ndkVersion) {
      console.log(`Installing NDK ${ndkVersion}.`);
      await exec.exec(`sh -c \\"sdkmanager --install 'ndk;${ndkVersion}' --channel=${channelId} > /dev/null"`);
    }
    if (cmakeVersion) {
      console.log(`Installing CMake ${cmakeVersion}.`);
      await exec.exec(`sh -c \\"sdkmanager --install 'cmake;${cmakeVersion}' --channel=${channelId} > /dev/null"`);
    }
  } finally {
    console.log(`::endgroup::`);
  }
}

async function installBaseSdk() {
  const isOnMac = process.platform === 'darwin';
  const baseSdkUrl = isOnMac ? BASE_ANDROID_SDK_URL_MAC : BASE_ANDROID_SDK_URL_LINUX;
  const androidTmpPath = '/tmp/android-sdk.zip';
  const androidHome = process.env.ANDROID_HOME;
  console.log(`Installing Android SDK on ${androidHome}`);

  // Backup existing .android folder.
  const sdkHome = `${androidHome}/sdk_home`;
  core.exportVariable('ANDROID_SDK_HOME', sdkHome);
  if (fs.existsSync(sdkHome)) {
    await exec.exec(`mv ${sdkHome} ${sdkHome}.backup.${Date.now()}`);
  }

  await exec.exec(`curl -L ${baseSdkUrl} -o ${androidTmpPath} -s`);
  await exec.exec(`unzip -q ${androidTmpPath} -d ${androidHome}`);
  await exec.exec(`rm ${androidTmpPath}`);
  await exec.exec(`mkdir -p ${sdkHome}`);

  const extraPaths = [`${androidHome}/bin`, `${androidHome}/tools`, `${androidHome}/tools/bin`, `${androidHome}/platform-tools`, `${androidHome}/platform-tools/bin`];

  for (const path in extraPaths) {
    core.addPath(path);
  }

  return true;
}

async function acceptLicenses() {
  const androidHome = process.env.ANDROID_HOME;
  console.log(`Accepting Android SDK licenses on ${androidHome}`);

  // Check if licenses has being accepted.
  const acceptLicense = core.getInput('accept-android-sdk-license');
  if (!acceptLicense) {
    core.setFailed(
      "You can't use this in self-hosted environment unless you accept the Android SDK licenses. \nPlease read the license https://developer.android.com/studio/terms and accept the license to proceed."
    );
    return false;
  }

  await exec.exec(`mkdir -p ${process.env.ANDROID_SDK_HOME}`);
  await exec.exec(`touch ${process.env.ANDROID_SDK_HOME}/repositories.cfg`);
  await exec.exec(`mkdir -p ${androidHome}/licenses`);
  await exec.exec(`sh -c \\"yes 'y' | ${androidHome}/tools/bin/sdkmanager --licenses > /dev/null"`);
  return true;
}

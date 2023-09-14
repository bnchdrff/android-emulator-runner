"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installAndroidSdk = void 0;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const io = __importStar(require("@actions/io"));
const tc = __importStar(require("@actions/tool-cache"));
const fs = __importStar(require("fs"));
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
function installAndroidSdk(apiLevel, target, arch, channelId, emulatorBuild, ndkVersion, cmakeVersion) {
    return __awaiter(this, void 0, void 0, function* () {
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
            }
            else {
                const installed = yield installBaseSdk();
                if (!installed) {
                    core.setFailed('Could not install base Android SDK.');
                    return;
                }
                const licenses = yield acceptLicenses();
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
                yield exec.exec(`sh -c \\"sudo chown $USER:$USER ${process.env.ANDROID_HOME} -R`);
            }
            const cmdlineToolsPath = `${process.env.ANDROID_HOME}/cmdline-tools`;
            if (!fs.existsSync(cmdlineToolsPath)) {
                console.log('Installing new cmdline-tools.');
                const sdkUrl = isOnMac ? CMDLINE_TOOLS_URL_MAC : CMDLINE_TOOLS_URL_LINUX;
                const downloadPath = yield tc.downloadTool(sdkUrl);
                yield tc.extractZip(downloadPath, cmdlineToolsPath);
                yield io.mv(`${cmdlineToolsPath}/cmdline-tools`, `${cmdlineToolsPath}/latest`);
            }
            // add paths for commandline-tools and platform-tools
            core.addPath(`${cmdlineToolsPath}/latest:${cmdlineToolsPath}/latest/bin:${process.env.ANDROID_HOME}/platform-tools`);
            // set standard AVD path
            core.exportVariable('ANDROID_AVD_HOME', `${process.env.HOME}/.android/avd`);
            // accept all Android SDK licenses
            yield exec.exec(`sh -c \\"yes | sdkmanager --licenses > /dev/null"`);
            console.log('Installing latest build tools, platform tools, and platform.');
            yield exec.exec(`sh -c \\"sdkmanager --install 'build-tools;${BUILD_TOOLS_VERSION}' platform-tools > /dev/null"`);
            console.log('Installing latest emulator.');
            yield exec.exec(`sh -c \\"sdkmanager --install emulator --channel=${channelId} > /dev/null"`);
            if (emulatorBuild) {
                console.log(`Installing emulator build ${emulatorBuild}.`);
                // TODO find out the correct download URLs for all build ids
                var downloadUrlSuffix;
                const majorBuildVersion = Number(emulatorBuild);
                if (majorBuildVersion >= 8000000) {
                    if (isArm) {
                        downloadUrlSuffix = `_aarch64-${emulatorBuild}`;
                    }
                    else {
                        downloadUrlSuffix = `_x64-${emulatorBuild}`;
                    }
                }
                else if (majorBuildVersion >= 7000000) {
                    downloadUrlSuffix = `_x64-${emulatorBuild}`;
                }
                else {
                    downloadUrlSuffix = `-${emulatorBuild}`;
                }
                yield exec.exec(`curl -fo emulator.zip https://dl.google.com/android/repository/emulator-${isOnMac ? 'darwin' : 'linux'}${downloadUrlSuffix}.zip`);
                yield exec.exec(`unzip -o -q emulator.zip -d ${process.env.ANDROID_HOME}`);
                yield io.rmRF('emulator.zip');
            }
            console.log('Installing platforms.');
            yield exec.exec(`sh -c \\"sdkmanager 'platform-tools' 'platforms;android-${apiLevel}' > /dev/null"`);
            console.log('Installing system images.');
            yield exec.exec(`sh -c \\"sdkmanager --install 'system-images;android-${apiLevel};${target};${arch}' --channel=${channelId} > /dev/null"`);
            if (ndkVersion) {
                console.log(`Installing NDK ${ndkVersion}.`);
                yield exec.exec(`sh -c \\"sdkmanager --install 'ndk;${ndkVersion}' --channel=${channelId} > /dev/null"`);
            }
            if (cmakeVersion) {
                console.log(`Installing CMake ${cmakeVersion}.`);
                yield exec.exec(`sh -c \\"sdkmanager --install 'cmake;${cmakeVersion}' --channel=${channelId} > /dev/null"`);
            }
        }
        finally {
            console.log(`::endgroup::`);
        }
    });
}
exports.installAndroidSdk = installAndroidSdk;
function installBaseSdk() {
    return __awaiter(this, void 0, void 0, function* () {
        const isOnMac = process.platform === 'darwin';
        const baseSdkUrl = isOnMac ? BASE_ANDROID_SDK_URL_MAC : BASE_ANDROID_SDK_URL_LINUX;
        const androidTmpPath = '/tmp/android-sdk.zip';
        const androidHome = process.env.ANDROID_HOME;
        console.log(`Installing Android SDK on ${androidHome}`);
        // Backup existing .android folder.
        const sdkHome = `${androidHome}/sdk_home`;
        core.exportVariable('ANDROID_SDK_HOME', sdkHome);
        if (fs.existsSync(sdkHome)) {
            yield exec.exec(`mv ${sdkHome} ${sdkHome}.backup.${Date.now()}`);
        }
        yield exec.exec(`curl -L ${baseSdkUrl} -o ${androidTmpPath} -s`);
        yield exec.exec(`unzip -q ${androidTmpPath} -d ${androidHome}`);
        yield exec.exec(`rm ${androidTmpPath}`);
        yield exec.exec(`mkdir -p ${sdkHome}`);
        const extraPaths = [`${androidHome}/bin`, `${androidHome}/tools`, `${androidHome}/tools/bin`, `${androidHome}/platform-tools`, `${androidHome}/platform-tools/bin`];
        for (const path in extraPaths) {
            core.addPath(path);
        }
        return true;
    });
}
function acceptLicenses() {
    return __awaiter(this, void 0, void 0, function* () {
        const androidHome = process.env.ANDROID_HOME;
        console.log(`Accepting Android SDK licenses on ${androidHome}`);
        // Check if licenses has being accepted.
        const acceptLicense = core.getInput('accept-android-sdk-license');
        if (!acceptLicense) {
            core.setFailed("You can't use this in self-hosted environment unless you accept the Android SDK licenses. \nPlease read the license https://developer.android.com/studio/terms and accept the license to proceed.");
            return false;
        }
        yield exec.exec(`mkdir -p ${process.env.ANDROID_SDK_HOME}`);
        yield exec.exec(`touch ${process.env.ANDROID_SDK_HOME}/repositories.cfg`);
        yield exec.exec(`mkdir -p ${androidHome}/licenses`);
        yield exec.exec(`sh -c \\"yes 'y' | ${androidHome}/tools/bin/sdkmanager --licenses > /dev/null"`);
        return true;
    });
}

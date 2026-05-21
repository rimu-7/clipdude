const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '..', 'src-tauri', 'gen', 'android', 'app', 'build.gradle.kts');
let g = fs.readFileSync(gradlePath, 'utf8');

g = g.replace(
  /(android\s*\{)/,
  `$1
    signingConfigs {
        create("release") {
            storeFile = file("../release.keystore")
            storePassword = "android"
            keyAlias = "clipdude"
            keyPassword = "android"
        }
    }
`
);

g = g.replace(
  /(getByName\("release"\)\s*\{)/,
  `$1
            signingConfig = signingConfigs.getByName("release")`
);

g = g.replace(/ndk\s*\{[^}]*\}/g, '');

g = g.replace(
  /(\n\s*buildTypes)/,
  `
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a")
            isUniversalApk = true
        }
    }
$1`
);

fs.writeFileSync(gradlePath, g);
console.log('Configured signing & ABI splits');

import java.util.Properties

plugins {
    id("com.android.application")
}

// Release signing key lives outside the repo. Point MESS_POS_SIGNING at another
// properties file to override; without one, release builds come out unsigned.
val signingProps = Properties().apply {
    val path = System.getenv("MESS_POS_SIGNING") ?: "${System.getProperty("user.home")}/.android-keys/mess-pos.properties"
    file(path).takeIf { it.exists() }?.inputStream()?.use { load(it) }
}

android {
    namespace = "com.messsoft.pos"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.messsoft.pos"
        minSdk = 24 // Sunmi V2 runs Android 7.1
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (signingProps.containsKey("storeFile")) {
            create("release") {
                storeFile = file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.recyclerview:recyclerview:1.4.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("com.sunmi:printerlibrary:1.0.24")
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val configuredAppBaseUrl = providers.gradleProperty("APP_BASE_URL")
    .orElse("https://job-agent.onrender.com")
    .get()
    .trim()
    .trimEnd('/')

require(configuredAppBaseUrl.startsWith("https://")) {
    "APP_BASE_URL must use HTTPS."
}

android {
    namespace = "com.ahmed.jobagent"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ahmed.jobagent"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "APP_BASE_URL", "\"$configuredAppBaseUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

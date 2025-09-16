# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# React Native ProGuard rules
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.yoga.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jsc.** { *; }

# Keep React Native modules
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.modules.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Google Play Services
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Keep vector icons
-keep class com.oblador.vectoricons.** { *; }

# Keep app-specific classes (targeted rules only)
# Keep React Native modules and native modules
-keep class com.foci.mobile.** { @com.facebook.react.bridge.ReactMethod <methods>; }
-keep class com.foci.mobile.** { @com.facebook.react.bridge.DoNotStrip <methods>; }
-keep class com.foci.mobile.** { @com.facebook.react.bridge.DoNotStrip <fields>; }

# Keep classes with native methods
-keepclasseswithmembernames class com.foci.mobile.** {
    native <methods>;
}

# Keep classes used in reflection (add specific classes as needed)
# -keep class com.foci.mobile.SpecificReflectionClass { *; }

# Remove logging in release builds
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int i(...);
    public static int w(...);
    public static int d(...);
    public static int e(...);
}

# Optimize
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
-allowaccessmodification
-dontpreverify

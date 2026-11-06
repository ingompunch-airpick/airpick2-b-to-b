# Capacitor JS bridge · plugins
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }

# WebView JS interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Firebase / FCM
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

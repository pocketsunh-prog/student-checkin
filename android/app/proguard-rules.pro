# Keep kotlinx.serialization generated serializers for our model classes.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

-keepclassmembers class com.schoolcheck.kiosk.data.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.schoolcheck.kiosk.data.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}

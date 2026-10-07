# CyberPOS ProGuard rules — default minimal, R8 pakai rules bawaan Android.
-keepattributes Signature, InnerClasses, EnclosingMethod
-dontwarn androidx.security.**
# Tink (via security-crypto) referensi anotasi jsr305 yang hanya ada saat kompilasi
-dontwarn javax.annotation.**

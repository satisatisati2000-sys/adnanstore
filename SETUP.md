# متجر عدنان Final — دليل الإعداد

## قبل النشر: 3 خطوات فقط

---

### 1. Cloudinary — إعداد رفع الصور

1. سجّل دخول على [cloudinary.com](https://cloudinary.com)
2. افتح: **Settings → Upload → Upload Presets**
3. اضغط **Add upload preset**
4. اضبط:
   - **Preset name:** `products_unsigned`
   - **Signing Mode:** `Unsigned` ← مهم جداً
   - **Folder:** `adnanstore/products`
5. احفظ

> **ملاحظة أمنية:** الـ `upload_preset` عام ومقصود — لا يُعطي أي صلاحية لقراءة أو حذف الصور.
> لا تضع `api_secret` في الكود أبداً.

---

### 2. Firestore Rules — حماية قاعدة البيانات

في [Firebase Console](https://console.firebase.google.com):
1. افتح مشروعك → **Firestore Database → Rules**
2. انسخ محتوى ملف `firestore.rules` المرفق والصقه
3. اضغط **Publish**

هذا يضمن:
- ✅ القراءة مفتوحة للجميع (المنتجات، التصنيفات، الإعدادات)
- ✅ الكتابة فقط للأدمن بعد تسجيل الدخول بكلمة المرور
- ❌ كل شيء آخر ممنوع

---

### 3. تغيير كلمة مرور الأدمن

في ملف `js/app.js` السطر الأول (السطر 5):
```js
const _AH = 'a694b9ec76658412817fdef610593e4276b7e33c8c9103a34a3cd90cd1d12bd3';
```

هذا SHA-256 لكلمة مرور اختارها المطور. لتغييرها:
1. اكتب كلمة مرورك في [SHA-256 Generator](https://emn178.github.io/online-tools/sha256.html)
2. انسخ الهاش الناتج واستبدله في السطر 5

---

### 4. إضافة بياناتك في config.js

افتح `js/config.js` وعدّل:
```js
WHATSAPP_NUMBER: '966XXXXXXXXX',  // رقم واتساب بدون +
INSTAGRAM_URL: 'https://instagram.com/youraccount',
```

---

## ملاحظات أمنية مهمة

| الموضوع | الحالة |
|---------|--------|
| كلمات مرور المستخدمين | مُجزَّأة بـ SHA-256 + Salt |
| كلمة مرور الأدمن | SHA-256 فقط (hash في app.js مرئي — غيّره) |
| Firestore Rules | يجب تطبيقها قبل النشر |
| Cloudinary upload_preset | عام ومقصود (Unsigned) |
| Cloudinary api_secret | لا يوجد في الكود — آمن |
| HSTS | مُفعَّل في firebase.json |
| CSP | مُفعَّل ويشمل Cloudinary |


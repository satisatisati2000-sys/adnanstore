export const PAYMENT_METHODS = [
  {
    id: "cih",
    type: "bank_transfer",
    group: "bank",
    title: "Cih",
    displayName: "Cih",
    accountHolder: "اسم صاحب الحساب هنا",
    accountNumber: "0000 0000 0000 0000",
    iban: "",
    extraFields: [
      { label: "المرجع", value: "CIH-REF-001" }
    ],
    instructions: "حوّل المبلغ كاملًا ثم ارفع صورة واضحة للإيصال.",
    requiresReceipt: true,
    requiresSenderName: true,
    enabled: true,
    icon: "🏦"
  },
  {
    id: "wafabank",
    type: "bank_transfer",
    group: "bank",
    title: "وافا بنك",
    displayName: "وافا بنك",
    accountHolder: "اسم المستفيد هنا",
    accountNumber: "1111 2222 3333 4444",
    iban: "",
    extraFields: [
      { label: "مرجع إضافي", value: "WF-2026" }
    ],
    instructions: "أرسل التحويل باسمك الحقيقي ثم ارفع الإثبات.",
    requiresReceipt: true,
    requiresSenderName: true,
    enabled: true,
    icon: "🏦"
  },
  {
    id: "cash_plus",
    type: "bank_transfer",
    group: "bank",
    title: "Cash plus",
    displayName: "Cash plus",
    accountHolder: "اسم المستفيد هنا",
    accountNumber: "",
    iban: "",
    extraFields: [
      { label: "اسم المستفيد", value: "Beneficiary Name" }
    ],
    instructions: "حوّل إلى اسم المستفيد نفسه وارفع صورة الإيصال.",
    requiresReceipt: true,
    requiresSenderName: true,
    enabled: true,
    icon: "💸"
  },
  {
    id: "raj7i",
    type: "bank_transfer",
    group: "bank",
    title: "راجحي",
    displayName: "راجحي",
    accountHolder: "اسم صاحب الحساب هنا",
    accountNumber: "5555 6666 7777 8888",
    iban: "SA11 1111 2222 3333 4444 5555",
    extraFields: [],
    instructions: "استخدم نفس اسم الحساب عند تعبئة النموذج أسفل التفاصيل.",
    requiresReceipt: true,
    requiresSenderName: true,
    enabled: true,
    icon: "🏛️"
  },
  {
    id: "binance",
    type: "wallet",
    group: "direct",
    title: "بايننس",
    displayName: "بايننس",
    accountHolder: "Binance Pay",
    accountNumber: "BINANCE-ID-0000",
    iban: "",
    extraFields: [
      { label: "Binance ID", value: "000000000" }
    ],
    instructions: "أرسل التحويل من حسابك في Binance ثم ارفع صورة التأكيد.",
    requiresReceipt: true,
    requiresSenderName: true,
    enabled: true,
    icon: "₿"
  },
  {
    id: "master",
    type: "card",
    group: "direct",
    title: "ماستر",
    displayName: "ماستر",
    accountHolder: "اسم صاحب البطاقة هنا",
    accountNumber: "0000 1111 2222 3333",
    iban: "",
    extraFields: [],
    instructions: "حوّل إلى البطاقة الموضحة ثم ارفع صورة الإيصال أو التحويل.",
    requiresReceipt: true,
    requiresSenderName: true,
    enabled: true,
    icon: "💳"
  }
];

export function getEnabledPaymentMethods() {
  return PAYMENT_METHODS.filter(item => item.enabled !== false);
}

export function getPaymentMethodById(id) {
  return PAYMENT_METHODS.find(item => item.id === id);
}

// ─────────────────────────────────────────────────────────────────────────
// Daftra Hub — World & Arab Currencies Dictionary & Helpers (ISO 4217)
// Fixes vs. previous version:
//   • PAB previously held Israeli Shekel data by mistake → corrected to
//     Panamanian Balboa, and ILS (Israeli Shekel / New Shekel) added properly.
//   • KRW's Arabic name accidentally contained Thai script → fixed to Arabic.
//   • EGP_GOLD (not a real ISO code) → replaced with the correct ISO 4217
//     precious-metal codes XAU (Gold) and XAG (Silver).
//   • Expanded coverage from ~40 currencies to the full active ISO 4217 list
//     (~150+ currencies), grouped by region, each with Arabic/English name
//     and Arabic/English symbol.
// ─────────────────────────────────────────────────────────────────────────

export const currenciesData = {
    // ── 1. العملات العربية (Arab Currencies) ─────────────────────────────
    EGP: { nameAr: 'جنيه مصري (EGP)', nameEn: 'Egyptian Pound (EGP)', symbolAr: 'ج.م', symbolEn: 'EGP' },
    SAR: { nameAr: 'ريال سعودي (SAR)', nameEn: 'Saudi Riyal (SAR)', symbolAr: 'ر.س', symbolEn: 'SAR' },
    AED: { nameAr: 'درهم إماراتي (AED)', nameEn: 'UAE Dirham (AED)', symbolAr: 'د.إ', symbolEn: 'AED' },
    KWD: { nameAr: 'دينار كويتي (KWD)', nameEn: 'Kuwaiti Dinar (KWD)', symbolAr: 'د.ك', symbolEn: 'KWD' },
    QAR: { nameAr: 'ريال قطري (QAR)', nameEn: 'Qatari Riyal (QAR)', symbolAr: 'ر.ق', symbolEn: 'QAR' },
    BHD: { nameAr: 'دينار بحريني (BHD)', nameEn: 'Bahraini Dinar (BHD)', symbolAr: 'د.ب', symbolEn: 'BHD' },
    OMR: { nameAr: 'ريال عماني (OMR)', nameEn: 'Omani Rial (OMR)', symbolAr: 'ر.ع.', symbolEn: 'OMR' },
    JOD: { nameAr: 'دينار أردني (JOD)', nameEn: 'Jordanian Dinar (JOD)', symbolAr: 'د.أ', symbolEn: 'JOD' },
    LBP: { nameAr: 'ليرة لبنانية (LBP)', nameEn: 'Lebanese Pound (LBP)', symbolAr: 'ل.ل', symbolEn: 'LBP' },
    IQD: { nameAr: 'دينار عراقي (IQD)', nameEn: 'Iraqi Dinar (IQD)', symbolAr: 'ع.د', symbolEn: 'IQD' },
    SYP: { nameAr: 'ليرة سورية (SYP)', nameEn: 'Syrian Pound (SYP)', symbolAr: 'ل.س', symbolEn: 'SYP' },
    YER: { nameAr: 'ريال يمني (YER)', nameEn: 'Yemeni Rial (YER)', symbolAr: 'ر.ي', symbolEn: 'YER' },
    SDG: { nameAr: 'جنيه سوداني (SDG)', nameEn: 'Sudanese Pound (SDG)', symbolAr: 'ج.س', symbolEn: 'SDG' },
    LYD: { nameAr: 'دينار ليبي (LYD)', nameEn: 'Libyan Dinar (LYD)', symbolAr: 'د.ل', symbolEn: 'LYD' },
    MAD: { nameAr: 'درهم مغربي (MAD)', nameEn: 'Moroccan Dirham (MAD)', symbolAr: 'د.م.', symbolEn: 'MAD' },
    DZD: { nameAr: 'دينار جزائري (DZD)', nameEn: 'Algerian Dinar (DZD)', symbolAr: 'د.ج', symbolEn: 'DZD' },
    TND: { nameAr: 'دينار تونسي (TND)', nameEn: 'Tunisian Dinar (TND)', symbolAr: 'د.ت', symbolEn: 'TND' },
    MRU: { nameAr: 'أوقية موريتانية (MRU)', nameEn: 'Mauritanian Ouguiya (MRU)', symbolAr: 'أ.م', symbolEn: 'UM' },
    SOS: { nameAr: 'شلن صومالي (SOS)', nameEn: 'Somali Shilling (SOS)', symbolAr: 'ش.ص', symbolEn: 'Sh.So.' },
    DJF: { nameAr: 'فرنك جيبوتي (DJF)', nameEn: 'Djiboutian Franc (DJF)', symbolAr: 'ف.ج', symbolEn: 'Fdj' },
    KMF: { nameAr: 'فرنك قمري (KMF)', nameEn: 'Comorian Franc (KMF)', symbolAr: 'ف.ق', symbolEn: 'CF' },
    ILS: { nameAr: 'شيكل إسرائيلي جديد (ILS)', nameEn: 'Israeli New Shekel (ILS)', symbolAr: '₪', symbolEn: '₪' },
    PAB: { nameAr: 'بالبوا بنمي (PAB)', nameEn: 'Panamanian Balboa (PAB)', symbolAr: 'B/.', symbolEn: 'B/.' },

    // ── 2. أهم العملات العالمية الكبرى (Major World Currencies) ─────────
    USD: { nameAr: 'دولار أمريكي (USD)', nameEn: 'US Dollar (USD)', symbolAr: '$', symbolEn: '$' },
    EUR: { nameAr: 'يورو (EUR)', nameEn: 'Euro (EUR)', symbolAr: '€', symbolEn: '€' },
    GBP: { nameAr: 'جنيه إسترليني (GBP)', nameEn: 'British Pound (GBP)', symbolAr: '£', symbolEn: '£' },
    CHF: { nameAr: 'فرنك سويسري (CHF)', nameEn: 'Swiss Franc (CHF)', symbolAr: 'CHF', symbolEn: 'CHF' },
    JPY: { nameAr: 'ين ياباني (JPY)', nameEn: 'Japanese Yen (JPY)', symbolAr: '¥', symbolEn: '¥' },
    CAD: { nameAr: 'دولار كندي (CAD)', nameEn: 'Canadian Dollar (CAD)', symbolAr: 'CA$', symbolEn: 'CA$' },
    AUD: { nameAr: 'دولار أسترالي (AUD)', nameEn: 'Australian Dollar (AUD)', symbolAr: 'A$', symbolEn: 'A$' },
    NZD: { nameAr: 'دولار نيوزيلندي (NZD)', nameEn: 'New Zealand Dollar (NZD)', symbolAr: 'NZ$', symbolEn: 'NZ$' },
    CNY: { nameAr: 'يوان صيني (CNY)', nameEn: 'Chinese Yuan (CNY)', symbolAr: '¥', symbolEn: '¥' },
    HKD: { nameAr: 'دولار هونغ كونغ (HKD)', nameEn: 'Hong Kong Dollar (HKD)', symbolAr: 'HK$', symbolEn: 'HK$' },
    SGD: { nameAr: 'دولار سنغافوري (SGD)', nameEn: 'Singapore Dollar (SGD)', symbolAr: 'S$', symbolEn: 'S$' },
    SEK: { nameAr: 'كرونة سويدية (SEK)', nameEn: 'Swedish Krona (SEK)', symbolAr: 'kr', symbolEn: 'kr' },
    NOK: { nameAr: 'كرونة نرويجية (NOK)', nameEn: 'Norwegian Krone (NOK)', symbolAr: 'kr', symbolEn: 'kr' },
    DKK: { nameAr: 'كرونة دنماركية (DKK)', nameEn: 'Danish Krone (DKK)', symbolAr: 'kr', symbolEn: 'kr' },

    // ── 3. آسيا (Asia) ────────────────────────────────────────────────────
    AFN: { nameAr: 'أفغاني أفغاني (AFN)', nameEn: 'Afghan Afghani (AFN)', symbolAr: '؋', symbolEn: '؋' },
    AMD: { nameAr: 'درام أرميني (AMD)', nameEn: 'Armenian Dram (AMD)', symbolAr: '֏', symbolEn: '֏' },
    AZN: { nameAr: 'مانات أذربيجاني (AZN)', nameEn: 'Azerbaijani Manat (AZN)', symbolAr: '₼', symbolEn: '₼' },
    BDT: { nameAr: 'تاكا بنغلاديشية (BDT)', nameEn: 'Bangladeshi Taka (BDT)', symbolAr: '৳', symbolEn: '৳' },
    BTN: { nameAr: 'نغولترم بوتاني (BTN)', nameEn: 'Bhutanese Ngultrum (BTN)', symbolAr: 'Nu.', symbolEn: 'Nu.' },
    BND: { nameAr: 'دولار بروناي (BND)', nameEn: 'Brunei Dollar (BND)', symbolAr: 'B$', symbolEn: 'B$' },
    KHR: { nameAr: 'رييل كمبودي (KHR)', nameEn: 'Cambodian Riel (KHR)', symbolAr: '៛', symbolEn: '៛' },
    GEL: { nameAr: 'لاري جورجي (GEL)', nameEn: 'Georgian Lari (GEL)', symbolAr: '₾', symbolEn: '₾' },
    INR: { nameAr: 'روبية هندية (INR)', nameEn: 'Indian Rupee (INR)', symbolAr: '₹', symbolEn: '₹' },
    IDR: { nameAr: 'روبية إندونيسية (IDR)', nameEn: 'Indonesian Rupiah (IDR)', symbolAr: 'Rp', symbolEn: 'Rp' },
    IRR: { nameAr: 'ريال إيراني (IRR)', nameEn: 'Iranian Rial (IRR)', symbolAr: '﷼', symbolEn: '﷼' },
    KZT: { nameAr: 'تنغي كازاخستاني (KZT)', nameEn: 'Kazakhstani Tenge (KZT)', symbolAr: '₸', symbolEn: '₸' },
    KGS: { nameAr: 'سوم قيرغيزستاني (KGS)', nameEn: 'Kyrgystani Som (KGS)', symbolAr: 'с', symbolEn: 'с' },
    LAK: { nameAr: 'كيب لاوسي (LAK)', nameEn: 'Lao Kip (LAK)', symbolAr: '₭', symbolEn: '₭' },
    MOP: { nameAr: 'باتاكا ماكاوية (MOP)', nameEn: 'Macanese Pataca (MOP)', symbolAr: 'MOP$', symbolEn: 'MOP$' },
    MYR: { nameAr: 'رينغيت ماليزي (MYR)', nameEn: 'Malaysian Ringgit (MYR)', symbolAr: 'RM', symbolEn: 'RM' },
    MVR: { nameAr: 'روفية مالديفية (MVR)', nameEn: 'Maldivian Rufiyaa (MVR)', symbolAr: 'Rf', symbolEn: 'Rf' },
    MNT: { nameAr: 'توغروغ منغولي (MNT)', nameEn: 'Mongolian Tögrög (MNT)', symbolAr: '₮', symbolEn: '₮' },
    MMK: { nameAr: 'كيات ميانماري (MMK)', nameEn: 'Myanmar Kyat (MMK)', symbolAr: 'K', symbolEn: 'K' },
    NPR: { nameAr: 'روبية نيبالية (NPR)', nameEn: 'Nepalese Rupee (NPR)', symbolAr: '₨', symbolEn: '₨' },
    KPW: { nameAr: 'وون كوري شمالي (KPW)', nameEn: 'North Korean Won (KPW)', symbolAr: '₩', symbolEn: '₩' },
    PKR: { nameAr: 'روبية باكستانية (PKR)', nameEn: 'Pakistani Rupee (PKR)', symbolAr: '₨', symbolEn: '₨' },
    PHP: { nameAr: 'بيزو فلبيني (PHP)', nameEn: 'Philippine Peso (PHP)', symbolAr: '₱', symbolEn: '₱' },
    KRW: { nameAr: 'وون كوري جنوبي (KRW)', nameEn: 'South Korean Won (KRW)', symbolAr: '₩', symbolEn: '₩' },
    LKR: { nameAr: 'روبية سريلانكية (LKR)', nameEn: 'Sri Lankan Rupee (LKR)', symbolAr: '₨', symbolEn: '₨' },
    TWD: { nameAr: 'دولار تايواني جديد (TWD)', nameEn: 'New Taiwan Dollar (TWD)', symbolAr: 'NT$', symbolEn: 'NT$' },
    TJS: { nameAr: 'سوموني طاجيكستاني (TJS)', nameEn: 'Tajikistani Somoni (TJS)', symbolAr: 'SM', symbolEn: 'SM' },
    THB: { nameAr: 'بات تايلاندي (THB)', nameEn: 'Thai Baht (THB)', symbolAr: '฿', symbolEn: '฿' },
    TMT: { nameAr: 'مانات تركمانستاني (TMT)', nameEn: 'Turkmenistani Manat (TMT)', symbolAr: 'm', symbolEn: 'm' },
    UZS: { nameAr: 'سوم أوزبكستاني (UZS)', nameEn: 'Uzbekistani Som (UZS)', symbolAr: "so'm", symbolEn: "so'm" },
    VND: { nameAr: 'دونغ فيتنامي (VND)', nameEn: 'Vietnamese Đồng (VND)', symbolAr: '₫', symbolEn: '₫' },

    // ── 4. أفريقيا (Africa, non-Arab) ────────────────────────────────────
    AOA: { nameAr: 'كوانزا أنغولية (AOA)', nameEn: 'Angolan Kwanza (AOA)', symbolAr: 'Kz', symbolEn: 'Kz' },
    BWP: { nameAr: 'بولا بوتسوانية (BWP)', nameEn: 'Botswana Pula (BWP)', symbolAr: 'P', symbolEn: 'P' },
    BIF: { nameAr: 'فرنك بوروندي (BIF)', nameEn: 'Burundian Franc (BIF)', symbolAr: 'FBu', symbolEn: 'FBu' },
    CVE: { nameAr: 'إسكودو الرأس الأخضر (CVE)', nameEn: 'Cape Verdean Escudo (CVE)', symbolAr: '$', symbolEn: '$' },
    XAF: { nameAr: 'فرنك أفريقي وسط (XAF)', nameEn: 'Central African CFA Franc (XAF)', symbolAr: 'FCFA', symbolEn: 'FCFA' },
    CDF: { nameAr: 'فرنك كونغولي (CDF)', nameEn: 'Congolese Franc (CDF)', symbolAr: 'FC', symbolEn: 'FC' },
    ERN: { nameAr: 'ناكفا إريترية (ERN)', nameEn: 'Eritrean Nakfa (ERN)', symbolAr: 'Nfk', symbolEn: 'Nfk' },
    SZL: { nameAr: 'ليلانغيني إسواتيني (SZL)', nameEn: 'Eswatini Lilangeni (SZL)', symbolAr: 'L', symbolEn: 'L' },
    ETB: { nameAr: 'بير إثيوبي (ETB)', nameEn: 'Ethiopian Birr (ETB)', symbolAr: 'Br', symbolEn: 'Br' },
    GMD: { nameAr: 'دالاسي غامبي (GMD)', nameEn: 'Gambian Dalasi (GMD)', symbolAr: 'D', symbolEn: 'D' },
    GHS: { nameAr: 'سيدي غاني (GHS)', nameEn: 'Ghanaian Cedi (GHS)', symbolAr: '₵', symbolEn: '₵' },
    GNF: { nameAr: 'فرنك غيني (GNF)', nameEn: 'Guinean Franc (GNF)', symbolAr: 'FG', symbolEn: 'FG' },
    KES: { nameAr: 'شلن كيني (KES)', nameEn: 'Kenyan Shilling (KES)', symbolAr: 'KSh', symbolEn: 'KSh' },
    LSL: { nameAr: 'لوتي ليسوتو (LSL)', nameEn: 'Lesotho Loti (LSL)', symbolAr: 'L', symbolEn: 'L' },
    LRD: { nameAr: 'دولار ليبيري (LRD)', nameEn: 'Liberian Dollar (LRD)', symbolAr: 'L$', symbolEn: 'L$' },
    MGA: { nameAr: 'أرياري مدغشقري (MGA)', nameEn: 'Malagasy Ariary (MGA)', symbolAr: 'Ar', symbolEn: 'Ar' },
    MWK: { nameAr: 'كواشا ملاوية (MWK)', nameEn: 'Malawian Kwacha (MWK)', symbolAr: 'MK', symbolEn: 'MK' },
    MUR: { nameAr: 'روبية موريشيوسية (MUR)', nameEn: 'Mauritian Rupee (MUR)', symbolAr: '₨', symbolEn: '₨' },
    MZN: { nameAr: 'ميتيكال موزمبيقي (MZN)', nameEn: 'Mozambican Metical (MZN)', symbolAr: 'MT', symbolEn: 'MT' },
    NAD: { nameAr: 'دولار ناميبي (NAD)', nameEn: 'Namibian Dollar (NAD)', symbolAr: 'N$', symbolEn: 'N$' },
    NGN: { nameAr: 'نايرا نيجيرية (NGN)', nameEn: 'Nigerian Naira (NGN)', symbolAr: '₦', symbolEn: '₦' },
    RWF: { nameAr: 'فرنك رواندي (RWF)', nameEn: 'Rwandan Franc (RWF)', symbolAr: 'FRw', symbolEn: 'FRw' },
    STN: { nameAr: 'دوبرا ساو تومي وبرينسيبي (STN)', nameEn: 'São Tomé & Príncipe Dobra (STN)', symbolAr: 'Db', symbolEn: 'Db' },
    SCR: { nameAr: 'روبية سيشيلية (SCR)', nameEn: 'Seychellois Rupee (SCR)', symbolAr: '₨', symbolEn: '₨' },
    SLE: { nameAr: 'ليون سيراليوني (SLE)', nameEn: 'Sierra Leonean Leone (SLE)', symbolAr: 'Le', symbolEn: 'Le' },
    ZAR: { nameAr: 'راند جنوب أفريقي (ZAR)', nameEn: 'South African Rand (ZAR)', symbolAr: 'R', symbolEn: 'R' },
    SSP: { nameAr: 'جنيه جنوب سوداني (SSP)', nameEn: 'South Sudanese Pound (SSP)', symbolAr: '£', symbolEn: '£' },
    TZS: { nameAr: 'شلن تنزاني (TZS)', nameEn: 'Tanzanian Shilling (TZS)', symbolAr: 'TSh', symbolEn: 'TSh' },
    UGX: { nameAr: 'شلن أوغندي (UGX)', nameEn: 'Ugandan Shilling (UGX)', symbolAr: 'USh', symbolEn: 'USh' },
    XOF: { nameAr: 'فرنك أفريقي غرب (XOF)', nameEn: 'West African CFA Franc (XOF)', symbolAr: 'CFA', symbolEn: 'CFA' },
    ZMW: { nameAr: 'كواشا زامبية (ZMW)', nameEn: 'Zambian Kwacha (ZMW)', symbolAr: 'ZK', symbolEn: 'ZK' },
    ZWL: { nameAr: 'دولار زيمبابوي (ZWL)', nameEn: 'Zimbabwean Dollar (ZWL)', symbolAr: 'Z$', symbolEn: 'Z$' },

    // ── 5. الأمريكتان (Americas) ─────────────────────────────────────────
    ARS: { nameAr: 'بيزو أرجنتيني (ARS)', nameEn: 'Argentine Peso (ARS)', symbolAr: '$', symbolEn: '$' },
    AWG: { nameAr: 'فلورين أروبي (AWG)', nameEn: 'Aruban Florin (AWG)', symbolAr: 'ƒ', symbolEn: 'ƒ' },
    BSD: { nameAr: 'دولار بهامي (BSD)', nameEn: 'Bahamian Dollar (BSD)', symbolAr: 'B$', symbolEn: 'B$' },
    BBD: { nameAr: 'دولار باربادوسي (BBD)', nameEn: 'Barbadian Dollar (BBD)', symbolAr: 'Bds$', symbolEn: 'Bds$' },
    BZD: { nameAr: 'دولار بليزي (BZD)', nameEn: 'Belize Dollar (BZD)', symbolAr: 'BZ$', symbolEn: 'BZ$' },
    BMD: { nameAr: 'دولار برمودي (BMD)', nameEn: 'Bermudian Dollar (BMD)', symbolAr: '$', symbolEn: '$' },
    BOB: { nameAr: 'بوليفيانو بوليفي (BOB)', nameEn: 'Bolivian Boliviano (BOB)', symbolAr: 'Bs.', symbolEn: 'Bs.' },
    BRL: { nameAr: 'ريال برازيلي (BRL)', nameEn: 'Brazilian Real (BRL)', symbolAr: 'R$', symbolEn: 'R$' },
    KYD: { nameAr: 'دولار جزر كايمان (KYD)', nameEn: 'Cayman Islands Dollar (KYD)', symbolAr: 'CI$', symbolEn: 'CI$' },
    CLP: { nameAr: 'بيزو تشيلي (CLP)', nameEn: 'Chilean Peso (CLP)', symbolAr: '$', symbolEn: '$' },
    COP: { nameAr: 'بيزو كولومبي (COP)', nameEn: 'Colombian Peso (COP)', symbolAr: '$', symbolEn: '$' },
    CRC: { nameAr: 'كولون كوستاريكي (CRC)', nameEn: 'Costa Rican Colón (CRC)', symbolAr: '₡', symbolEn: '₡' },
    CUP: { nameAr: 'بيزو كوبي (CUP)', nameEn: 'Cuban Peso (CUP)', symbolAr: '$', symbolEn: '$' },
    DOP: { nameAr: 'بيزو دومينيكي (DOP)', nameEn: 'Dominican Peso (DOP)', symbolAr: 'RD$', symbolEn: 'RD$' },
    XCD: { nameAr: 'دولار الكاريبي الشرقي (XCD)', nameEn: 'East Caribbean Dollar (XCD)', symbolAr: 'EC$', symbolEn: 'EC$' },
    SVC: { nameAr: 'كولون سلفادوري (SVC)', nameEn: 'Salvadoran Colón (SVC)', symbolAr: '$', symbolEn: '$' },
    FKP: { nameAr: 'جنيه جزر فوكلاند (FKP)', nameEn: 'Falkland Islands Pound (FKP)', symbolAr: '£', symbolEn: '£' },
    GTQ: { nameAr: 'كيتزال غواتيمالي (GTQ)', nameEn: 'Guatemalan Quetzal (GTQ)', symbolAr: 'Q', symbolEn: 'Q' },
    GYD: { nameAr: 'دولار غياني (GYD)', nameEn: 'Guyanese Dollar (GYD)', symbolAr: 'G$', symbolEn: 'G$' },
    HTG: { nameAr: 'غورد هايتي (HTG)', nameEn: 'Haitian Gourde (HTG)', symbolAr: 'G', symbolEn: 'G' },
    HNL: { nameAr: 'لمبيرا هندوراسية (HNL)', nameEn: 'Honduran Lempira (HNL)', symbolAr: 'L', symbolEn: 'L' },
    JMD: { nameAr: 'دولار جامايكي (JMD)', nameEn: 'Jamaican Dollar (JMD)', symbolAr: 'J$', symbolEn: 'J$' },
    MXN: { nameAr: 'بيزو مكسيكي (MXN)', nameEn: 'Mexican Peso (MXN)', symbolAr: 'Mex$', symbolEn: 'Mex$' },
    NIO: { nameAr: 'كوردوبا نيكاراغوية (NIO)', nameEn: 'Nicaraguan Córdoba (NIO)', symbolAr: 'C$', symbolEn: 'C$' },
    PYG: { nameAr: 'غواراني باراغواي (PYG)', nameEn: 'Paraguayan Guaraní (PYG)', symbolAr: '₲', symbolEn: '₲' },
    PEN: { nameAr: 'سول بيروفي (PEN)', nameEn: 'Peruvian Sol (PEN)', symbolAr: 'S/', symbolEn: 'S/' },
    SRD: { nameAr: 'دولار سورينامي (SRD)', nameEn: 'Surinamese Dollar (SRD)', symbolAr: '$', symbolEn: '$' },
    TTD: { nameAr: 'دولار ترينيداد وتوباغو (TTD)', nameEn: 'Trinidad & Tobago Dollar (TTD)', symbolAr: 'TT$', symbolEn: 'TT$' },
    UYU: { nameAr: 'بيزو أوروغواي (UYU)', nameEn: 'Uruguayan Peso (UYU)', symbolAr: '$U', symbolEn: '$U' },
    VES: { nameAr: 'بوليفار فنزويلي (VES)', nameEn: 'Venezuelan Bolívar (VES)', symbolAr: 'Bs.S', symbolEn: 'Bs.S' },

    // ── 6. أوروبا (Europe, non-Euro) ─────────────────────────────────────
    ALL: { nameAr: 'ليك ألباني (ALL)', nameEn: 'Albanian Lek (ALL)', symbolAr: 'L', symbolEn: 'L' },
    BYN: { nameAr: 'روبل بيلاروسي (BYN)', nameEn: 'Belarusian Ruble (BYN)', symbolAr: 'Br', symbolEn: 'Br' },
    BAM: { nameAr: 'مارك البوسنة والهرسك القابل للتحويل (BAM)', nameEn: 'Bosnia-Herzegovina Convertible Mark (BAM)', symbolAr: 'KM', symbolEn: 'KM' },
    BGN: { nameAr: 'ليف بلغاري (BGN)', nameEn: 'Bulgarian Lev (BGN)', symbolAr: 'лв', symbolEn: 'лв' },
    CZK: { nameAr: 'كورونا تشيكية (CZK)', nameEn: 'Czech Koruna (CZK)', symbolAr: 'Kč', symbolEn: 'Kč' },
    HUF: { nameAr: 'فورنت هنغاري (HUF)', nameEn: 'Hungarian Forint (HUF)', symbolAr: 'Ft', symbolEn: 'Ft' },
    ISK: { nameAr: 'كرونة آيسلندية (ISK)', nameEn: 'Icelandic Króna (ISK)', symbolAr: 'kr', symbolEn: 'kr' },
    MDL: { nameAr: 'ليو مولدوفي (MDL)', nameEn: 'Moldovan Leu (MDL)', symbolAr: 'L', symbolEn: 'L' },
    MKD: { nameAr: 'دينار مقدوني (MKD)', nameEn: 'Macedonian Denar (MKD)', symbolAr: 'ден', symbolEn: 'ден' },
    PLN: { nameAr: 'زلوتي بولندي (PLN)', nameEn: 'Polish Złoty (PLN)', symbolAr: 'zł', symbolEn: 'zł' },
    RON: { nameAr: 'ليو روماني (RON)', nameEn: 'Romanian Leu (RON)', symbolAr: 'lei', symbolEn: 'lei' },
    RSD: { nameAr: 'دينار صربي (RSD)', nameEn: 'Serbian Dinar (RSD)', symbolAr: 'дин.', symbolEn: 'дин.' },
    RUB: { nameAr: 'روبل روسي (RUB)', nameEn: 'Russian Ruble (RUB)', symbolAr: '₽', symbolEn: '₽' },
    TRY: { nameAr: 'ليرة تركية (TRY)', nameEn: 'Turkish Lira (TRY)', symbolAr: '₺', symbolEn: '₺' },
    UAH: { nameAr: 'هريفنيا أوكرانية (UAH)', nameEn: 'Ukrainian Hryvnia (UAH)', symbolAr: '₴', symbolEn: '₴' },

    // ── 7. أوقيانوسيا (Oceania) ──────────────────────────────────────────
    FJD: { nameAr: 'دولار فيجي (FJD)', nameEn: 'Fijian Dollar (FJD)', symbolAr: 'FJ$', symbolEn: 'FJ$' },
    PGK: { nameAr: 'كينا بابوا غينيا الجديدة (PGK)', nameEn: 'Papua New Guinean Kina (PGK)', symbolAr: 'K', symbolEn: 'K' },
    WST: { nameAr: 'تالا ساموية (WST)', nameEn: 'Samoan Tālā (WST)', symbolAr: 'WS$', symbolEn: 'WS$' },
    SBD: { nameAr: 'دولار جزر سليمان (SBD)', nameEn: 'Solomon Islands Dollar (SBD)', symbolAr: 'SI$', symbolEn: 'SI$' },
    TOP: { nameAr: 'بانغا تونغية (TOP)', nameEn: 'Tongan Paʻanga (TOP)', symbolAr: 'T$', symbolEn: 'T$' },
    VUV: { nameAr: 'فاتو فانواتو (VUV)', nameEn: 'Vanuatu Vatu (VUV)', symbolAr: 'VT', symbolEn: 'VT' },

    // ── 8. المعادن الثمينة (Precious Metals, ISO 4217 codes) ─────────────
    XAU: { nameAr: 'ذهب (أونصة) (XAU)', nameEn: 'Gold Ounce (XAU)', symbolAr: 'XAU', symbolEn: 'XAU' },
    XAG: { nameAr: 'فضة (أونصة) (XAG)', nameEn: 'Silver Ounce (XAG)', symbolAr: 'XAG', symbolEn: 'XAG' },
};

/**
 * 🎯 قائمة بأكواد العملات المتاحة للاستخدام في القوائم المنسدلة والـ Autocomplete
 */
export const worldCurrenciesList = Object.keys(currenciesData);

/**
 * 🎯 جلب الاسم الكامل للعملة بحسب اللغة
 */
export const getCurrencyFullName = (code, lang = 'en') => {
    if (!code) return '';
    const cleanCode = code.toUpperCase().trim();
    const curr = currenciesData[cleanCode];
    if (!curr) return cleanCode;
    return lang === 'ar' ? curr.nameAr : curr.nameEn;
};

/**
 * 🎯 جلب رمز العملة بحسب اللغة
 */
export const getCurrencySymbol = (code, lang = 'en') => {
    if (!code) return '';
    const cleanCode = code.toUpperCase().trim();
    const curr = currenciesData[cleanCode];
    if (!curr) return cleanCode;
    return lang === 'ar' ? curr.symbolAr : curr.symbolEn;
};

/**
 * 🎯 جلب التسمية المختصرة للعملة
 */
export const getCurrencyLabel = (code, lang = 'en') => {
    return getCurrencySymbol(code, lang);
};
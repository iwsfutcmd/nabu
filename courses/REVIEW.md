# What a native reviewer should check first

Every taught sentence, story and scenario in the fixture courses is an LLM draft
(`llm:claude@<prompt-hash>`, `status: draft`). These are the points the drafts were least sure
of, course by course ([ADR 0050](../docs/adr/0050-ten-unit-courses.md)). After a review, mark the
items `status: reviewed`, or `published` with `reviewedBy` and `reviewedAt`.

## fa (Persian)

1. **Ezafe after a silent -e.** The display uses the Farhangestan small hamza (خانوادهٔ, خانهٔ,
   صبحانهٔ, هفتهٔ). Answers accept that, ‌ی or nothing. Is it the right display style?
2. **The copula after a vowel.** The display has رضا است, سارا است and کتابِ ما است, but the
   contracted کجاست, اینجاست, آنجاست and دریاست. Accept sets take both forms. A single policy may
   be better.
3. **Stiff sentences.** These were built to bring in one new KC each and may sound stiff:
   - کار کردن خوب است
   - مریم با علی است
   - ما هزار کتاب داریم!
   - من پنج روز کار می‌کنم (هفته‌ای پنج روز would be more natural)
   - علی پنج دوست دارد (contrasted on purpose with دوست داشتن "to like")
4. **Word choices.** چای می‌خورم rather than می‌نوشم, پزشک rather than دکتر, خودکار for "pen",
   and اهلِ کجا هستید.
5. **Prices in tomans.** A notebook costs 20–50 thousand, a book 100 thousand, and a shirt 150
   thousand, reduced to 120 thousand. Are these realistic? They will date.
6. **Agreement.**
   - این سیب‌ها … خوب هستند (است is also accepted).
   - خانوادهٔ شما خوب هستند؟ with a plural verb.
   - Singular کفش and شلوار for a pair.
7. **Fragments and idioms in stories and directions.** نه، ده دقیقه پیاده. / ده دقیقه پیاده است,
   آبی یا سبز., ارزان‌تر نمی‌دهید؟, تخفیف می‌دهید؟ and به شما خوش گذشت؟
8. **Colloquial variants in the accept sets.** Should forms like کیه، چنده، چطوره، خوبه، توی،
   ببخشین، نوش جون، حرف می‌زنم and بعدش be accepted?
9. **Glosses and register notes.** Check the Tehrani forms (می‌رم, میام, می‌خوام, خونه, نون),
   خواهر with its silent و, and دوست glossed as "friend (also in دوست داشتن: to like)".
10. **"Nine" is not taught.** نه "nine" is spelled like نه "no" and would collide with it in the
    glossary. The numbers drill still covers it.

## yue (Cantonese)

1. **呢 is read ne1 throughout** (呢個, 呢度, 呢本 …). That matches PyCantonese and casual speech,
   and a note on the KC mentions ni1. Should it be ni1?
2. **Three readings kept against PyCantonese:**
   - 名 *meng2*, in 你叫咩名呀？;
   - 弟弟 *dai4 dai2*;
   - 平 *peng4* "cheap".
3. **Readings left at the dictionary value** although speech often differs:
   - 英文 and 中文 *man4* (often *man2*);
   - 女兒 *neoi5 ji4* (often *ji2*);
   - 左邊 and 右邊 *bin6*.
4. **個 comes in through a bare classifier**, 個老師好好 "the teacher is very nice". The particle
   呢 means "where's …?" in 我嘅書呢？ and 我本書呢？.
5. **Forecasts without 會.** 聽日打風, 佢話聽日落雨 and 天文台話聽日好凍.
6. **得唔得閒 is one word.** Its parts are tagged 得閒 + 唔 + 得閒.
7. **Possibly unidiomatic.** 地鐵喺邊度呀 (rather than 地鐵站), 我食雞飯, 個老師好好 and 呢度唔可以試.
8. **English answer sets.** 佢 accepts she, he and they everywhere. Names are romanized Ka-ming and
   Mei-ling (Ka Ming and Mei Ling are also accepted).
9. **Typing variants in the Cantonese answer sets.** 哋|地, 鍾|中意, 咗|左, 俾|畀, 定|定係,
   禮拜|星期, 尋|琴日 and 咩|乜嘢.
10. **Characters kept out by the script audit.** 佬 畀 埋 叉 粥 餓 㗎 吖 咋 啩 晏 晝 炒 腸 嫲 啫 噃
    嚿 囡 are not in CLDR's yue_Hant exemplars. So the course uses 俾 for "give/pay" and has no
    細佬, 埋單 or 叉燒. Allowing them means adding them to the profile's `exemplarsExtra`, marked
    REVIEW.

## uz (Uzbek)

1. **"Choy ich!"** is the informal bare imperative that brings in the verb before "Choy iching!".
   Is it natural enough to teach?
2. **Morph splits.** bor|a|di, -yap|ti, e|di|ngiz for "edingiz", nech|ta and kechir|a|siz.
3. **"Rahmat, yaxshimiz"** brings in "-miz: we are" without the "our" reading of *talabamiz*.
4. **"Koʻp rasm oldim"** is colloquial; is "suratga oldim" better? In "dam olaman", *olaman* is
   tagged with "olmoq: take, buy".
5. **Bazaar phrasing.** "Arzonroq qiling!", "Olmaning kilosi necha pul?" and "Uzum qancha?".
6. **Numbers.**
   - "bir akam" vs "bitta akam";
   - -ta being optional;
   - "Oilamizda toʻrt kishi bor";
   - "Kitob yigirma ming soʻm".
7. **Cooking plov.** Is it *osh pishirmoq* or *osh damlamoq*, in "Payshanba kuni osh pishiramiz"
   and "Onam osh pishiryapti"?
8. **Short dialogue answers.** "Men keldim!" (I'm home!), "U yer uzoq emas." and "Xona bormi?" at
   a hotel.
9. **The dative.** "parkka", and the note on -ka/-qa.
10. **The Cyrillic.** The 114 info notes where ICU's transform differs are ICU errors (э after
    consonants, ёʻ for йў). The pinned Cyrillic follows the standard spelling. Loanwords are
    pinned in their standard form (поезд, самолёт, Англия).

## apc (Lebanese Arabic)

1. **"Right now" (3am) plus a verb.** The course uses the form without b- (3am ta3mel, 3am esma3)
   rather than 3am b-. Is that right for Beirut?
2. **Present and no-b- verb spellings.** bekol/باكل, byekol, btekle, bishteghel, b2ra/بقرا,
   ekol/آكل, or2os/ارقص and tetla3.
3. **Forms addressed to a woman.** kili (كلي), tfaddali, bta3mli, btghanne, ray7a, and
   m2akhkhar/m2akhkhra for "late".
4. **The "my" ending.** It is spelled -i (bayyi, ekhti, 3ayelti), and -e is accepted. In Arabic
   script, -o and -a are written ـو and ـا (بيّو, إمّا), and ـه and ـها are accepted.
5. **Numbers and money.**
   - café orders: tnen ahwe, wa7ad shay;
   - prices: 3eshrin dollar, khamsin alf lira;
   - the drill "tnen w tlete khamse";
   - the spelling تمانة.
6. **The past tense.** zert, wselt/weslet, rje3, safart, and kent mabsout for "I had a good time".
7. **Time words.**
   - jem3a is one KC meaning both Friday and week (nhar el jem3a, hal jem3a).
   - 3al dohr and ba3d el dohr.
   - el lele.
   - nhar vs yom.
8. **Phrasing.** "b hayda el shere3" (vs "bi hal shere3"), "jeddo kbir" for "grandpa is old",
   "shob" for hot weather, تا for "ta", and على قلبك vs ع قلبك.
9. **Story vocalization.** Lebanese short vowels have no standard. بيت and بيروت are left
   unvocalized rather than imply the mountain pronunciation *bayt*.
10. **Accept sets.** How generous should the Arabizi variants be (2 or no 2, e/i, kh/5, gh/8),
    and the English alternatives?

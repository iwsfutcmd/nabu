# What a native reviewer should check first

Every taught sentence, story and scenario in the fixture courses is an LLM draft
(`llm:claude@<prompt-hash>`, `status: draft`). These are the points the drafts were least sure
of, course by course ([ADR 0050](../docs/adr/0050-ten-unit-courses.md)). After a review, mark the
items `status: reviewed`, or `published` with `reviewedBy` and `reviewedAt`.

## A model's native-speaker pass (November 2026)

Before any human review, each course had one more LLM pass, prompted in its own language to read
everything as a native speaker would. It fixed what it found and widened the accept sets in both
directions: the target language and English.

- **Status.** Everything stays `status: draft`. A model reading as a native speaker is not one, so
  the points below are still for a person to decide.
- **What was found.** A few real errors per course:
  - story lines that contradicted each other;
  - nonsensical distractors;
  - wrong readings;
  - English accepted answers that were wrong (*She's my dad*, *I have an big brother*).
- **What was added.** Several hundred to a few thousand accepted answers per course.
- **Golden judge items.** Items the new accept sets now grade correct were replaced by new
  answers, so each is still a real judge case (`evals/judge/*.jsonl`, author
  `llm:claude@judge-refresh-v1`).

Policies the pass adopted, to confirm or reverse:

- **fa:**
  - English "you" accepts both تو and شما, with their verbs.
  - The short written copula (خوبم, خوبه) and common colloquial -ه forms are accepted.
  - Vowel-shifted spellings (خونه, میام) are not.
  - Vowel marks: bare و (it is read *-o* between words), and 2sg *-at* on اتاقت / تولدت.
  - The two new food-story distractors (سرد, گران) are wrong only from context.
  - Prices are low for 2026. Realistic ones need new number words (پانصد, میلیون).
- **yue:**
  - The demonstrative 呢 is ni1 throughout; the particle 呢 keeps ne1.
  - Changed tones: 女兒 neoi5 ji2, 英文 / 中文 man2 (中文 man4 is also common).
  - 唔該 and 多謝 are both accepted for *Thanks / Thank you*.
  - Non-standard typings (既, 野, 黎, 岩岩, 訓覺, 哂) count as correct.
  - 十點二 counts as 10:10.
  - 海灘 vs 沙灘 (s.u10.32), and 地鐵 vs 地鐵站 (s.u07.1).
- **uz:**
  - *Sen* forms are accepted for "you", respectful *-lar* for elders, and *dadam / oyim* for father
    and mother.
  - *Choy ich* and *Choy iching* are interchangeable.
  - The profile's typo tolerance accepts the agreement error *Siz yaxshimisan* as a typo. It is a
    grading issue, not content: tighten `uz-Latn` typo rules, or list it as a near miss.
- **apc:**
  - The English progressive (*I'm eating*) is no longer accepted for b- verbs; عم carries it.
  - Initial ق in Arabizi is inconsistent (*ahwe* but *2arib*). Both are accepted; pick one.
  - Word cards show a noun with its article (البيت, الصالون), as Arabic writes it alone. Five
    forms carried a preposition or a possessive their gloss did not (بالصالون, بالليل, عالمطعم,
    عالسوق, بنتي). The bare form is first now, and the attached one second, so a tap on it in a
    sentence still glosses. Each bare form has a new sentence to check: s.fam.34, s.home.33,
    s.time.27, s.past.30, s.past.31.
  - The breakfast story line writes تِرْويقَة (*terwi2a*), as the vocalization and the Arabizi do;
    *tarwi2a* is heard too.
  - Plural "you" (*baddkon*, إنتو) is accepted only where a sentence is tagged "to several people"
    (ADR 0075); a sentence tagged "to a man" still takes only the masculine.
  - Still open in the vocalization: الضهر, هيدا, ترويقة.
  - **Gender and number** ([ADR 0056](../docs/adr/0056-persons.md), [0075](../docs/adr/0075-persons-coverage.md)).
    125 sentences say who speaks or who is spoken to: 56 to a man, 21 to a woman, 29 to several people,
    11 a man speaking, 8 a woman speaking. Their accept sets keep only the forms that fit.
    To confirm:
    - منيح (s.7) accepts both genders, untagged, as a reaction to news; s.8 and s.9 are tagged "a man speaking".
    - Arabizi *ente*/*inte* are read as feminine: some people write *inte* for the masculine.
    - حبيبي (s.plans.16) is tagged "to a man". In Beirut it is often said to women too.
    - Reading Arabic into English, *ru7t*, *kent* and *zert* also mean "you (m)", and *bt-* forms also mean
      "she". The English sets take only the course's reading (s.plans.2 now takes both).
    - Plural "you" is taught in four new lessons (ADR 0075); see apc point 12 below.
  - The judge's golden items keep ميرسي, تمام, باي and شكرا as rejects.

## Marking what is wrong

You can mark mistakes in the app ([ADR 0051](../docs/adr/0051-corrections.md)), with no setup.

1. Open a course and choose **Check the sentences**. It lists every sentence and story line,
   unit by unit, in every orthography the course is taught in, with the translation.
2. On anything wrong, choose **This sentence is wrong**. You can change the text, how a word is
   read (Jyutping), or the translation, and leave a note. The same button appears under each
   exercise's feedback and on each story line.
3. Choose **Download your corrections** to save them as a file.
4. Apply the file, then check the diff and fix by hand what it lists as not applied:

   ```sh
   cd pipeline && uv run nabu corrections apply ~/Downloads/nabu-corrections-fa.jsonl --summary /tmp/summary.md
   ```

5. Regenerate audio for changed sentences (`nabu audio generate`), then run `pnpm bundles`.

With an account on a server, corrections also reach the review queue at `/admin/v1/corrections`.

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
11. **Vowel marks** (`vocalization.yaml`, [ADR 0053](../docs/adr/0053-vocalization.md)). The
    draft uses formal written forms and no sukun. First check its `uncertain` list:
    - و as *va* (speech often has *o*);
    - چطور as *chetor* (Tehran) rather than *chetowr*;
    - تومان as *toman*;
    - روی left bare (its ی is the ezafe glide);
    - نوروز as نَوروز.

    Then the conventions it chose:
    - short *o* written with و takes a damma on the consonant before it (تُو, خُوردیم, مِترُو);
    - initial آ/ا + long vowel stays bare (این, او);
    - *iy* stays bare (خیابان);
    - *ey* is kasra + ی (خِیلی), *ow* is fatha + و;
    - the silent و of خوا stays bare;
    - ezafe carriers (ی, ٔ) stay bare.

    نه is pinned *na* on its 11 tokens; the drill's "nine" stays unmarked.
12. **Several people** ([ADR 0075](../docs/adr/0075-persons-coverage.md)). Ten new sentences,
    tagged "to several people", are the شما + -ید counterparts of تو sentences in the same lessons. Their
    accept sets drop the تو forms. Should colloquial شماها also be accepted? The singular stays
    untagged: شما is also the polite singular, so a "to one person" tag would rule nothing out until
    register (T–V) is modelled.

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
11. **One person or several** ([ADR 0075](../docs/adr/0075-persons-coverage.md)). The 57 "you"
    sentences whose English does not say how many (outside the intro unit) are tagged "to one person",
    so they take 你 and not 你哋. 15 new sentences, tagged "to several people", are their 你哋
    counterparts with the same tokens and readings (s.u02.39 …). Check that each still sounds natural
    to a group: 你哋媽媽 (siblings), 你哋有冇貓, 我等你哋.

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
10. **The Cyrillic.** The 121 info notes where ICU's transform differs are ICU errors (э after
    consonants, ёʻ for йў). The pinned Cyrillic follows the standard spelling. Loanwords are
    pinned in their standard form (поезд, самолёт, Англия).
11. **Several people** ([ADR 0075](../docs/adr/0075-persons-coverage.md)). Seven new sentences,
    tagged "to several people", say *Sizlar … -sizlar* (Yaxshimisizlar?, Tushundingizlarmi?). Their
    accept sets take *siz* or *sizlar* forms and drop *sen*. Is the doubled plural (*Sizlar … borasizlar*)
    natural, or should *Siz … borasizlar* be the shown form?

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
9. **Vowel marks** (`vocalization.yaml` and the stories, [ADR 0053](../docs/adr/0053-vocalization.md)).
   Lebanese short vowels have no standard; the draft follows the course's Arabizi, and every vowelless
   consonant gets a sukun.
   - **Left bare.** بيت and بيروت, rather than imply the mountain pronunciation *bayt*; also على,
     الله and والله. The stories, though, mark هَيدا and اللَّيْلِة with the diphthong.
   - **The `uncertain` list:**
     - لأ;
     - بحكي (*ba7ki* or *bi7ki*) and بتحكي;
     - the bare alif of اسْتَنّى;
     - inserted vowels: صحن, شهر, اسم, إبن, قبل, وربع;
     - رخيصة *-e* after ص;
     - أهلا وسهلا without tanwin;
     - الجمعة (*jum3a* in the story, *jem3a* in the Arabizi);
     - الليلة and دغري.
   - **Pinned on their tokens.** كيفك, قلبك and بيتك are *-ak* in sentences and *-ik* in stories.
   - **The feminine ending.** The vowel before ة is marked from the Arabizi (*-e* kasra, *-a*
     fatha). Some stories leave it off.
10. **Accept sets.** How generous should the Arabizi variants be (2 or no 2, e/i, kh/5, gh/8),
    and the English alternatives?
11. **The voice** ([ADR 0058](../docs/adr/0058-lahgtna-voice.md)). Every clip is synthetic: Lahgtna
    (OmniVoice), cloning one designed Beirut man's voice (`audio/voices/beirut-m.wav`), reading
    the vowel-marked text.
    - **Listen for:** a Lebanese accent rather than MSA or another dialect; the vowels the marks
      ask for (a wrong mark is said as written); stress; how questions sound.
    - **Where to start:** `nabu audio report ../courses/apc` lists the clips the round-trip check
      put up for review. Whisper writes Lebanese words in MSA spelling (هيدا as هذا), so a high CER
      is not always a bad clip, and a low one is not always a good one.
    - **A wrong clip:** fix the vowel marks (vocalization.yaml or the token's `vocalized`) and
      regenerate, or record the sentence (`nabu audio ingest`).
12. **Women speaking, women and groups addressed** ([ADR 0075](../docs/adr/0075-persons-coverage.md)).
    50 new sentences.
    - **Plural "you"** in four new lessons (`apc.fam.you-pl`, `apc.food.you-pl`, `apc.day.you-pl`,
      `apc.past.you-pl`): the -kon ending (كيفكن, بدّكن, عندكن), imperatives in -o (تفضّلوا, كلوا,
      اشربوا, استنّوا), the present bt-…-o (بتعملوا), the past -to (رحتوا, أكلتوا, اشتريتوا), adjectives in
      -in (جوعانين, مبسوطين, رايحين), and إنتو.
    - **Spelling to check:** the Arabizi *-o* rather than *-u* (both are accepted), and ـوا rather
      than ـو in Arabic script (both are accepted).
    - **A woman speaking:** جوعانة, عطشانة, مأخّرة, مشغولة, تعبانة, مبسوطة, رايحة, فاضية. Their
      clips are in the course's man's voice, for now.
    - **To a woman:** عندِك, يمينِك, عمرِك (vowel marks pinned), بتشتغلي, بتحبّي, بدِّك, اشتريتي, كنتي
      مشغولة, استنّي, حبيبتي (tagged "to a woman"; it is also said to men).

## lzh (Classical Chinese)

Drafted after the native-speaker pass above, so it has had no second reading
([ADR 0071](../docs/adr/0071-classical-chinese.md)). A reviewer of Classical Chinese should check:

1. **Readings by sense.** Each sense is read one way in all three layers. They were checked
   against Wiktionary, whose entries group readings by sense: 242 of 246 characters agree on all
   three. 生 *sraeng* and 從容 *sung1 jung4* were corrected to Wiktionary. Check the borrowings
   and polyphones first:
   - 說 "pleased" yuè / jyut6 / ywet (= 悅);
   - 女 "you" rǔ / jyu5 / nyoX (= 汝). The Guangyun lists 女 only as nrjoX, so nyoX follows
     the borrowing;
   - 有 "and" in 十有五 yòu / jau6 / hjuwH (= 又). The Guangyun lists 有 only as hjuwX;
   - 知 "wise" zhì / zi3 / trjeH (= 智);
   - 強 "force oneself" qiǎng / koeng5 / gjangX;
   - 舍 "give up" shě / se2 / syaeX (= 捨);
   - 見 "have an audience with" jiàn / kenH, not xiàn;
   - 覺 jué, 處 chù, 從容 cóng róng / sung1 jung4 / tshjowng yowng;
   - 不 is pjuw throughout, not pjut;
   - 遠 in 叟不遠千里 is the rising-tone hjwonX.
2. **Literary Jyutping where Unihan lists a colloquial reading first:** 生 sang1, 聲 sing1,
   頸 ging2, 耕 gang1, 復 "again" fau6, 鯈 tiu4 (kSMSZD2003Readings). 曰 is joek6.
3. **Grammar as taught:**
   - 為…笑 as a passive (`construction:wei-passive`); some editions read 為 as "become";
   - the fable opener 楚人有涉江者 (`construction:you-zhe`);
   - 之 in 吾劍之所從墜 tagged as the genitive 之.de, although it nominalizes a clause;
   - 上善若水 under 上 "above";
   - 此是霜, a Tang copula in a made-up sentence.
4. **Constructed sentences that may not be idiomatic:** 吾為之, 魯小, 人多, 君子少, 弟子十人,
   吾年十有五, 吾足矣, 吾行矣, 我與子路朋也, 天上有日, 兔身小, 此，矛也.
5. **Texts and editions:**
   - 吾矛之利，於物無不陷也 (with 於);
   - Han Feizi's 楯 is written 盾;
   - Laozi 25 王亦大 (some editions: 人亦大);
   - 道不遠人 (Doctrine of the Mean 13);
   - 天何言哉 (Analects 17.19);
   - 知者無不知也 (Mencius 7A46).
6. **English:** 仁者人也 "To be humane is to be human", 罔 "lost", 殆 "in danger", 耳順 "my ear
   was attuned", 矩 "the bounds" (carpenter's square accepted), 由 Yu/Zilu, 夜來 "in the night".
   A few accepted English answers are ungrammatical but harmless.
7. **Accept sets in Chinese** take 吾 or 我 as subject, 汝, 爾 or 子 for "you", optional 也
   where it does not change the meaning, 悅 for 說 "pleased", 捨 for 舍 and 智 for 知 "wise".
   Older and regional forms (爲, 説) are accepted with a note.
8. **Characters outside CLDR zh_Hant** are in the profile's `exemplarsExtra`, marked REVIEW:
   焉 歟 孰 奚 罔 慍 誨 殆 踰 矩 濠 鯈 遽 墜 耕 株 冀 耒 鬻 叟 啼.

## es (Cuban Spanish)

Thirty units for heritage speakers ([ADR 0076](../docs/adr/0076-cuban-spanish.md); the brief and
syllabus are in [es/README.md](es/README.md)). All thirty units are on the path. Every sentence,
story and scenario is an LLM draft. The drafts aim at the Spanish of a
Cuban family in Miami and in Havana: Cuban forms first, pan-Hispanic ones accepted.

Across the course, check first:

1. **Cuban usage and slang.** Every unit's notes claim things are Cuban: *asere*, *¿qué bolá?*,
   *guagua*, *jaba*, *pomo*, *pulóver*, *la shopping*, *mi'jo*, *el puro*, *estar en talla*,
   *coger lucha*, *la data* in dominó. Some are surely regional, dated or wrong.
2. **Register and family speech.** *Abuela*, *abuelo*, *mami*, *papi* without an article and in
   lowercase mid-sentence (RAE style); *tú* to most people, *usted* to elders and offices; non-
   inverted questions (*¿Qué tú quieres?*) as the canonical form.
3. **Accent pairs.** Grading treats a missing accent that spells another word of the course as
   wrong (*esta* for *está*). The pairs in u11 (*tú/tu, él/el, sí/si, mí/mi, té/te, sé/se,
   hablo/habló*) are the ones that matter most.
4. **Facts in KC notes.** Dates of the exile (u24), music history (u16), national symbols (u26),
   and customs (u20) were written from memory and should be checked.
5. **Family story continuity.** The family table in es/README.md, plus what the stories added:
   Abuela born in Matanzas, came in the Mariel boatlift (1980) and is 79; Marisol stayed in
   Cuba; Papi came as a balsero in 1994, aged about 14.
6. **Gender and number** ([ADR 0056](../docs/adr/0056-persons.md),
   [0075](../docs/adr/0075-persons-coverage.md)). 78 sentences say who speaks or who is spoken to:
   24 to a man, 8 to a woman, 18 to several people, 22 a man speaking, 12 a woman speaking. The
   woman-speaker sentences only start in u27 (Abuela, Lili, Mami); units 1–26 have Daniel alone.
7. **The voice.** The clips clone a newsreader of Radio La Voz de la Victoria (Ciénaga de
   Zapata, Matanzas; CC0). Held-back clips (`nabu audio report`) are mostly slang Whisper does not
   know (*¿Qué bolá?*), so a listener should decide them in the audio check.

By unit, what the drafts were least sure of:

### u02 La familia, u03 La casa
- Slang and pet names: el puro / la pura / los puros for parents (s.u02.34 "¿Cómo están los puros?"), mi herma (hermano note), ¡Qué mango! for a good-looking person (mango note), mi'ja / mi'jo with the apostrophe (mija accepted).
- Claimed Cuban usage: sillón = rocking chair; portal = front porch; mata de mango = mango tree; cuarto = bedroom; cocina also = the stove; chiquitico, ahoritica; abanico = hand fan.
- Notes: estoy caliente means aroused, say tengo calor; a colada is shared out in thimble-sized cups; most of Hialeah is Cuban or of Cuban descent.
- Made-up family details: Abuela and Abuelo's house in Hialeah has a portal, a patio and a mango tree; Daniel's family also lives in Hialeah; Mami calls Yasiel mi'jo.
- Articles and capitals: "Abuela tiene calor.", "Abuelo Pepe está en el patio." (La abuela… also accepted); lowercase abuela, mami, papi mid-sentence ("¿Dónde está mami?").
- Accept sets: "you" takes tú, usted and ustedes forms; (mami|mamá), (papi|papá) interchangeable; "Ellos son mis primos" also accepts "Ellas son mis primas"; mango-tree sentences accept árbol de mango; "Este es mi cuarto" accepts dormitorio and "Esta es mi habitación".

### u04 La comida, u05 Los números
- Congrí note: strictly red beans, moros y cristianos black, "but many families call both congrí". Right for Miami?
- Sensitive words: fruta bomba (papaya is vulgar slang in Cuba); mi negro / mi negra as endearment: keep or drop the note?
- Slang and customs: fulas = dollars; "in Miami, pesos often just means dollars"; Cubans sing Felicidades at birthdays; tomar rather than beber for drinks.
- The cola: ¿El último? ("Who's last?") and a stranger answering "Yo soy la última, mi vida": etiquette and wording?
- Abuela is 79 (80th birthday in u30). Story realism: a colada and ten tostones for $20 at a ventanita at 8:30 pm; "¿Veinte dólares? ¡Asere!".
- u05 teaches 1–10, 15, 19, 20, 24, 30, 50, 70, 100 as KCs; notes explain the rest.
- Accept sets widened: Qué horas son; un agua / un vaso de agua; papaya, fila; beber beside tomar; cuánto le debo; [en punto].
- Politeness: "¿Cuántos años tiene usted, señora?" (formal): acceptable to an older woman?

### u06 El barrio, u07 Un día
- Coger la guagua canonical (tomar accepted); the note that coger is vulgar in Mexico.
- Voy a casa vs Voy pa' la casa / a la casa: which is more natural; is pa' well placed in the accept sets?
- Mami cuela el café (colar) accepted beside hace café: is colar the everyday verb?
- Por la mañana vs en la mañana: both accepted; the por note says the second is common in the Caribbean and the US.
- The ahorita note ("right now or in a little while, depending on who says it"): the Cuban meaning?
- bañarse for showering, ducharse more Spain (me ducho accepted).
- The colada description (foam cup, little plastic cups, brought to work in the afternoon) and the ventanita note.
- Facts: Hialeah "the most Cuban city in the United States"; la bodega = ration store with la libreta; guagua = baby in Chile and the Andes; Domino Park = Parque Máximo Gómez; "el store" in Spanglish.
- ¡La guagua está aquí! may be stiff (¡Ahí viene la guagua!?).
- Sibling banter in the u07 story: "Sí, y tú te bañas por la noche".

### u08 De compras, u09 Ayer
- Shopping words: la shopping (feminine; "chópin") still current?; pomo for any bottle or jar; pulóver = T-shirt (dictionary: sweater); un baro = a peso (note); un mango = a good-looking person (unsure).
- Prices: a jaba for diez pesos, a mango for one dollar at a Miami stand.
- abuela lowercase mid-sentence ("fui a casa de abuela", "hablé con mi abuela"): Abuela? Is "a casa de abuela" (no article) natural?
- Story lines: "¡Y abuelo habló con la tele!" (le habló a la tele?); "¡Ese abuelo!".
- Accept sets: jugar [al] dominó; el béisbol / el juego for la pelota; ¿A cómo / A cuánto están…?; camiseta/playera for pulóver; nosotros/nosotras and ellos/ellas both accepted without persons.
- Notes: comprastes / fuistes with -s described as common Cuban speech written without it; antier; Domino Park (Parque Máximo Gómez) on Calle Ocho; doble nueve played in pairs.
- Gap: u08 has no regular -ir verb.

### u10 El viaje
- Spanish answers accept pa' and pa'l ("voy pa' Cuba", "vamos pa'l aeropuerto"); "voy pa cuba" grades correct. Wanted?
- tía lowercase before the name ("visitar a tía Marisol", RAE). Would the family write Tía? Abuela/Abuelo without article as names ("Abuela y mami van a Cuba"); la abuela also accepted.
- "¿Qué tú vas a llevar para Yunior?" displayed; "¿Qué tú le vas a llevar a Yunior?" accepted (le not yet taught). Natural enough?
- Hace calor only; do Cubans also say hay calor? "¿Cómo está el tiempo…?" accepted beside "¿Qué tiempo hace…?".
- Facts to verify: Cuban-born emigrants after 1970 enter on a Cuban passport; Miami flights land at José Martí (Boyeros); Matanzas "la Atenas de Cuba", birthplace of the danzón; Marisol < María de la Soledad; rainy season May–October; avoid "estoy caliente" for "I'm hot".
- Story tone: "¿Sí?" as "Really?"; the joke about Abuelo travelling in the suitcase.
- mami/papi notes: Cuban and Caribbean use at any age; parents calling little ones papi/mami.

### u11 Las tildes, u12 Cuando era niño
- quimbumbia glossed as tipcat; jugar a la quimbumbia (jugar quimbumbia accepted).
- Matanzas words: empinar papalote; montar bicicleta / a caballo without en; bohío; luz = electricity.
- Phone: el móvil in Cuba, el celular in Miami; "¿Cuál es tu teléfono?" for "what's your number?".
- u11 s.33 "Hoy hablo yo con tía Marisol; ayer habló Mami.": natural word order?
- u11 s.18 "¿Tú quieres el café con leche o sin leche?" and the té note (Cubans drink tea mainly when sick: tilo, manzanilla).
- Notes: school uniforms (wine red primaria, mustard secundaria, blue pre); Chinese bicycles in the Período Especial; Matanzas at the San Juan and Yumurí rivers; many Cubans say le for les; habían (plural) common in speech.
- u12 s.4 "Yo iba a la escuela en guagua con Lili." (el bus de la escuela?).
- u11 reverse sets with object pronouns (te/le, s.24, s.36) accept usted versions only partly.
- u11 story line "Y con tildes" (Marisol praising Daniel's accents) may be too metalinguistic.
- mas and tí pass with an accent note (the course writes neither).

### u13 Los cuentos de Abuela, u14 La cocina cubana
- penoso = shy; the note that guapo often means tough or angry in Cuba (a handsome man is lindo or buen mozo).
- un chin (de sal): Cuban, or Dominican and Puerto Rican?
- frijoles negros dormidos: the expression and its note.
- máquina for an older Cuban's car; "una máquina del cincuenta y siete" for a '57 car.
- Preterite/imperfect choices, especially s.u13.13 "Una noche, cuando yo estaba bailando con mi primo, llegó tu abuelo" (mientras and bailaba accepted).
- Recipe accept sets: s.u14.9 "se pican la cebolla y el ají" (se pica accepted); s.u14.29 "No eches mucha sal" (no le eches accepted); command forms with pronouns (échale, échalo, cómelos).
- The mojo method in s.u14.19 (garlic fried briefly in oil); cooking notes: ají cachucha, picadillo a la habanera, not stirring the rice, Nitza Villapol's Cocina al minuto.
- Usted commands to doña Ofelia: "Tome un cafecito", "lleve un poco de picadillo para su casa" (llévese?).
- "No me habló por una semana" (u14 story) vs Cuban "en una semana".
- Story details: Cachita's father in the sala as chaperone; Pepe's car stayed in Cuba, kept by a cousin in Matanzas.

### u15 Una carta a Cuba, u16 La música
- Cuban? coger el tubo (pick up the phone) and "te doy un tubazo"; mis viejos for my parents; echar = to put in ("Echo los zapatos en el paquete"); ¡Hecho! as "deal!" (¡Dale!?); tirar una foto; "¿cuándo va a haber guagua?".
- Spelling talk: "Hola lleva hache", "se escribe con hache"; "b de burro, v de vaca" in the note (do Cubans say be larga / ve corta?).
- Facts: Celia's ¡Azúcar! anecdote (a Miami waiter) and her lying in state at the Freedom Tower (2003); Benny Moré from Santa Isabel de las Lajas; danzón: Failde, Las alturas de Simpson, 1879; bolero from Santiago in the 1880s; Compay Segundo named for the second voice; el bongó in Cuba vs los bongós; salsa dancing called casino in Cuba; la clave del wifi; El Paquete Semanal.
- Naturalness: "A Lili le molestan los boleros"; "Compay Segundo es el más viejo" in the present (era/fue, el mayor accepted); "El mejor disco de abuelo es Buena Vista Social Club"; "Querida tía: ¿cómo estás?" (usted with la extraño accepted).
- Accept sets: te/le/les and lo/la/los/las for "you"; s.u15.25 (tubo) accepts contestar and teléfono; tocar las claves, los bongós/bongo.
- que.than split from que (comparisons); "a ver" tokenized a + ver.

### u17 Pelota y dominó, u18 La salud
- Dominó words: la data for a player's ten tiles (least sure; s.u17.30, story "¡la data no se dice!"); "Paso. No tengo fichas con seis"; "¡Tranque! Ya no podemos jugar."; pareja for one's partner; notes: dar agua (shuffling), una ficha (a sly person), in a tranque the lowest count wins.
- Present perfect vs preterite: Cubans often use the preterite; canonical perfects ("¿Qué tú has hecho hoy?", "Ya te he dicho que no, Lili", "¿Qué te ha dicho abuelo?") also accept the preterite.
- Pelota: Abuelo (exile since 1980) "es de los Industriales"; Yasiel calls him abuelo with usted; ponchar = a flat tyre (se ponchó la goma); "Lili ha ponchado a Daniel dos veces"; notes: Abreu from Cienfuegos, Industriales "los Azules", the Marlins' ballpark on the Orange Bowl site.
- Health: tener turno con el médico as Cuban (cita accepted); "el azúcar alta" and tener azúcar for diabetes; "tengo tremendo dolor de cabeza" (no un); cocimiento de manzanilla vs té; tilo for sleep and nerves; ¡Salud! for a sneeze (Jesús accepted); cocimiento de caña santa for a cold.
- tener que as a multi-word KC (sense:tener-que).
- abuelo, abuela, tía lowercased mid-sentence ("con abuelo Pepe", "A abuelo le duele…"; al abuelo accepted).

### u19 Con respeto, u20 Nochebuena
- ¡Propio! as the Cuban reply to con permiso (permiso note).
- Usted asymmetry (s.u19.5): the elder uses tú with Daniel, he uses usted with her; hablarle de usted vs tratar de usted (le trato accepted).
- La bendición: "¡Bendición, abuela! Me voy para el trabajo" / "¡Dios te bendiga, mi'jo!": wording, and usage by grown men.
- "¿Cómo amaneció usted, don Pepe?" as a morning greeting to elders.
- Anglicism notes: excúseme; la oficina del doctor; llamar para atrás; ¿Oigo? for answering the phone.
- Cultural claims: Christmas not a public holiday in Cuba 1969–1997; Reyes the day for presents before 1959; the Little Havana Three Kings parade; caja china a Miami thing (in Cuba en púa or in a pit); water thrown into the street and a walk round the block with a suitcase on New Year's Eve; medianoche sandwich; at the quince, the vals with the father then the court.
- The future vs ir a: va a + infinitive accepted wherever the future is canonical. Stricter in a future-teaching unit?
- Wording: "Doña Ofelia estaría feliz con un cafecito"; "Abuela tirará agua a la calle"; "Pase, pase… Está en su casa"; Doña rendered Doña, Miss or Mrs.
- s.u19.12 with les ("les piden la bendición a sus padres"), le also accepted.
- quisiera tagged form:subj-past (imperfect subjunctive, not conditional).

### u21 Los consejos de Abuela, u22 La llamada
- Slang and culture in notes: los baros (money); uaifai; IMO as the app Cubans used first; ETECSA double-credit recargas; fajarse for a fistfight; "muchacha" up to about forty.
- "La conexión está muy mal hoy" (mala accepted; malísima?).
- Idioms: "Yunior hizo tres horas de cola"; se fue la corriente / vino la corriente; "¿Cómo está la cosa por allá?".
- "No quiero que tú y tu hermana peleen" (se peleen accepted).
- "Los extraño mucho a todos"; "A Abuela le alegra mucho que la llames".
- Continuity: Cachita married at twenty (u13); the u22 call is just before Nochebuena.
- English accept sets: Mijo as a vocative; ojalá as "I hope"/"Hopefully"; "I advise you to"/"My advice is to".

### u23 Refranes, u24 La historia de la familia
- Idioms least sure: estar en talla ("looking sharp / up on it", s.u23.31, story "estoy en talla con por y para"); coger lucha / no cojas lucha; tirar un cabo; estar en el aire (clueless); dar muela; la corriente = electricity.
- New family history: Marisol (about 13 in 1980) was with her grandmother in the countryside when the family left and never got out; Abuela and Marisol met again in Havana fifteen years later, where Mami met her sister for the first time (could a Mariel emigrant visit around 1995?); Papi left Cienfuegos on a raft in 1994 at about 14 with his father, held at Guantánamo, then Miami; Doña Ofelia came in the 1960s; Abuela worked in a factoría and had no papers when Mami was born.
- Dates in notes: Mariel April–October 1980, about 125,000, after the Peruvian embassy crisis; balseros August 1994, about 35,000, after the Maleconazo, Guantánamo, admitted 1995; Freedom Flights 1965–73 (over 260,000); Pedro Pan 1960–62; the Freedom Tower 1962–74; Guantánamo base since 1903; Cienfuegos founded 1819; about 90 miles to Key West; La Sagüesera; factoría as Miami Spanish.
- Naturalness: "Yasiel se durmió y otro se llevó el trabajo"; "Abuelo Pepe madruga… para ir al parque"; story "yo trabajé mucho por ustedes, para que ustedes estudien" (estudiaran after a preterite?).
- Refranes: the English shows the literal sense first, then the English equivalent; variants accepted (Dios le ayuda, Quien no llora no mama, te digo quién eres, El camarón…, factoría/fábrica).

### u25 La Habana, u26 El campo
- Fares: cien pesos for an almendrón (s.u25.31 and the story).
- Hailing a botero: "Perdone, señor, ¿usted va hasta el Capitolio?" (s.u25.30) maybe too formal ("Chofe, ¿hasta el Capitolio?"); "¡el almendrón no camina!".
- tender la cama for making the bed.
- Bookish passives for the grammar: "es visitado por muchos turistas", "las hojas son cosechadas una por una", "fueron hechos por un guajiro".
- Facts: the tocororo dies in a cage; mariposa as national flower and independence-war messages hidden in it; uses of the palma real (yaguas wrapping tobacco); "sin azúcar no hay país"; nearly half the centrales closed in 2002; guajiro older than the "war hero" story; mogote as a geological term; the Capitolio "a little taller" than Washington's; the Bodeguita opened 1942 and the line attributed to Hemingway.
- Family: Abuela's father built her bohío; Daniel's great-grandfather cut cane at a central in Matanzas; s.u25.13 Daniel had never met Tía Marisol in person (conocido).
- Relative clauses: adonde / a donde / donde with van (s.u25.19); quien in non-restrictive clauses (s.u26.30).
- English names of the mariposa: white ginger lily / ginger lily / butterfly lily (s.u26.26).

### u27 José Martí, u28 Si pudiera
- The verses: the story's lines from *Versos sencillos* I (lines 1–4, read by Abuela) and XXXIX (lines 1–4, read by Daniel) come verbatim from Wikisource's text, written in by a script, never retyped. XXXIX line 2 there is *En julio como enero* (Ciudad Seva has the same); the song and some editions have *como en enero*: check against a scholarly edition. XXXIX 5–8 is paraphrased by Abuela ("Martí la cultiva también para el cruel").
- Provenance: the u27 story is marked as an LLM draft as a whole, though eight of its lines are Martí's (1891, public domain); the schema has provenance per story only. The story's title and a comment in the unit name the source.
- Facts: Martí "Pepe" to his family (the `josé` note and the story's link to Abuelo Pepe); *Versos sencillos* written in the Catskills in 1890, 46 poems; *Guantanamera*: Joseíto Fernández on Havana radio from the 1930s, Julián Orbón fitting Martí's verses to it, Pete Seeger in the 1960s; *La Edad de Oro*, four issues, 1889; "en el noventa y cinco" for 1895.
- Usage: *el bombo* (the US visa lottery) and *sacarse el bombo*; *la Yuma* and its supposed origin in *3:10 to Yuma*; Miami *reclamar* (to petition for a relative); *paladar* named after the telenovela *Vale tudo*; Cuba without a legal lottery since the early 1960s, *la bolita* living on; *mi'ja* from Cachita to Marisol.
- Accept sets: *pa' la Yuma*, *Yo que tú*, *hay que luchar*, *se aprendió los versos*, *toda el alma*, *estoy mayor* as an alternative to *vieja*; every -se form (*tuviese*, *pudiese*) accepted beside the -ra form.
- Heritage-error notes: *si tendría* (on `lotería`), *haiga* (on `cliente`), *trajiera/trayera* (on `traer`), *moverse* for *mudarse*, *soñar de*.

### u29 ¿Quién soy?, u30 El brindis
- Is it really Miami usage: *el rufo*, *vacunar la carpeta* (maybe more joke than speech), *aplicar para un trabajo*, *hace sentido*, *te llamo para atrás*. Each anglicism KC appears once in a lesson sentence about the word ("En Hialeah decimos carpeta; en Cuba dicen alfombra."); no accept set offers an anglicism for the Spanish word. Check that these sentences read well without quotation marks (the course uses none).
- Island words: *el cake* for a birthday cake (*pastel*, *bizcocho* accepted); *la planilla* for a form; *carpeta* as a hotel front desk in Cuba (a note); *yuma* / *la Yuma*, *medio yuma*.
- Usage: *¡Dale, asere!* and *¡Qué va!* from Yunior; *Por ustedes, mi'jo*; *agradecida con todos ustedes* vs. *a todos ustedes*; *Me gustaría agradecerles a todos que estén aquí*; *Abuela tiene una rosa blanca en el patio, por Martí* (is *por* natural?).
- Spelling: *espanglish* (RAE) canonical, *spanglish* accepted; *cubanoamericano* as one word.
- Accept sets: reported-speech tenses (*me preguntó de dónde era/soy*, *le dije que era/soy cubano*); *Cuando era niña / De niña*; the English of the toasts (*Many happy returns*, *Here's to many more*).
- The u30 scenario: Abuelo Pepe as master of ceremonies, teasing Daniel when he slips into Spanglish.

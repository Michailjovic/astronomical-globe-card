/**
 * Astronomical Globe Card
 * Realistický 3D glóbus Země pro Home Assistant Lovelace, inspirovaný
 * ciferníkem "Astronomie" na Apple Watch.
 *
 * - three.js 3D scéna: reálné NASA/Solar System Scope textury (den/noc/mraky),
 *   fyzikálně korektní terminátor počítaný z reálné polohy Slunce,
 *   atmosférická záře, Měsíc jako samostatné těleso se skutečnou fází a polohou.
 * - Poloha "doma" buď z konfigurace Home Assistanta, nebo z libovolné
 *   entity (person / device_tracker / zone).
 * - Kompletně bez build kroku - čisté ES moduly, three.js vendorováno lokálně.
 *
 * @version 0.15.0
 *
 * POZOR (cache): vnořené JS moduly (lib/*.js) se importují staticky
 * (standardní `import` nahoře souboru - spolehlivější než dynamický
 * `await import()`, který se v praxi ukázal křehčí a jeho selhání shazovalo
 * celou kartu do prázdna bez chybové hlášky), ALE se stejně verzují
 * natvrdo napsaným `?v=X.Y.Z` v samotném specifikátoru importu (musí se
 * ručně bumpnout na 3 místech při každé verzi: @version výše, CARD_VERSION
 * konstanta, a query string ve 3 static importech - viz paměť "verzování").
 * Bez téhle cache-busting query je reálné riziko, že prohlížeč/HA servuje
 * starou/rozbitou cache vnořeného souboru napořád, což shodí registraci
 * celé karty ("Custom element doesn't exist") bez jakékoli viditelné chyby.
 * Textury (obrázky přes TextureLoader) se verzují stejně, přes proměnnou V.
 *
 * SPOLEHLIVOST NAČÍTÁNÍ: každá textura se při selhání HTTP požadavku
 * jednou automaticky zopakuje (dočasný výpadek sítě) a pokud selže i
 * opakování, zobrazí se viditelná chybová hláška místo tichého prázdného
 * plátna. Stejně tak selhání WebGL inicializace (_initThree) už není tiché.
 *
 * v0.3.4: vizuální ladění - kamera odsazená dál od glóbu (kolem planety je
 * vidět kus hvězdného nebe), sytější barvy, jasnější hvězdné pozadí,
 * výraznější atmosférická záře.
 *
 * v0.3.5: oprava reálného důvodu, proč v0.3.4 vizuálně skoro nic
 * nezměnila - noční textura Země má oceán jako čistě černé pixely, takže
 * násobení jasem na něj nemělo žádný efekt; teď se přičítá konstantní
 * modré podsvícení. Hvězdné pozadí se navíc generuje procedurálně místo
 * z (velmi tmavé) textury stars.jpg.
 *
 * v0.3.6: oprava regrese z v0.3.5 - v earth-shaders.js byl v GLSL
 * komentáři uvnitř template literalu omylem párový znak backtick, což
 * v JS předčasně ukončilo string a rozbilo syntaxi celého souboru → karta
 * spadla už při načtení modulu ("Custom element doesn't exist").
 *
 * v0.3.7: řešilo zpětnou vazbu "barvy jsou pořád vybledlé, posuvník jasu
 * skoro nic nedělá" - užší soumrakový pás, silnější kontrast/sytost.
 *
 * v0.3.8: VŠECHNY parametry, které ovlivňují vzhled obrazu (síla nočního
 * podsvícení oceánu, sytost, kontrast, síla soumraku, krytí mraků, síla
 * atmosférické záře, jas hvězd/mlhoviny), jsou teď samostatné položky
 * v konfiguraci a posuvníky ve vizuálním editoru - místo aby byly
 * zadrátované jako konstanty v shaderu a měnily se jen přes zásah do kódu.
 * Viz earth-shaders.js pro detaily jednotlivých uniforem.
 *
 * v0.3.9 - SKUTEČNÁ PŘÍČINA "ztmavovacího filtru přes celou kartu": three.js
 * od r152 defaultně zapíná automatickou barevnou správu (ColorManagement) -
 * textury označené jako SRGBColorSpace se při čtení v shaderu tiše dekódují
 * sRGB->lineární a `new THREE.Color(hex)` dělá totéž. To je v pořádku pro
 * built-in materiály (ty mají vestavěný zpětný převod na výstupu), ale naše
 * VLASTNÍ ShaderMaterial (Země/mraky/atmosféra, viz earth-shaders.js) žádný
 * zpětný převod nedělaly - výsledek byl systematicky tmavší/míň sytý, než
 * hodnoty v kódu/texturách napovídají (ověřeno: hex 0x57c8ff vycházel jako
 * [0.10, 0.58, 1.00] místo [0.34, 0.78, 1.00]). Opraveno: den/noc/mraky
 * textury teď mají NoColorSpace (syrové hodnoty 1:1) a atmosférická barva
 * se čte přes setHex(hex, NoColorSpace). Sluneční záře a GPS značka měly
 * naopak opačný problém (built-in SpriteMaterial + textura bez colorSpace
 * = zbytečný DVOJITÝ převod na výstupu = vymytý/mlhavý vzhled) - opraveno
 * přidáním SRGBColorSpace na jejich canvas textury.
 *
 * v0.3.10 - SKUTEČNÁ (a tentokrát opravdu poslední) příčina "průsvitného
 * černého skla přes celou kartu", které v0.3.9 nevyřešila: CSS pravidlo
 * ".agc-error" (nastavuje "display: flex") má STEJNOU specificitu jako
 * výchozí prohlížečové pravidlo "[hidden] { display: none }" - a autorské
 * pravidlo v cascade vyhrává nad UA výchozím, takže atribut `hidden`
 * (přepínaný v JS) neměl žádný vizuální efekt. Poloprůhledná černá vrstva
 * chybové hlášky (rgba(0,0,0,0.75)) tak ležela nastálé přes celým plátnem
 * úplně nezávisle na jasu/sytosti/kontrastu - proto žádné z ladění barev
 * v0.3.1-0.3.9 vizuálně nic nezměnilo. Ověřeno pixel-přesně headless
 * renderem (barva pixelu Austrálie/oceánu teď 1:1 odpovídá zdrojové
 * textuře, dřív byla systematicky ~4x tmavší = přesně 1-0.75). Oprava:
 * přidáno ".agc-error[hidden] { display: none; }" s vyšší specificitou.
 *
 * v0.3.11 - oprava "obrázek se nenačte po vstupu do edit módu dashboardu":
 * `attachShadow()` lze na DOM elementu zavolat jen jednou za celý jeho
 * život. HA při reorganizaci masonry/sections layoutu (typicky právě při
 * přepnutí dashboardu do edit módu) běžně znovu použije TENTÝŽ element
 * (odpojí ho a znovu připojí), a `connectedCallback()` v tom případě volá
 * `_build()` podruhé na elementu, který už shadow root má - `attachShadow()`
 * pak vyhodí výjimku ještě PŘED `_initThree()`/`_loadTextures()`, takže se
 * 3D scéna a textury už nikdy znovu nepostaví a zůstane viset stará,
 * mezitím `_dispose()`-em uvolněná (mrtvá) shadow DOM bez obrázku. Oprava:
 * `attachShadow()` volat jen když `this.shadowRoot` ještě neexistuje.
 *
 * v0.4.0 - nová konfigurační volba `marker_size` (posuvník v editoru):
 * velikost GPS značky domovské/sledované polohy na povrchu glóbu dřív byla
 * napevno 0.1 (natvrdo v kódu), teď je nastavitelná (výchozí hodnota
 * beze změny, takže stávající konfigurace vypadají stejně jako dřív).
 *
 * v0.5.0 - ruční otáčení glóbem tažením myší/prstem po canvasu (config
 * `manual_rotation`, výchozí zapnuto). Implementováno jako akumulovaný
 * azimut/elevace navrch stávajícího výpočtu směru kamery (stejný princip
 * jako `rotation_wobble`), ne jako přepis kamery/OrbitControls - proto se
 * to dobře snáší se sledováním domovské polohy i s wobble efektem (wobble
 * se během aktivního tažení potlačí, ať se s gestem nepere). `.agc-canvas`
 * má `touch-action: none`, jinak by mobilní prohlížeč tažení interpretoval
 * jako scroll stránky místo rotace (stejný kompromis jako HA mapová karta -
 * dotykem přímo na glóbu už nejde scrollovat skrz kartu, mimo kartu ano).
 * Po ~5 s nečinnosti se natočení plynule (frame-rate nezávislý exp. doběh)
 * vrátí zpět na sledovanou polohu.
 *
 * v0.5.1 - oprava obrácené vertikální osy z v0.5.0: tažení nahoru/dolů
 * naklánělo kameru přesně opačně, než jak to uživatelé očekávali (přímá
 * manipulace jako u map - tažení nahoru má odhalit pohled "zespoda").
 * Vodorovná osa (azimut) byla v pořádku, opraveno jen znaménko u elevace.
 *
 * v0.5.2 - oprava "flipnutí na druhou stranu" při delším svislém tažení:
 * skutečná příčina byl fixní klamp `manualEl` na ±85°, který omezoval jen
 * PŘÍRŮSTEK naklonění, ne výsledný úhel kamery od pólu - ten je ale součtem
 * přírůstku A zeměpisné šířky sledované polohy (colatitude). Pro místa
 * daleko od rovníku (např. Praha, ~40° od severního pólu) tak šlo tažením
 * "nahoru" přetočit kameru přes samotný pól na druhou polokouli - najednou
 * viditelná jiná strana glóbu = ten nahlášený flip. Oprava: klamp se teď
 * počítá dynamicky podle skutečné zeměpisné šířky domovské/sledované
 * polohy tak, aby výsledný úhel od pólu nikdy neopustil bezpečný rozsah
 * [8°, 172°] (`MIN_TILT_THETA`/`MAX_TILT_THETA`) - kamera se maximálně
 * "opře" těsně o pól, nikdy přes něj nepřeskočí. Ověřeno mnoha drobnými
 * kroky (simulace skutečného tažení prstem), ne jen jedním velkým skokem -
 * u jednorázového klampu na PŘÍRŮSTKU by to jinak mohlo projít nepozorovaně.
 * Vodorovná osa (azimut) žádný klamp nemá a nepotřebuje ho - otáčení kolem
 * svislé osy Y úhel od pólu vůbec nemění, takže je (správně) neomezená.
 *
 * v0.6.0 - dvě nová tlačítka nad glóbem (viditelná jen když je zapnuté
 * `manual_rotation`): (1) "vrátit domů" - okamžitě vynutí stejnou plynulou
 * animaci návratu na domovskou polohu, jakou dřív spouštěl jen 5s
 * automatický idle timeout; (2) zámek - vypne/zapne ten automatický
 * 5s návrat, takže si uživatel může glóbus nechat natočený libovolně
 * dlouho a vrátit ho ručně tlačítkem (1), až bude chtít. Obě tlačítka
 * sedí nad canvasem (vyšší z-index), takže klik na ně nezasáhne zároveň
 * i drag-rotaci pod nimi.
 *
 * v0.7.0 - ruční otáčení přepsáno z az/el (kolem pevné svislé osy Y, viz
 * v0.5.2) na plnohodnotný TRACKBALL/ARCBALL postavený na kvaternionu
 * (`_manualQuat`, viz `_bindDragRotation`/`_frame`). Předchozí přístup měl
 * vestavěný limit - u pólu splývala referenční osa se směrem pohledu
 * (gimbal lock), takže muselo existovat umělé oclamplé pásmo [8°,172°],
 * jinak kamera při dost dlouhém svislém tažení "přeskočila" na druhou
 * stranu. Kvaternion žádnou pevnou referenční osu nepoužívá - každý krok
 * tažení se otáčí kolem AKTUÁLNÍCH os odvozených z dosavadní orientace, ne
 * kolem globální osy Y, takže žádný pól neexistuje a otáčení je ve všech
 * směrech skutečně nekonečné, přesně jako fyzický glóbus v ruce. Cena: po
 * hodně "volném" otáčení už sever nemusí být nahoře na obrazovce (na
 * rozdíl od staré verze, která "nahoře" vždy držela). Auto-návrat (tlačítko
 * i idle timeout) teď dělá `Quaternion.slerp()` k identitě místo dřívějšího
 * exponenciálního doběhu dvou čísel.
 *
 * v0.7.1 - oprava "zbláznění" při dotyku druhým prstem (např. při pokusu
 * o pinch-to-zoom): Pointer Events API posílá samostatný pointerdown pro
 * KAŽDÝ prst zvlášť (různé pointerId) a kód dřív žádný z nich nerozlišoval -
 * druhý prst přepsal souřadnice rozjetého tažení a oba prsty pak střídavě
 * posílaly pohyby počítané jako delta od "kohokoli naposled", odtud ty
 * nesmyslné skoky (ne pokus o samotný zoom). Teď tažení drží jen ten
 * pointerId, který ho zahájil - každý další prst se, dokud se ten první
 * nepustí, úplně ignoruje. Vedlejší efekt: tím pádem samo o sobě funguje
 * i jako "zablokování" pinch-to-zoom (druhý prst nemá na nic vliv) - žádný
 * skutečný zoom kamery zatím neexistuje, takže tohle je zatím jediná
 * rozumná reakce na dva prsty.
 *
 * v0.8.0 - nová volba `celestial_reveal` (výchozí zapnuto): klidová kamera
 * se mírně (max ~14°) nakloní ke Slunci nebo Měsíci, když je "jejich čas" -
 * Slunce blízko obzoru (svítání/soumrak), nebo Měsíc nad obzorem v noci.
 * Předtím byly obě tělesa sice v 3D scéně na fyzikálně správném místě
 * (viz `_frame`), ale kamera sledující jen domovskou polohu je skoro nikdy
 * neukázala v záběru - šlo je zahlédnout jen náhodou při ručním otáčení.
 * Síla náklonu plynule doznívá s výškou nad obzorem (`triangleWeight` pro
 * Slunce, lineární náběh pro Měsíc), takže se nikdy neobjeví/nezmizí
 * skokem - viz `_applyCelestialReveal()`.
 *
 * v0.9.0 - nové tlačítko vlevo nahoře: pohled "sluneční soustava" (Slunce +
 * 8 planet na dnešní pozici + jejich oběžné dráhy), nahradí glóbus na
 * stejném místě (viz `setViewMode()`). Pozice planet počítá nový modul
 * `lib/planets.js` (zjednodušené Keplerovy elementy J2000 + Newton-Raphson
 * řešení Keplerovy rovnice, přesnost řádově úhlové minuty - naprosto
 * dostatečné pro vizualizaci). Vzdálenosti od Slunce (0.39-30 AU) se do
 * čitelné podoby škálují přes odmocninu (`auToDisplayRadius`) - není to
 * astronomicky přesné měřítko (to by vnitřní planety smrsklo na neviditelné
 * tečky u Slunce), jde jen o čitelnou vizualizaci se správným POŘADÍM a
 * plausibilním relativním rozestupem, stejně jako referenční ilustrace,
 * podle které se tenhle pohled navrhoval. Sdílí stejný renderer/canvas/
 * WebGL kontext jako hlavní glóbus (`_frameSolar()` jen přepne, která
 * dvojice scene+camera se pošle do `renderer.render()`) - žádný druhý GPU
 * kontext navíc. Zatím bez ručního otáčení (na rozdíl od glóbusu) - jen
 * pomalá dekorativní orbitální kamera kolem Slunce.
 *
 * v0.9.1 - oprava: solar tlačítko z v0.9.0 leželo ve vlastním rohu vlevo
 * nahoře přesně přes datum (`.agc-overlay-top` tam začíná text). Přesunuto
 * do `.agc-view-controls` vpravo nahoře, ke stávajícím reset/zámek
 * tlačítkům - tenhle roh byl volný a datum je zarovnané doleva, takže tam
 * ke kolizi dojít nemůže. Container `.agc-view-controls` teď zůstává vždy
 * viditelný (dřív se celý schovával podle `manual_rotation`/pohledu, což by
 * smazalo i solar tlačítko) - viditelnost reset/zámek tlačítek uvnitř řeší
 * nová `_updateRotationButtonsVisibility()`. Mimochodem opraven i drobný
 * drift: import `earth-shaders.js` zůstal na cache-busting `?v=0.8.0` i po
 * pozdějších bumpech verze - sladěno zpět s `CARD_VERSION`.
 *
 * v0.10.0 - pohled "sluneční soustava" umí víc, první dávka z delší
 * roadmapy nápadů (viz `_frameSolar`/`_selectSolarPlanet`):
 * 1) TAŽENÍ - na rozdíl od glóbusu je tohle klasická orbitální kamera
 *    dívající se na pevný bod, ne trackball, takže stačí jednoduchý az/el
 *    offset (`_solarAzOffset`/`_solarElOffset`) navrch pořád běžící
 *    pomalé auto-orbity - žádný gimbal lock/pól tu nehrozí, jen je elevace
 *    kvůli čitelnosti scény klampovaná (SOLAR_EL_MIN/MAX).
 * 2) KLIK NA PLANETU - raycasting (`_raycastSolarPlanetAt`) rozliší krátký
 *    klik od tažení (posun pod SOLAR_CLICK_MAX_MOVE_PX), kamera se plynule
 *    "doletí" přiblížit na vybranou planetu (frame-rate nezávislá
 *    exponenciála, `SOLAR_FOCUS_TIME_CONSTANT`) a zobrazí se info panel se
 *    jménem + vzdáleností od Slunce a od Země (AU i mil. km,
 *    `formatAU()`) - vzdálenost od Země se počítá ze SUROVÝCH
 *    heliocentrických AU souřadnic (`_solarRawPositions`), ne ze
 *    zobrazovací odmocninové škály, jinak by vyšla nesmyslně.
 * 3) ZVÝRAZNĚNÍ ZEMĚ - jemné poloprůhledné halo (reuse
 *    `makeMarkerTexture()`) kolem Země, ať je v přehledu celé soustavy
 *    hned vidět "kde jsme".
 * Zbytek nápadů z brainstormingu (časová animace, konjunkce/opozice text,
 * Měsíc jako mini-model u Země, pás asteroidů, "co je dnes vidět ze Země")
 * zůstává na roadmapě pro další verze.
 *
 * v0.11.0 - druhá dávka roadmapy: ČASOVÁ ANIMACE v solar view
 * (`.agc-solar-time` lišta dole, viz `_bindSolarTimeControls`). Tlačítko
 * přehrát/pauza + tlačítko rychlosti (cykluje 1 den/týden/měsíc/rok za
 * sekundu, vždy dopředu) + tlačítko "Dnes" pro návrat na živé sledování.
 * `_solarSimTime`/`_solarTimeSpeed` jsou jediný zdroj pravdy: dokud je
 * animace vypnutá, chová se karta přesně jako předtím (živé "teď",
 * aktualizace 1×/s); jakmile běží, `_frameSolar()` přebírá přepočet pozic
 * KAŽDÝ SNÍMEK (ne ten 1×/s interval), jinak by animace při vyšších
 * rychlostech škubala. Pokud je zrovna vybraná planeta (viz v0.10.0),
 * zaostření kamery ji přirozeně sleduje i během pohybu - žádný extra kód,
 * `focusMesh.position` se prostě mění pod rukama.
 *
 * v0.12.0 - třetí dávka roadmapy: KONJUNKCE/OPOZICE text v info panelu
 * vybrané planety (viz `computeElongation`/`describeSolarAlignment` výš u
 * `formatAU`). Elongace (úhel Slunce-Země-planeta) a geocentrická
 * ekliptikální délka planety vůči Slunci se počítají ze stejných surových
 * heliocentrických AU souřadnic jako vzdálenost od Země (v0.10.0) - žádná
 * nová astronomie navíc, jen jiný pohled na tytéž vektory. Merkur/Venuše
 * (dráha blíž Slunci než Země) mají dolní/horní konjunkci, ostatní planety
 * konjunkci (za Sluncem) a opozici (Země mezi Sluncem a planetou -
 * nejlepší čas k pozorování, planeta na obloze celou noc); mimo tyhle
 * prahové stavy se ukáže jen "XX° od Slunce - viditelný večer/ráno" podle
 * toho, jestli je planeta východně (večernice) nebo západně (jitřenka) od
 * Slunce na obloze.
 *
 * v0.13.0 - čtvrtá dávka roadmapy: "CO JE DNES VIDĚT ZE ZEMĚ". Nová
 * `getPlanetHorizontalPositions()` v `lib/planets.js` převádí heliocentrické
 * pozice planet (Merkur-Saturn - Uran/Neptun nejdou pouhým okem vidět, proto
 * vynechány, viz `NAKED_EYE_PLANETS`) na výšku nad obzorem + azimut pro
 * domovskou GPS polohu (standardní řetězec ekliptika → rovníkové (RA/Dec) →
 * horizontální souřadnice, Meeus). Info panel vybrané planety teď navíc
 * ukazuje, jestli je zrovna nad obzorem, kde na obloze (světová strana), a
 * jestli je u domovské polohy zrovna tma (`_isNightAtHome()`, stejná
 * východ/západ logika jako odpočet v hlavičce karty). Během časové animace
 * (v0.11.0) se počítá pro SIMULOVANÝ čas, ne pro živé "teď"
 * (`_solarPositionsDate`) - ať je to vždy konzistentní s tím, co je zrovna
 * vidět ve scéně. Matematika ověřena samostatně: v "podplanetárním bodě"
 * (lat=deklinace, lon odvozeno z RA a hvězdného času) vychází výška ~90° s
 * přesností na setiny stupně, stejně přesně -90° v antipodu.
 *
 * v0.14.0 - pátá dávka roadmapy: MĚSÍC jako mini-model u Země
 * (`_solarMoonMesh`, viz `_initSolarScene`/`_updateSolarMoonPosition`).
 * Skutečná vzdálenost Měsíce (0.00257 AU) by na tomhle měřítku byla pod
 * rozlišením pixelu, takže stylizovaná vzdálenost (`MOON_ORBIT_VISUAL_RADIUS`),
 * ale SMĚR je skutečný: `moon.phase` z astro.js je už definovaná jako úhel
 * (ekliptikální délka Měsíce mínus Slunce)/360°, takže `phase × 2π` je
 * přesně úhel Měsíce vůči směru Země→Slunce - žádná nová astronomie navíc,
 * jen reuse hodnoty počítané už pro ikonku fáze jinde v kartě. Měsíc je
 * PŘIDANÝ JAKO DÍTĚ zemské mesh, takže s ní automaticky letí (three.js
 * skládá world pozici = pozice rodiče + lokální pozice dítěte). Bonus:
 * fáze Měsíce se ukáže sama, bez jakéhokoli fázového shaderu/textury -
 * Měsíc má stejný `MeshStandardMaterial` a je nasvícený stejným Sluncem
 * (`PointLight`) jako planety, takže "srpek/couvající srpek" vyleze čistě
 * jako vedlejší efekt správně natočeného 3D nasvícení ve správném směru.
 *
 * v0.15.0 - šestá a poslední dávka roadmapy z brainstormingu: PÁS
 * ASTEROIDŮ + PLUTO. Pás asteroidů je čistě dekorativní statický
 * `THREE.Points` oblak (`ASTEROID_BELT_*` konstanty) mezi drahou Marsu a
 * Jupiteru - NE simulace tisíců jednotlivých těles na vlastních drahách
 * (zbytečné pro tuhle vizualizaci, vizuálně nerozeznatelné od statického
 * mraku). Pluto přidán jako 9. těleso se svými vlastními Keplerovými
 * elementy (`ELEMENTS.pluto` v `lib/planets.js`) - záměrně MIMO
 * `PLANET_ORDER` (trpasličí planeta od IAU 2006, ne jedna z 8 "hlavních"),
 * ale jinak se chová úplně stejně jako ostatní planety (klikatelný,
 * zaostřitelný, má konjunkci/opozici v info panelu) díky tomu, že veškerý
 * kód od `_updateSolarPositions()` po `_updateSolarInfoPanel()` bere klíč
 * planety obecně (`Object.keys(this._solarPlanetMeshes)`), ne natvrdo
 * `PLANET_ORDER`. Pluto elementy ověřeny web-searchem (JPL/Standish
 * tabulka Pluto historicky obsahovala, NASA ji z veřejné stránky po
 * přeřazení IAU odstranila) + křížovou kontrolou proti nezávislé DE200-fit
 * tabulce (shoda na 3-4 platné číslice) + Keplerovým 2. a 3. zákonem
 * (viz `lib/planets.js` a testy) - stejná úroveň důvěry jako u ostatních
 * 8 planet.
 */

// POZOR: verze v query stringu níže (?v=0.3.10) je záměrně napsaná natvrdo,
// NE přes proměnnou/template literal - specifikátor static importu musí být
// syntaktický string literál, jinak by to nebyl platný static import. Musí
// se ale ručně držet synchronně s CARD_VERSION (viz paměť "verzování") -
// jinak nedojde k cache-bustu vnořených lib/*.js souborů při bumpu verze.
import * as THREE from './lib/three.module.min.js?v=0.15.0';
import { getSunPosition, getMoonPosition, getSunTimes } from './lib/astro.js?v=0.15.0';
import {
  getPlanetPositions,
  PLANET_ORDER,
  PLANET_MEAN_DISTANCE_AU,
  getPlanetHorizontalPositions,
  NAKED_EYE_PLANETS,
  getPlutoPosition,
  PLUTO_MEAN_DISTANCE_AU,
} from './lib/planets.js?v=0.15.0';
import {
  earthVertexShader,
  earthFragmentShader,
  cloudsVertexShader,
  cloudsFragmentShader,
  atmosphereVertexShader,
  atmosphereFragmentShader,
  skyVertexShader,
  skyFragmentShader,
} from './lib/earth-shaders.js?v=0.15.0';

const CARD_VERSION = '0.15.0';
const CARD_DIR = new URL('.', import.meta.url).href;
const V = `?v=${CARD_VERSION}`;
const EARTH_RADIUS = 1;
// Referenční "beze změny" kvaternion pro ruční otáčení (_manualQuat) -
// vytvořený jednou při načtení modulu a jen čtený, ne měněný (sdílená
// konstanta, ne "domovská hodnota kterou lze omylem přepsat").
const IDENTITY_QUATERNION = new THREE.Quaternion();
// Odsazeno dál (dřív 2.55) - glóbus zabírá cca 70 % výšky rámečku místo
// skoro 100 %, takže je kolem něj vidět kus hvězdného vesmíru.
const CAMERA_DISTANCE = 3.2;
const MOON_ORBIT_RADIUS = 2.5;
const MOON_RADIUS = 0.16;
// Ruční otáčení tažením (config `manual_rotation`) - po tolika sekundách
// nečinnosti od posledního pohybu prstem/myší se karta začne plynule vracet
// zpět na sledovanou domovskou polohu (časová konstanta exp./slerp doběhu
// v _frame()).
const MANUAL_IDLE_TIMEOUT = 5;
const MANUAL_RETURN_TIME_CONSTANT = 1.1;
// Pod jakým úhlem (radiány) od identity už považujeme ruční natočení za
// "doma" - pod touto hranicí se slerp doběh zastaví a kvaternion se natvrdo
// nastaví na identitu (ať navěky neběží nekonečně malé zbytkové kroky).
const MANUAL_RETURN_SNAP_ANGLE = 0.001;
// Základní (referenční) hodnota atmosférické záře - config `atmosphere_
// intensity` ji násobí (1.0 = tato hodnota).
const ATMOSPHERE_BASE_INTENSITY = 1.55;

// -- Naklonění klidové kamery ke Slunci/Měsíci u obzoru (config
// `celestial_reveal`) - viz _applyCelestialReveal(). Všechny úhly v
// radiánech (degToRad() jen pro čitelnost při definici).
// Slunce: váha má vrchol těsně nad obzorem (ať je vidět jako na referenčním
// snímku "záře nad okrajem glóbu"), plynule doznívá do 0 na obou stranách.
const SUN_REVEAL_PEAK = degToRad(3);
const SUN_REVEAL_HALF_WIDTH = degToRad(18);
// Měsíc: naklánět jen v noci (Slunce pod obzorem) a jen když je Měsíc už
// nad obzorem - síla lineárně roste s výškou, plné síly dosáhne v tomto úhlu.
const MOON_REVEAL_MAX_SUN_ELEVATION = degToRad(-2);
const MOON_REVEAL_RISE_ANGLE = degToRad(15);
// Maximální náklon klidové kamery od domovské polohy - záměrně mírný, ať
// GPS značka domova zůstane většinou v záběru i při plné síle náklonu.
const CELESTIAL_MAX_NUDGE = degToRad(14);

const QUALITY_TIERS = {
  low: { label: 'Nízká (rychlá)', earth: 1024, folder: 'low' },
  medium: { label: 'Střední (doporučeno)', earth: 2048, folder: 'medium' },
  high: { label: 'Vysoká', earth: 4096, folder: 'high' },
};

// -- Pohled "sluneční soustava" (tlačítko v rohu, config-independent) -----
// Skutečné vzdálenosti planet (0.39-30 AU) by lineárně nešly zobrazit
// srozumitelně najednou - vnitřní planety by splynuly se Sluncem. Stejně
// jako referenční ilustrace, kterou jsme probírali, škálujeme vzdálenost
// přes odmocninu (zachová správné POŘADÍ a relativní "rozestupy", jen je
// stlačí) - NENÍ to astronomicky přesné měřítko, jen čitelná vizualizace.
const SOLAR_DISPLAY_MIN_R = 1.0; // poloměr dráhy Merkuru ve scéně
const SOLAR_DISPLAY_MAX_R = 5.4; // poloměr dráhy Neptunu ve scéně
const SOLAR_SQRT_MIN = Math.sqrt(PLANET_MEAN_DISTANCE_AU.mercury);
const SOLAR_SQRT_MAX = Math.sqrt(PLANET_MEAN_DISTANCE_AU.neptune);

function auToDisplayRadius(distanceAU) {
  const s = Math.sqrt(Math.max(0.05, distanceAU));
  const f = (s - SOLAR_SQRT_MIN) / (SOLAR_SQRT_MAX - SOLAR_SQRT_MIN);
  return SOLAR_DISPLAY_MIN_R + f * (SOLAR_DISPLAY_MAX_R - SOLAR_DISPLAY_MIN_R);
}

// Barvy/velikosti planet jsou stylizované, ne v reálném poměru (Jupiter je
// ve skutečnosti ~11x širší než Země, Slunce ~109x - v reálném poměru by
// vnitřní planety byly neviditelné tečky). Poloměr v jednotkách scény.
const PLANET_VISUALS = {
  mercury: { color: 0x9c9c9c, radius: 0.028 },
  venus: { color: 0xe0c28c, radius: 0.052 },
  earth: { color: 0x4d90fe, radius: 0.055 },
  mars: { color: 0xc1440e, radius: 0.036 },
  jupiter: { color: 0xd9a066, radius: 0.16 },
  saturn: { color: 0xe3c98c, radius: 0.14, ring: true },
  uranus: { color: 0x9fe3e3, radius: 0.10 },
  neptune: { color: 0x4066e0, radius: 0.095 },
};
const PLANET_LABELS_CS = {
  mercury: 'Merkur', venus: 'Venuše', earth: 'Země', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uran', neptune: 'Neptun',
  pluto: 'Pluto',
};
// Pluto (v0.15.0) - stylizovaná barva/velikost jako u PLANET_VISUALS výš,
// menší než všechny opravdové planety (trpasličí planeta, ~1/6 průměru
// Země ve skutečnosti - tady jen "nejmenší tečka v sadě", ne přesný poměr).
const PLUTO_VISUAL = { color: 0xcbb89d, radius: 0.022 };
// Pás asteroidů (v0.15.0) - čistě dekorativní statický oblak bodů mezi
// drahou Marsu a Jupiteru, NE simulace jednotlivých těles na vlastních
// drahách (to by u tisíců bodů bylo zbytečně nákladné a vizuálně
// nerozeznatelné od statického oblaku). Skutečný pás má vertikální
// "tloušťku" jen zlomek AU, ale na tomhle měřítku by byl neviditelně
// tenký - `ASTEROID_BELT_HEIGHT` je stylizovaně zvětšená, ať je z pásu
// vidět, že je to mrak, ne dokonalý plochý kruh.
const ASTEROID_BELT_COUNT = 900;
const ASTEROID_BELT_HEIGHT = 0.12;
const ASTEROID_BELT_COLOR = 0x9a9a92;
// Měsíc jako mini-model u Země (v0.14.0) - skutečná vzdálenost Měsíce
// (0.00257 AU) by na tomhle měřítku (Merkur už na 1.0) byla pod rozlišením
// jednoho pixelu, takže stylizovaná (ne astronomicky přesná) vzdálenost od
// středu Země - dost velká, aby vyčnívala za zvýrazňovací halo Země
// (`visual.radius * 5` = 0.275, viz `_initSolarScene`), dost malá, aby
// bylo jasné, že patří k Zemi, ne že je to samostatná planeta.
const MOON_VISUAL_RADIUS = 0.018;
const MOON_ORBIT_VISUAL_RADIUS = 0.32;
const MOON_VISUAL_COLOR = 0xbfbfbf;
// Pomalá plynulá rotace kamery kolem Slunce v tomto pohledu (rad/s) - čistě
// dekorativní "živý" pocit, ne interaktivní ovládání (na rozdíl od glóbusu
// tenhle pohled zatím nejde ručně otáčet, viz poznámka u v0.9.0).
const SOLAR_CAMERA_ORBIT_SPEED = (2 * Math.PI) / 90; // 1 otočka za 90 s
const SOLAR_CAMERA_ELEVATION = degToRad(32);
// Ruční otáčení v pohledu sluneční soustavy (v0.10.0) - na rozdíl od
// trackballu u glóbusu je tohle klasická orbitální kamera dívající se na
// pevný bod (Slunce, resp. vybraná planeta - viz _solarFocusPoint), takže
// tu žádný gimbal-lock/pól problém není: stačí azimut+elevace jako dva
// jednoduché offsety navrch pořád běžící pomalé auto-orbity
// (`t * SOLAR_CAMERA_ORBIT_SPEED`), stejný princip jako u prvotní (v0.5.0)
// verze rotace glóbu. Elevace se čistě kvůli čitelnosti scény klampuje, ať
// kamera nezaletí pod/nad rovinu ekliptiky tak, že by se všechny dráhy
// zdegenerovaly do čáry.
const SOLAR_DRAG_SENS_AZ = 0.012;
const SOLAR_DRAG_SENS_EL = 0.008;
const SOLAR_EL_MIN = degToRad(8);
const SOLAR_EL_MAX = degToRad(85);
// Klik (ne tažení) na planetu v solar view ji "vybere" - viz
// _selectSolarPlanet()/_raycastSolarPlanetAt(). Pohyb menší než tenhle práh
// (v px) se považuje za klik, větší za tažení - běžná tap-vs-drag heuristika.
const SOLAR_CLICK_MAX_MOVE_PX = 6;
// Jak plynule kamera "doletí" na nově vybraný cíl (frame-rate nezávislá
// exponenciální aproximace, stejný princip jako MANUAL_RETURN_TIME_CONSTANT).
const SOLAR_FOCUS_TIME_CONSTANT = 0.45;
// Cílová vzdálenost kamery od vybrané planety = její vizuální poloměr (viz
// PLANET_VISUALS) krát tenhle násobek - dost blízko na "zoom", ale ne tak
// blízko, aby planeta zaplnila celý záběr/oříznula se do kamery.
const SOLAR_FOCUS_DIST_FACTOR = 7;
const SOLAR_FOCUS_MIN_DIST = 0.45;
// Sdílený referenční bod "beze změny" (Slunce, počátek scény) pro
// _solarFocusPoint, když není vybraná žádná planeta - nikdy se nemutuje.
const SOLAR_ORIGIN = new THREE.Vector3(0, 0, 0);

// Časová animace v solar view (v0.11.0) - tlačítko "přehrát" cykluje mezi
// těmito přednastavenými rychlostmi (dny simulovaného času za 1 skutečnou
// sekundu), vždy dopředu v čase. Dost širokí rozsah, aby šlo sledovat jak
// rychlý oběh Merkuru (88 dní), tak pomalý Neptun (165 let) v rozumném čase.
const SOLAR_TIME_SPEED_PRESETS_DAYS_PER_SEC = [1, 7, 30, 365];
const SOLAR_TIME_SPEED_LABELS = { 1: '1 den/s', 7: '1 týd/s', 30: '1 měs/s', 365: '1 rok/s' };
const MS_PER_DAY = 86400000;

const DEFAULT_CONFIG = {
  type: 'custom:astronomical-globe-card',
  title: '',
  location_source: 'home', // 'home' | 'entity'
  entity: '',
  quality: 'medium',
  show_clouds: true,
  show_moon: true,
  show_sun_marker: true,
  show_stars: true,
  show_countdown: true,
  show_day_length: true,
  rotation_wobble: true,
  manual_rotation: true,
  celestial_reveal: true,
  accent_color: '',
  // -- vzhled/barevnost - všechno níž má svůj posuvník ve vizuálním editoru
  brightness: 1.35, // jas/exposure - hlavně světla měst v noci
  night_ambient: 1.0, // síla modrého "earthshine" podsvícení nočního oceánu
  saturation: 1.6, // celková sytost barev
  contrast: 0.28, // síla S-křivkového kontrastu (0 = beze změny)
  twilight_strength: 0.34, // síla teplé soumrakové záře podél terminátoru
  cloud_opacity: 0.4, // krytí mraků
  atmosphere_intensity: 1.0, // síla modré atmosférické záře na okraji
  sky_intensity: 1.0, // jas hvězd a mlhoviny v pozadí
  marker_size: 0.1, // velikost GPS značky domovské/sledované polohy
};

// ---------------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------------

function degToRad(d) {
  return (d * Math.PI) / 180;
}

/**
 * Převod geografických souřadnic na 3D vektor odpovídající standardnímu
 * UV mapování THREE.SphereGeometry s equirektangulární texturou
 * (u=0 na lon=-180°, u=1 na lon=+180°, v=0 na severním pólu).
 */
function geoToVector3(lat, lon, radius = 1) {
  const latR = degToRad(lat);
  const lonR = degToRad(lon);
  const x = radius * Math.cos(latR) * Math.cos(lonR);
  const y = radius * Math.sin(latR);
  const z = -radius * Math.cos(latR) * Math.sin(lonR);
  return new THREE.Vector3(x, y, z);
}

/** Trojúhelníková váha 0..1 s vrcholem 1 v `peak`, lineárně klesající na 0
 * ve vzdálenosti `halfWidth` na obě strany. Používá se pro plynulé
 * "doznívání" náklonu kamery ke Slunci/Měsíci u obzoru (viz
 * `_applyCelestialReveal`), ať se síla efektu nemění skokem. */
function triangleWeight(value, peak, halfWidth) {
  const d = Math.abs(value - peak);
  if (d >= halfWidth) return 0;
  return 1 - d / halfWidth;
}

// 1 AU v km (definice IAU, ne zaokrouhleno) - pro info panel v solar view
// (v0.11.0), aby vzdálenosti šly zobrazit lidsky čitelně v obou jednotkách.
const KM_PER_AU = 149597870.7;

function formatAU(distanceAU) {
  const km = distanceAU * KM_PER_AU;
  const kmText = km >= 1e6 ? `${(km / 1e6).toFixed(1)} mil. km` : `${Math.round(km)} km`;
  const auText = distanceAU.toFixed(distanceAU < 10 ? 2 : 1);
  return `${auText} AU (${kmText})`;
}

// -- Konjunkce/opozice text v info panelu solar view (v0.12.0) ------------
// Merkur a Venuše obíhají BLÍŽ Slunci než Země ("dolní" planety) - mají
// dva druhy konjunkce (mezi Zemí a Sluncem / za Sluncem), ale nikdy
// opozici (nikdy nemůžou být na obloze přesně naproti Slunci). Ostatní
// ("horní") planety mají naopak jen jeden typ konjunkce (za Sluncem) a k
// tomu opozici (Země mezi Sluncem a planetou - nejlepší čas k pozorování).
const SOLAR_INFERIOR_PLANETS = new Set(['mercury', 'venus']);
const SOLAR_CONJUNCTION_THRESHOLD_DEG = 6;
const SOLAR_OPPOSITION_THRESHOLD_DEG = 6;

/**
 * Elongace (úhel Slunce-Země-planeta, 0-180°) a geocentrická ekliptikální
 * délka planety MÍNUS Slunce (kladná = planeta východně od Slunce =
 * "večernice", vidět večer po západu; záporná = západně = "jitřenka",
 * vidět ráno před východem - standardní astronomická konvence, ekliptikální
 * délka roste ve směru oběžného pohybu). Ignoruje sklon drah k ekliptice
 * (z-složku) - u elongace/délky na pár stupňů přesnosti zanedbatelná chyba,
 * naprosto dostatečná pro popisný text, ne přesné efemeridy.
 */
function computeElongation(p, earth) {
  const vx = p.x - earth.x, vy = p.y - earth.y, vz = p.z - earth.z;
  const sx = -earth.x, sy = -earth.y, sz = -earth.z; // Země -> Slunce (Slunce je v počátku)
  const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
  const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
  const cosElong = (vx * sx + vy * sy + vz * sz) / (vLen * sLen);
  const elongationDeg = Math.acos(Math.max(-1, Math.min(1, cosElong))) * (180 / Math.PI);

  const sunGeoLon = Math.atan2(sy, sx) * (180 / Math.PI);
  const planetGeoLon = Math.atan2(vy, vx) * (180 / Math.PI);
  let diffLon = planetGeoLon - sunGeoLon;
  diffLon = ((diffLon + 180) % 360 + 360) % 360 - 180; // normalizace do (-180, 180]

  return { elongationDeg, diffLon, distToEarthAU: vLen };
}

/** Popisný text k aktuální poloze planety vůči Slunci a Zemi - viz
 * komentář u SOLAR_INFERIOR_PLANETS/computeElongation výš. */
function describeSolarAlignment(key, elong, earthDistanceAU) {
  const isInferior = SOLAR_INFERIOR_PLANETS.has(key);

  if (elong.elongationDeg < SOLAR_CONJUNCTION_THRESHOLD_DEG) {
    if (isInferior) {
      return elong.distToEarthAU < earthDistanceAU
        ? 'dolní konjunkce (mezi Zemí a Sluncem)'
        : 'horní konjunkce (za Sluncem)';
    }
    return 'konjunkce se Sluncem - teď špatně pozorovatelný';
  }
  if (!isInferior && 180 - elong.elongationDeg < SOLAR_OPPOSITION_THRESHOLD_DEG) {
    return 'opozice - ideální čas k pozorování, na obloze celou noc';
  }
  const side = elong.diffLon > 0 ? 'večer po západu Slunce' : 'ráno před východem Slunce';
  return `${Math.round(elong.elongationDeg)}° od Slunce - viditelný ${side}`;
}

// -- "Co je dnes vidět ze Země" v info panelu solar view (v0.13.0) --------
const COMPASS_LABELS_CS = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];

/** Azimut (0-360°, 0=sever) -> nejbližší z 8 světových stran česky. */
function compassLabel(azimuthDeg) {
  const idx = Math.round(azimuthDeg / 45) % 8;
  return COMPASS_LABELS_CS[idx];
}

/** Popisný text k tomu, jestli/kde je planeta právě vidět z domovské
 * polohy - `isNight` je `null`, když domovská poloha není nastavená
 * (viz `_isNightAtHome`). */
function describeVisibility(altitudeDeg, azimuthDeg, isNight) {
  if (altitudeDeg <= 0) return 'pod obzorem';
  const altText = `${Math.round(altitudeDeg)}° nad obzorem (${compassLabel(azimuthDeg)})`;
  if (isNight === null) return altText;
  return isNight ? `${altText} - viditelný teď` : `${altText}, ale zatím denní světlo`;
}

function formatDuration(hoursFloat) {
  const totalMinutes = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${m} min`;
}

function getLocale(hass) {
  return (hass && hass.locale && hass.locale.language) || navigator.language || 'cs';
}

function uses24h(hass) {
  const fmt = hass && hass.locale && hass.locale.time_format;
  if (fmt === '12') return false;
  if (fmt === '24') return true;
  return true; // rozumný default pro CZ prostředí
}

function makeGlowSpriteTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 244, 214, 0.9)');
  gradient.addColorStop(0.18, 'rgba(255, 220, 150, 0.55)');
  gradient.addColorStop(0.5, 'rgba(255, 180, 90, 0.16)');
  gradient.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  // Canvas 2D barvy jsou sRGB - použité v built-in SpriteMaterial, který
  // (na rozdíl od našich vlastních ShaderMaterial) automaticky dělá
  // sRGB<->lineární zpětný převod na výstupu. Bez tohoto štítku by ta
  // automatika dostala nesprávný vstup a záře by vycházela vymytá/mlhavá.
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Malé, ostré, téměř bílé jádro slunečního záblesku (pro sunSprite). */
function makeSunCoreTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 250, 1)');
  gradient.addColorStop(0.12, 'rgba(255, 250, 230, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 235, 180, 0.6)');
  gradient.addColorStop(1, 'rgba(255, 220, 150, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; // viz poznámka u makeGlowSpriteTexture
  return tex;
}

function makeMarkerTexture(color) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; // viz poznámka u makeGlowSpriteTexture
  return tex;
}

// ---------------------------------------------------------------------------
// Hlavní karta
// ---------------------------------------------------------------------------

class AstronomicalGlobeCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('astronomical-globe-card-editor');
  }

  static getStubConfig() {
    return { ...DEFAULT_CONFIG };
  }

  setConfig(config) {
    if (!config) {
      throw new Error('Neplatná konfigurace karty.');
    }
    if (config.location_source === 'entity' && !config.entity) {
      throw new Error('Při location_source: entity je nutné nastavit entity.');
    }
    const prevQuality = this._config ? this._config.quality : null;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._configError = null;

    if (this._built && prevQuality !== this._config.quality) {
      this._reloadTextures();
    }
    this._renderStaticParts();
  }

  getCardSize() {
    return 6;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) {
      this._build();
    }
    this._updateFromHass();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (this._disposed) {
      // karta byla odpojena z DOM a uvolněna, ale element je znovu použit
      // (např. reorganizace masonry layoutu) - postavit scénu znovu od nuly
      this._built = false;
      this._disposed = false;
      if (this._hass) this._build();
      return;
    }
    if (this._built) {
      this._startLoop();
    }
  }

  disconnectedCallback() {
    this._stopLoop();
    this._dispose();
  }

  /** Uvolní three.js zdroje (geometrie/materiály/textury/renderer/WebGL kontext). */
  _dispose() {
    if (this._disposed || !this._scene) return;
    this._disposed = true;

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    const disposeObj = (obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((mat) => {
        if (!mat) return;
        Object.values(mat).forEach((val) => {
          if (val && val.isTexture) val.dispose();
        });
        mat.dispose();
      });
    };
    this._scene.traverse(disposeObj);
    // Scéna "sluneční soustava" (viz _initSolarScene) používá stejný
    // renderer/canvas, ale je to samostatný Scene graf - bez tohohle by
    // její geometrie/materiály/textury (Slunce glow sprity) unikaly paměť
    // při každém _dispose()+_build() cyklu (reorganizace layoutu, viz
    // poznámka u attachShadow v connectedCallback()).
    if (this._solarScene) this._solarScene.traverse(disposeObj);

    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.forceContextLoss();
      this._renderer = null;
    }
  }

  // -- Stavba DOM + three.js scény ------------------------------------------

  _build() {
    this._built = true;

    // POZOR: attachShadow() lze na elementu zavolat jen JEDNOU za celý jeho
    // život (DOM spec) - podruhé vyhodí "already hosts a shadow tree" a
    // volání skončí ještě PŘED _initThree()/_loadTextures(), takže se
    // glóbus už nikdy nepostaví. Home Assistant přitom stejnou instanci
    // elementu běžně znovu použije (disconnect+reconnect) při reorganizaci
    // masonry/sections layoutu - typicky právě při přepnutí do edit módu
    // dashboardu. connectedCallback() proto po dispose() volá _build()
    // znovu na TÉMŽ elementu, který už shadow root má → bez téhle
    // podmínky by druhá stavba tiše/neviditelně selhala a karta by zůstala
    // se starým, už uvolněným (disposed) plátnem bez obrázku. Řešení: shadow
    // root vytvořit jen když ještě neexistuje, jinak jen přepsat jeho obsah.
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <ha-card>
        <div class="agc-root">
          <div class="agc-title"></div>
          <div class="agc-stage">
            <canvas class="agc-canvas"></canvas>
            <div class="agc-overlay-top">
              <div class="agc-date"></div>
              <div class="agc-time"></div>
            </div>
            <div class="agc-view-controls">
              <button type="button" class="agc-btn agc-btn-solar" title="Zobrazit sluneční soustavu" aria-label="Zobrazit sluneční soustavu" aria-pressed="false">
                <svg class="agc-icon-solar-on" viewBox="0 0 24 24" width="16" height="16">
                  <circle cx="12" cy="12" r="2.6" fill="currentColor"/>
                  <ellipse cx="12" cy="12" rx="9" ry="4.4" fill="none" stroke="currentColor" stroke-width="1.4"/>
                  <circle cx="20.3" cy="12" r="1.6" fill="currentColor"/>
                </svg>
                <svg class="agc-icon-solar-off" viewBox="0 0 24 24" width="16" height="16" hidden>
                  <path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button type="button" class="agc-btn agc-btn-reset" title="Vrátit pohled na domovskou polohu" aria-label="Vrátit pohled na domovskou polohu">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
                  <line x1="12" y1="1" x2="12" y2="5" stroke="currentColor" stroke-width="2"/>
                  <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2"/>
                  <line x1="1" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2"/>
                  <line x1="19" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/>
                </svg>
              </button>
              <button type="button" class="agc-btn agc-btn-lock" title="Zastavit automatický návrat pohledu" aria-label="Zastavit automatický návrat pohledu" aria-pressed="false">
                <svg class="agc-icon-unlocked" viewBox="0 0 24 24" width="16" height="16">
                  <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
                  <path d="M8 11V7a4 4 0 0 1 7.2-2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <svg class="agc-icon-locked" viewBox="0 0 24 24" width="16" height="16" hidden>
                  <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="agc-corner agc-corner-bl" title="Fáze Měsíce">
              <canvas class="agc-moon-icon" width="44" height="44"></canvas>
            </div>
            <div class="agc-corner agc-corner-br" title="Poloha na oběžné dráze">
              <svg class="agc-orbit-icon" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
                <circle class="agc-orbit-sun" cx="22" cy="22" r="3.4" fill="#ffcf6b"/>
                <circle class="agc-orbit-earth" cx="22" cy="4" r="2.6" fill="#5aa9ff"/>
              </svg>
            </div>
            <div class="agc-overlay-bottom">
              <div class="agc-row agc-countdown"></div>
              <div class="agc-row agc-daylength"></div>
            </div>
            <div class="agc-solar-info" hidden>
              <button type="button" class="agc-solar-info-close" aria-label="Zavřít detail planety">✕</button>
              <div class="agc-solar-info-name"></div>
              <div class="agc-solar-info-row agc-solar-info-sun"></div>
              <div class="agc-solar-info-row agc-solar-info-earth"></div>
              <div class="agc-solar-info-row agc-solar-info-align"></div>
              <div class="agc-solar-info-row agc-solar-info-visibility"></div>
            </div>
            <div class="agc-solar-time" style="display:none">
              <button type="button" class="agc-btn agc-solar-time-play" title="Přehrát časovou animaci" aria-label="Přehrát časovou animaci" aria-pressed="false">
                <svg class="agc-icon-time-play" viewBox="0 0 24 24" width="14" height="14">
                  <path d="M6 4 L20 12 L6 20 Z" fill="currentColor"/>
                </svg>
                <svg class="agc-icon-time-pause" viewBox="0 0 24 24" width="14" height="14" hidden>
                  <rect x="5" y="4" width="5" height="16" fill="currentColor"/>
                  <rect x="14" y="4" width="5" height="16" fill="currentColor"/>
                </svg>
              </button>
              <button type="button" class="agc-solar-time-speed" title="Rychlost časové animace (klikni pro změnu)"></button>
              <div class="agc-solar-time-label"></div>
              <button type="button" class="agc-solar-time-today" title="Zpět na dnešek" style="display:none">Dnes</button>
            </div>
            <div class="agc-error" hidden></div>
          </div>
        </div>
      </ha-card>
    `;

    this._els = {
      title: this.shadowRoot.querySelector('.agc-title'),
      stage: this.shadowRoot.querySelector('.agc-stage'),
      canvas: this.shadowRoot.querySelector('.agc-canvas'),
      date: this.shadowRoot.querySelector('.agc-date'),
      time: this.shadowRoot.querySelector('.agc-time'),
      countdown: this.shadowRoot.querySelector('.agc-countdown'),
      daylength: this.shadowRoot.querySelector('.agc-daylength'),
      moonIcon: this.shadowRoot.querySelector('.agc-moon-icon'),
      orbitEarth: this.shadowRoot.querySelector('.agc-orbit-earth'),
      error: this.shadowRoot.querySelector('.agc-error'),
      viewControls: this.shadowRoot.querySelector('.agc-view-controls'),
      resetBtn: this.shadowRoot.querySelector('.agc-btn-reset'),
      lockBtn: this.shadowRoot.querySelector('.agc-btn-lock'),
      lockIconUnlocked: this.shadowRoot.querySelector('.agc-icon-unlocked'),
      lockIconLocked: this.shadowRoot.querySelector('.agc-icon-locked'),
      solarBtn: this.shadowRoot.querySelector('.agc-btn-solar'),
      solarIconOn: this.shadowRoot.querySelector('.agc-icon-solar-on'),
      solarIconOff: this.shadowRoot.querySelector('.agc-icon-solar-off'),
      overlayBottom: this.shadowRoot.querySelector('.agc-overlay-bottom'),
      cornerBl: this.shadowRoot.querySelector('.agc-corner-bl'),
      cornerBr: this.shadowRoot.querySelector('.agc-corner-br'),
      solarInfo: this.shadowRoot.querySelector('.agc-solar-info'),
      solarInfoClose: this.shadowRoot.querySelector('.agc-solar-info-close'),
      solarInfoName: this.shadowRoot.querySelector('.agc-solar-info-name'),
      solarInfoSun: this.shadowRoot.querySelector('.agc-solar-info-sun'),
      solarInfoEarth: this.shadowRoot.querySelector('.agc-solar-info-earth'),
      solarInfoAlign: this.shadowRoot.querySelector('.agc-solar-info-align'),
      solarInfoVisibility: this.shadowRoot.querySelector('.agc-solar-info-visibility'),
      solarTimeBar: this.shadowRoot.querySelector('.agc-solar-time'),
      solarTimePlay: this.shadowRoot.querySelector('.agc-solar-time-play'),
      solarTimeIconPlay: this.shadowRoot.querySelector('.agc-icon-time-play'),
      solarTimeIconPause: this.shadowRoot.querySelector('.agc-icon-time-pause'),
      solarTimeSpeed: this.shadowRoot.querySelector('.agc-solar-time-speed'),
      solarTimeLabel: this.shadowRoot.querySelector('.agc-solar-time-label'),
      solarTimeToday: this.shadowRoot.querySelector('.agc-solar-time-today'),
    };

    this._clock = new THREE.Clock();
    this._wobbleSeed = Math.random() * 1000;
    this._bindDragRotation();
    this._bindViewControls();
    this._bindSolarTimeControls();
    if (this._els.solarInfoClose) {
      // Křížek v info panelu = stejná akce jako klik na už vybranou planetu
      // (odvybrat) - viz _selectSolarPlanet().
      this._els.solarInfoClose.addEventListener('click', (ev) => {
        ev.preventDefault();
        this._selectSolarPlanet(null);
      });
    }

    try {
      this._initThree();
      this._initSolarScene();
    } catch (err) {
      // Selhání WebGL inicializace (chybí podpora, vyčerpaný kontext apod.)
      // dřív skončilo tichou prázdnou kartou - teď je vidět proč.
      console.error('[astronomical-globe-card] Inicializace 3D vykreslování selhala:', err);
      this._els.error.hidden = false;
      this._els.error.textContent =
        'Nepodařilo se inicializovat 3D vykreslování (WebGL). Zkus obnovit stránku (Ctrl+Shift+R).';
      return;
    }
    this._viewMode = 'globe';
    this._renderStaticParts();
    this._loadTextures();

    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this._els.stage);
    this._onResize();

    this._startLoop();
  }

  /**
   * Ruční otáčení glóbem tažením myší/prstem (config `manual_rotation`).
   *
   * TRACKBALL/ARCBALL, ne az/el kolem pevné svislé osy: stav je jeden
   * akumulovaný kvaternion `_manualQuat` (volná 3D orientace, "jako když
   * fyzicky točíš balónkem v ruce"), ne dvě samostatná čísla
   * azimut+elevace. Předchozí az/el přístup (v0.5.x) měl vestavěný limit -
   * u pólu se svislá referenční osa protíná se směrem pohledu (gimbal
   * lock), takže muselo existovat umělé omezení naklonění, jinak kamera při
   * delším tažení "přeskočila" přes pól na druhou stranu (viz stará
   * poznámka k v0.5.2 - klamp na [8°,172°] to jen omezoval, neřešil).
   * Kvaternion žádnou takovou pevnou referenční osu nemá - každý krok
   * tažení se otáčí kolem AKTUÁLNÍCH (právě otočených) os "nahoru"/"doprava"
   * odvozených z `_manualQuat` samotného, ne kolem pevné globální osy Y, a
   * skládá se s dosavadní orientací násobením kvaternionů. Žádný pól tu
   * proto neexistuje - otáčení je ve všech směrech doslova nekonečné a nikdy
   * neflipne, přesně jako fyzický glóbus v ruce.
   *
   * `_frame()` pak tímhle kvaternionem otočí jak směr kamery, tak vektor
   * "nahoru" (`camera.up`) - musí se otáčet OBA stejně, jinak by se stejný
   * gimbal problém jen přesunul do `camera.lookAt()`.
   */
  _bindDragRotation() {
    const el = this._els.canvas;
    this._manualQuat = new THREE.Quaternion();
    this._dragging = false;
    this._dragLastX = 0;
    this._dragLastY = 0;
    this._lastInteractionT = 0;
    // ID pointeru, který právě "drží" rotaci - viz onPointerDown/onPointerMove
    // níž, řeší chaos při dvouprstém dotyku (pinch).
    this._activePointerId = null;
    // "globe" (kvaternion/trackball, viz výše) nebo "solar" (jednoduchý
    // az/el offset, viz _solarAzOffset/_solarElOffset a _frameSolar) - které
    // tažení právě probíhá se rozhoduje při stisku podle `_viewMode` a musí
    // se tak i dokončit, i kdyby uživatel mezitím tlačítkem přepnul pohled.
    this._dragMode = null;
    // Souhrnný posun (v px) od stisku - odlišuje krátký KLIK (výběr planety
    // v solar view, viz SOLAR_CLICK_MAX_MOVE_PX) od skutečného tažení.
    this._dragTotalMove = 0;
    this._solarAzOffset = 0;
    this._solarElOffset = 0;

    // rad/px - horizontální tažení citlivější než vertikální (odpovídá tomu,
    // že otáčení kolem svislé osy působí přirozeněji než naklápění pólů).
    const SENS_AZ = 0.012;
    const SENS_EL = 0.008;

    const onPointerDown = (ev) => {
      const solar = this._viewMode === 'solar';
      // V solar view tažení/klik funguje vždy (není to konfigurovatelné jako
      // `manual_rotation` u glóbusu - žádný pól/gimbal problém tu nehrozí a
      // klik na planetu je zároveň hlavní způsob interakce s tímhle pohledem).
      if (!solar && !this._config.manual_rotation) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      // SKUTEČNÁ PŘÍČINA "zbláznění" při dotyku druhým prstem (pinch): Pointer
      // Events API posílá SAMOSTATNÝ pointerdown pro KAŽDÝ prst (různé
      // pointerId), a kód dřív žádný z nich nerozlišoval - druhý prst prostě
      // přepsal _dragLastX/Y na svoje souřadnice a "ukradl" rozjeté tažení.
      // Pak oba prsty střídavě posílaly pointermove, každý počítaný jako
      // delta od POSLEDNÍHO (libovolného) prstu - odtud ty nesmyslné skoky,
      // ne skutečný pokus o zoom samotný. Řešení: jakmile jednou tažení drží
      // konkrétní pointerId, každý DALŠÍ pointerdown (druhý/třetí prst) se
      // úplně ignoruje, dokud se ten první nepustí - druhý prst tak nemá na
      // rotaci žádný vliv (ani chaos, ani vlastní zoom - proto to zároveň
      // funguje jako "zablokování" pinch-to-zoom, který `touch-action: none`
      // na canvasu stejně už brání dělat prohlížeči/OS na úrovni stránky).
      if (this._dragging) return;
      this._dragging = true;
      this._dragMode = solar ? 'solar' : 'globe';
      this._dragTotalMove = 0;
      this._activePointerId = ev.pointerId;
      // Chycení glóbu rukou vždy zruší čekající požadavek na reset (tlačítko
      // "vrátit domů") - jinak by po puštění mohl přijít neočekávaný skok
      // zpět i uprostřed nového tažení.
      this._resetRequested = false;
      this._dragLastX = ev.clientX;
      this._dragLastY = ev.clientY;
      el.classList.add('agc-dragging');
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    };
    const onPointerMove = (ev) => {
      if (!this._dragging || ev.pointerId !== this._activePointerId) return;
      const dx = ev.clientX - this._dragLastX;
      const dy = ev.clientY - this._dragLastY;
      this._dragLastX = ev.clientX;
      this._dragLastY = ev.clientY;
      this._dragTotalMove += Math.hypot(dx, dy);

      if (this._dragMode === 'solar') {
        // Klasická orbitální kamera (viz konstanty u SOLAR_CAMERA_ORBIT_SPEED
        // výš) - žádný trackball/kvaternion tu není potřeba, protože se vždy
        // dívá na pevný bod (Slunce nebo vybraná planeta), takže nehrozí
        // gimbal lock ani "flip" u pólu jako u glóbusu. Znaménko azimutu
        // stejné jako u glóbusu (přirozený pocit "otoč rukou"), elevace se
        // rovnou klampuje při tažení (ne až při vykreslení), ať dragování
        // dál stejným směrem po dosažení limitu nevytváří mrtvou zónu, než
        // se to při obrácení směru zase "rozjede".
        this._solarAzOffset -= dx * SOLAR_DRAG_SENS_AZ;
        const desiredEl = SOLAR_CAMERA_ELEVATION + this._solarElOffset - dy * SOLAR_DRAG_SENS_EL;
        const clampedEl = Math.max(SOLAR_EL_MIN, Math.min(SOLAR_EL_MAX, desiredEl));
        this._solarElOffset = clampedEl - SOLAR_CAMERA_ELEVATION;
        this._lastInteractionT = this._clock.getElapsedTime();
        return;
      }

      // Osy tažení odvozené z AKTUÁLNÍ (dosavadní) orientace, ne z pevné
      // globální osy Y - tohle je to jediné, co v arcballu nahrazuje starý
      // az/el přístup, a přesně díky tomu tu není žádný pól ani gimbal lock.
      //
      // POZOR (nejde jen tak vzít kanonickou osu X pro "right0"): musí to
      // být vektor KOLMÝ na počáteční směr pohledu (`camDir0` = domovská
      // poloha), jinak sklápění netočí po hlavní kružnici procházející
      // aktuálním pohledem, ale po nějaké jiné, náhodné - naklápění pak
      // vypadá "vratce"/nerovnoměrně a při dlouhém tažení jedním směrem se
      // to zacyklí místo plynulého postupu (ověřeno testem, viz [[v0.7.0]]
      // poznámka výše). `cross(worldUp, camDir0)` je z definice kolmý na
      // camDir0 - a protože kvaternion je RIGIDNÍ rotace (zachovává úhly
      // mezi vektory), zůstává `currentRight` kolmý na aktuální `camDir`
      // navždy, bez ohledu na to, kolik se toho už natočilo.
      const camDir0 = this._location
        ? geoToVector3(this._location.lat, this._location.lon, 1)
        : new THREE.Vector3(0, 0, 1);
      const worldUp = new THREE.Vector3(0, 1, 0);
      const right0 = new THREE.Vector3().crossVectors(worldUp, camDir0).normalize();

      const currentUp = worldUp.applyQuaternion(this._manualQuat);
      const currentRight = right0.applyQuaternion(this._manualQuat);

      // Stejná znaménka jako dřív u az/el (viz oprava "inverzní" osy v0.5.1) -
      // tažení doprava/nahoru se má chovat úplně stejně jako předtím,
      // jen bez pólu jako umělé hranice.
      const yawAngle = -dx * SENS_AZ;
      const pitchAngle = -dy * SENS_EL;

      const qYaw = new THREE.Quaternion().setFromAxisAngle(currentUp, yawAngle);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(currentRight, pitchAngle);
      // Přírůstek této jedné pointermove události se skládá s dosavadní
      // orientací PREmultiply (v "aktuálním" prostoru, ne v prostoru, jaké
      // bylo na startu tažení) - proto se to chová jako otáčení fyzického
      // předmětu v ruce: 1:1 odezva na gesto, bez ohledu na to, jak moc je
      // glóbus už předtím pootočený.
      this._manualQuat.premultiply(qYaw).premultiply(qPitch);
      // Opakované násobení kvaternionů (klidně tisíce za jedno delší tažení)
      // se floating-point chybou pomalu vzdaluje od jednotkové délky - v
      // praxi neznatelně málo (ověřeno: ~1e-6 po 1600 krocích), ale
      // normalizace je zadarmo a časem/hodně dlouhým používáním karty by se
      // to jinak mohlo hromadit. Standardní obranná praxe pro akumulované
      // rotace, ne řešení konkrétního pozorovaného problému.
      this._manualQuat.normalize();

      this._lastInteractionT = this._clock.getElapsedTime();
    };
    const endDrag = (ev) => {
      // Pozvednutí/zrušení DRUHÉHO (ignorovaného) prstu nesmí ukončit
      // tažení prvního - ten pořád může tisknout dál.
      if (!this._dragging || ev.pointerId !== this._activePointerId) return;
      const wasClick = this._dragMode === 'solar' && this._dragTotalMove <= SOLAR_CLICK_MAX_MOVE_PX;
      this._dragging = false;
      this._activePointerId = null;
      this._lastInteractionT = this._clock.getElapsedTime();
      el.classList.remove('agc-dragging');
      try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      // Skoro-žádný pohyb mezi stiskem a puštěním v solar view = klik na
      // planetu (výběr), ne tažení kamery - viz _handleSolarClick().
      if (wasClick) this._handleSolarClick(ev.clientX, ev.clientY);
      this._dragMode = null;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    // POZOR: element (canvas) se při _build() vždy vytváří znovu (nový
    // `shadowRoot.innerHTML`), takže staré listenery zaniknou spolu s ním -
    // explicitní cleanup tu není nutný, ale referenci schováme pro pořádek.
    this._dragUnbind = () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
    };
  }

  /**
   * Tlačítka "vrátit pohled domů" a "zamknout/odemknout automatický návrat"
   * (obě jen viditelná, když je `manual_rotation` zapnuté - viz
   * `_renderStaticParts()`). `_autoReturnEnabled` řídí, jestli po nečinnosti
   * proběhne automatický návrat (`MANUAL_IDLE_TIMEOUT` v `_frame()`);
   * `_resetRequested` vynutí stejnou plynulou animaci návratu OKAMŽITĚ,
   * bez ohledu na to, jestli je automatický návrat zamknutý.
   */
  _bindViewControls() {
    const resetBtn = this._els.resetBtn;
    const lockBtn = this._els.lockBtn;
    this._autoReturnEnabled = true;
    this._resetRequested = false;

    const onReset = (ev) => {
      ev.preventDefault();
      // "Beze změny" pozná se u kvaternionu podle w blízkého 1 (viz stejná
      // kontrola v _frame()) - není co vracet, nenechat "viset" požadavek,
      // který by se jinak spustil až při příštím náhodném natočení (viz
      // komentář u onPointerDown o čištění _resetRequested).
      if (Math.abs(this._manualQuat.w) >= 1 - 1e-9) {
        this._resetRequested = false;
        return;
      }
      this._resetRequested = true;
      this._lastInteractionT = this._clock.getElapsedTime();
    };
    const onLockToggle = (ev) => {
      ev.preventDefault();
      this._autoReturnEnabled = !this._autoReturnEnabled;
      const locked = !this._autoReturnEnabled;
      lockBtn.classList.toggle('agc-btn-active', locked);
      lockBtn.setAttribute('aria-pressed', String(locked));
      lockBtn.title = locked
        ? 'Automatický návrat pohledu je zastavený - klikni pro zapnutí zpět'
        : 'Zastavit automatický návrat pohledu';
      if (this._els.lockIconUnlocked) this._els.lockIconUnlocked.hidden = locked;
      if (this._els.lockIconLocked) this._els.lockIconLocked.hidden = !locked;
    };

    resetBtn.addEventListener('click', onReset);
    lockBtn.addEventListener('click', onLockToggle);

    // -- Přepínač pohledu "glóbus" / "sluneční soustava" --------------------
    const solarBtn = this._els.solarBtn;
    const onSolarToggle = (ev) => {
      ev.preventDefault();
      this.setViewMode(this._viewMode === 'solar' ? 'globe' : 'solar');
    };
    solarBtn.addEventListener('click', onSolarToggle);

    this._viewControlsUnbind = () => {
      resetBtn.removeEventListener('click', onReset);
      lockBtn.removeEventListener('click', onLockToggle);
      solarBtn.removeEventListener('click', onSolarToggle);
    };
  }

  /**
   * Časová animace v solar view (v0.11.0) - `.agc-solar-time` lišta dole.
   * `_solarSimTime` (Date | null) a `_solarTimeSpeed` (dny simulovaného
   * času za skutečnou sekundu, 0 = pauza) jsou jediný zdroj pravdy:
   * `null`/`0` = normální živé sledování reálného "teď" (beze změny oproti
   * v0.9.0, aktualizuje se 1×/s v `_updateUiText`); jakmile se nastaví
   * nenulová rychlost, `_frameSolar()` (ne `_updateUiText`) přebírá
   * aktualizaci pozic KAŽDÝ SNÍMEK, ať animace neškube.
   */
  _bindSolarTimeControls() {
    const playBtn = this._els.solarTimePlay;
    const speedBtn = this._els.solarTimeSpeed;
    const todayBtn = this._els.solarTimeToday;
    if (!playBtn || !speedBtn || !todayBtn) return;

    this._solarSimTime = null;
    this._solarTimeSpeed = 0;
    this._solarTimeSpeedPresetIdx = 0;

    const onPlayToggle = (ev) => {
      ev.preventDefault();
      if (this._solarTimeSpeed !== 0) {
        this._setSolarTimeSpeed(0);
      } else {
        this._setSolarTimeSpeed(SOLAR_TIME_SPEED_PRESETS_DAYS_PER_SEC[this._solarTimeSpeedPresetIdx]);
      }
    };
    const onSpeedCycle = (ev) => {
      ev.preventDefault();
      this._solarTimeSpeedPresetIdx =
        (this._solarTimeSpeedPresetIdx + 1) % SOLAR_TIME_SPEED_PRESETS_DAYS_PER_SEC.length;
      // Změna rychlosti vždy rovnou (znovu)spustí přehrávání - úprava
      // rychlosti, když je stejně na pauze, by nedávala smysl/nic by se
      // neukázalo.
      this._setSolarTimeSpeed(SOLAR_TIME_SPEED_PRESETS_DAYS_PER_SEC[this._solarTimeSpeedPresetIdx]);
    };
    const onToday = (ev) => {
      ev.preventDefault();
      this._resetSolarTime();
      this._updateSolarPositions(new Date());
    };

    playBtn.addEventListener('click', onPlayToggle);
    speedBtn.addEventListener('click', onSpeedCycle);
    todayBtn.addEventListener('click', onToday);

    this._solarTimeControlsUnbind = () => {
      playBtn.removeEventListener('click', onPlayToggle);
      speedBtn.removeEventListener('click', onSpeedCycle);
      todayBtn.removeEventListener('click', onToday);
    };

    this._updateSolarTimeUi();
  }

  /** Nastaví rychlost časové animace; při startu z pauzy (0 → nenulová)
   * začíná simulovaný čas vždy OD DNEŠKA, ne odkud skončila minulá relace. */
  _setSolarTimeSpeed(daysPerSec) {
    this._solarTimeSpeed = daysPerSec;
    if (daysPerSec !== 0 && !this._solarSimTime) {
      this._solarSimTime = new Date();
    }
    this._updateSolarTimeUi();
  }

  /** Vrátí časovou animaci do výchozího stavu (živé sledování reálného
   * "teď") - voláno tlačítkem "Dnes" i při odchodu z solar view. */
  _resetSolarTime() {
    this._solarSimTime = null;
    this._solarTimeSpeed = 0;
    this._solarTimeSpeedPresetIdx = 0;
    this._updateSolarTimeUi();
  }

  /** Přepíše ikonu play/pauza, text rychlosti, viditelnost tlačítka "Dnes"
   * a datumový popisek podle aktuálního stavu `_solarSimTime`/`_solarTimeSpeed`. */
  _updateSolarTimeUi() {
    const playBtn = this._els.solarTimePlay;
    if (!playBtn) return;

    const playing = this._solarTimeSpeed !== 0;
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.title = playing ? 'Pozastavit časovou animaci' : 'Přehrát časovou animaci';
    if (this._els.solarTimeIconPlay) this._els.solarTimeIconPlay.hidden = playing;
    if (this._els.solarTimeIconPause) this._els.solarTimeIconPause.hidden = !playing;

    const presetDays = SOLAR_TIME_SPEED_PRESETS_DAYS_PER_SEC[this._solarTimeSpeedPresetIdx];
    if (this._els.solarTimeSpeed) {
      this._els.solarTimeSpeed.textContent = SOLAR_TIME_SPEED_LABELS[presetDays] || `${presetDays} d/s`;
    }

    const diverged = !!this._solarSimTime;
    if (this._els.solarTimeToday) this._els.solarTimeToday.style.display = diverged ? '' : 'none';

    if (this._els.solarTimeLabel) {
      const newText = diverged
        ? this._solarSimTime.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      // Zbytečné přepisování stejného textu 60×/s (voláno i z _frameSolar()
      // během animace) je jen plýtvání - přeskočit, když se nic nezměnilo.
      if (this._els.solarTimeLabel.textContent !== newText) {
        this._els.solarTimeLabel.textContent = newText;
      }
    }
  }

  /**
   * Přepne mezi pohledem "glóbus" (`'globe'`, výchozí) a "sluneční soustava"
   * (`'solar'`) - viz tlačítko vlevo nahoře. Obě scény sdílí stejný
   * renderer/canvas (viz `_initSolarScene`), takže přepnutí je jen změna
   * stavu + přeskládání viditelnosti overlay prvků, žádné znovu-vytváření.
   */
  setViewMode(mode) {
    if (mode !== 'globe' && mode !== 'solar') return;
    if (this._viewMode === mode) return;
    this._viewMode = mode;
    const isSolar = mode === 'solar';

    const solarBtn = this._els.solarBtn;
    if (solarBtn) {
      solarBtn.setAttribute('aria-pressed', String(isSolar));
      solarBtn.title = isSolar ? 'Zpět na glóbus' : 'Zobrazit sluneční soustavu';
    }
    if (this._els.solarIconOn) this._els.solarIconOn.hidden = isSolar;
    if (this._els.solarIconOff) this._els.solarIconOff.hidden = !isSolar;

    // Údaje vázané na domovskou polohu (odpočet do východu/západu, délka
    // dne, fáze Měsíce, poloha na dráze) nedávají v pohledu sluneční
    // soustavy smysl - schovat. Tlačítko pro přepnutí pohledu je ale v
    // `.agc-view-controls` společně s reset/zámek tlačítky a musí zůstat
    // vidět vždy - viditelnost jednotlivých tlačítek uvnitř řeší
    // `_updateRotationButtonsVisibility()`.
    this._updateRotationButtonsVisibility();
    if (this._els.overlayBottom) this._els.overlayBottom.style.display = isSolar ? 'none' : '';
    if (this._els.cornerBl) this._els.cornerBl.style.display = isSolar ? 'none' : '';
    if (this._els.cornerBr) this._els.cornerBr.style.display = isSolar ? 'none' : '';
    if (this._els.solarTimeBar) this._els.solarTimeBar.style.display = isSolar ? '' : 'none';

    if (isSolar) {
      this._updateSolarPositions(new Date());
    } else {
      // Odchod z pohledu sluneční soustavy zruší výběr planety i časovou
      // animaci (v0.11.0) - ať se při příštím otevření startuje vždy z
      // živého přehledu celé soustavy, ne "napůl přiblíženo"/přetočeno na
      // to, co bylo nastavené minule.
      this._selectSolarPlanet(null);
      this._resetSolarTime();
    }
  }

  /**
   * Reset/zámek tlačítka v `.agc-view-controls` dávají smysl jen v pohledu
   * glóbu a jen když je `manual_rotation` zapnuté (jinak by nebylo co
   * resetovat/zamykat) - schovávají se jednotlivě. Tlačítko pro přepnutí
   * sluneční soustavy je ve stejném kontejneru, ale musí zůstat vidět vždy,
   * takže se celý `.agc-view-controls` už dál jako celek neschovává (dřívější
   * bug: v0.9.0 skryl i solar tlačítko a to se navíc vizuálně srazilo s
   * datem, když bylo ve vlastním rohu - viz CHANGELOG v0.9.1).
   */
  _updateRotationButtonsVisibility() {
    const show = this._viewMode !== 'solar' && !!this._config.manual_rotation;
    const display = show ? '' : 'none';
    if (this._els.resetBtn) this._els.resetBtn.style.display = display;
    if (this._els.lockBtn) this._els.lockBtn.style.display = display;
  }

  _css() {
    return `
      :host { display: block; }
      ha-card { overflow: hidden; background: var(--agc-bg, #000); padding: 0; }
      .agc-root { display: flex; flex-direction: column; }
      .agc-title {
        font-size: 14px; font-weight: 500; padding: 10px 16px 0 16px;
        color: var(--primary-text-color, #fff); opacity: 0.7;
      }
      .agc-title:empty { display: none; }
      .agc-stage {
        position: relative; width: 100%; aspect-ratio: 1 / 1;
        background: radial-gradient(circle at 50% 45%, #0a0f1e 0%, #000 80%);
        overflow: hidden;
      }
      .agc-canvas {
        position: absolute; inset: 0; width: 100%; height: 100%; display: block;
        /* touch-action: none - bez tohohle by mobilní prohlížeč bral tažení
           přes canvas jako pokus o scroll stránky a rotaci by "ukradl" pro
           sebe (rvačka o gesto - žádná rotace by se nezobrazila, jen se
           odscrolovala stránka). Cena: dotykem přímo na glóbu už nejde
           scrollovat dashboard skrz kartu (stejný kompromis jako u
           HA mapové karty) - nad/pod kartou to jde normálně dál. */
        touch-action: none; -webkit-user-select: none; user-select: none;
        cursor: grab;
      }
      .agc-canvas.agc-dragging { cursor: grabbing; }

      .agc-overlay-top {
        position: absolute; top: 14px; left: 18px; right: 18px;
        pointer-events: none; text-shadow: 0 1px 8px rgba(0,0,0,0.85), 0 0 20px rgba(0,0,0,0.5);
      }
      .agc-date {
        font-size: 15px; letter-spacing: 1.5px; font-weight: 700;
        color: #fff; text-transform: uppercase;
      }
      .agc-time {
        font-size: clamp(30px, 11vw, 52px); font-weight: 400; line-height: 1.05;
        color: #fff; font-variant-numeric: tabular-nums; margin-top: 2px;
      }

      .agc-overlay-bottom {
        position: absolute; left: 62px; right: 62px; bottom: 20px;
        pointer-events: none; text-shadow: 0 1px 8px rgba(0,0,0,0.85), 0 0 20px rgba(0,0,0,0.5);
        text-align: center;
      }
      .agc-row {
        font-size: 13px; font-weight: 600; color: #fff;
        line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .agc-row:empty { display: none; }

      .agc-corner {
        position: absolute; width: 44px; height: 44px;
        display: flex; align-items: center; justify-content: center;
        opacity: 0.9; z-index: 2;
      }
      .agc-corner-bl { left: 14px; bottom: 14px; }
      .agc-corner-br { right: 14px; bottom: 14px; }
      .agc-orbit-icon { width: 100%; height: 100%; }

      .agc-view-controls {
        position: absolute; top: 10px; right: 10px; z-index: 3;
        display: flex; gap: 6px;
        /* na rozdíl od .agc-overlay-top (pointer-events: none) tahle
           tlačítka MUSÍ reagovat na klik - jsou ale kreslená nad canvasem
           (pozdější pořadí v DOM + z-index), takže klik na ně normálně
           nepropadne dolů na canvas a nespustí zároveň i tažení/rotaci. */
      }
      .agc-btn {
        width: 28px; height: 28px; border-radius: 50%; border: none; padding: 0;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.4); color: #fff; opacity: 0.8; cursor: pointer;
        transition: opacity 0.15s ease, background-color 0.15s ease;
      }
      .agc-btn:hover { opacity: 1; background: rgba(0,0,0,0.55); }
      .agc-btn:active { transform: scale(0.92); }
      .agc-btn-lock.agc-btn-active {
        background: var(--agc-accent, #33e6b0); color: #06231a; opacity: 1;
      }

      /* Info panel po kliknutí na planetu v solar view (v0.11.0) - na
         rozdíl od .agc-overlay-top/-bottom potřebuje pointer-events (má
         zavírací křížek), a stejně jako .agc-error MUSÍ mít [hidden]
         pravidlo s vyšší specificitou, jinak "hidden" atribut tiše
         nezabere - viz dlouhá poznámka u .agc-error[hidden] níž (stejný
         bug, jednou už tady nahlášený jako "tmavé sklo přes celou kartu"). */
      .agc-solar-info {
        /* bottom: 54px (ne 20px) - nechává místo pro .agc-solar-time lištu
           pod ním (v0.11.0), ať se dvě dolní překryvné vrstvy nesrazí,
           stejný typ chyby, jaký jsme opravovali u solar tlačítka/data. */
        position: absolute; left: 50%; bottom: 54px; transform: translateX(-50%);
        z-index: 3; max-width: 78%; padding: 10px 32px 10px 14px;
        background: rgba(0,0,0,0.55); border-radius: 10px;
        color: #fff; text-align: left; pointer-events: auto;
      }
      .agc-solar-info[hidden] { display: none; }
      .agc-solar-info-name {
        font-size: 14px; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 2px;
      }
      .agc-solar-info-row {
        font-size: 12px; opacity: 0.85; line-height: 1.4; white-space: nowrap;
      }
      .agc-solar-info-row:empty { display: none; }
      .agc-solar-info-close {
        position: absolute; top: 2px; right: 4px; width: 22px; height: 22px;
        border: none; border-radius: 50%; background: transparent; color: #fff;
        opacity: 0.6; cursor: pointer; font-size: 13px; line-height: 1; padding: 0;
      }
      .agc-solar-info-close:hover { opacity: 1; background: rgba(255,255,255,0.12); }

      /* Časová animace (v0.11.0) - lišta úplně dole, vždy vidět v solar
         view (viditelnost řeší inline style.display v setViewMode(), jako
         .agc-overlay-bottom - žádný [hidden] atribut, takže tu není
         potřeba speciální CSS specificita jako u .agc-error/.agc-solar-info. */
      .agc-solar-time {
        position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
        z-index: 3; display: flex; align-items: center; gap: 8px;
        padding: 4px 10px; border-radius: 20px; background: rgba(0,0,0,0.5);
        pointer-events: auto;
      }
      .agc-solar-time-play {
        width: 24px; height: 24px;
      }
      .agc-solar-time-speed, .agc-solar-time-today {
        border: none; background: rgba(255,255,255,0.14); color: #fff;
        font-size: 11px; font-weight: 600; padding: 4px 9px; border-radius: 12px;
        cursor: pointer; opacity: 0.9; transition: opacity 0.15s ease, background-color 0.15s ease;
      }
      .agc-solar-time-speed:hover, .agc-solar-time-today:hover {
        opacity: 1; background: rgba(255,255,255,0.26);
      }
      .agc-solar-time-label {
        font-size: 11px; color: #cfe3ff; min-width: 64px; text-align: center;
        font-variant-numeric: tabular-nums;
      }

      .agc-error {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        color: #ff8a80; background: rgba(0,0,0,0.75); font-size: 13px; text-align: center; padding: 16px;
      }
      /* SKUTEČNÁ PŘÍČINA "tmavého skla přes celou kartu": autorské pravidlo
         ".agc-error" s "display: flex" má stejnou specificitu jako výchozí
         UA pravidlo prohlížeče "[hidden]" s "display: none", a autorské
         pravidlo v cascade vyhrává - takže atribut hidden (přepínaný v JS
         přes this._els.error.hidden = true/false) neměl ŽÁDNÝ vizuální
         efekt a tahle poloprůhledná černá vrstva (rgba(0,0,0,0.75), proto
         ten "průsvitný černý filtr") ležela NASTÁLE přes celým plátnem,
         nezávisle na jakémkoli nastavení jasu/sytosti/kontrastu. Tohle
         pravidlo má vyšší specificitu (class+atribut > class) a vrací
         hidden atributu jeho normální chování. Ověřeno headless renderem:
         bez téhle opravy byl každý pixel plátna násoben ~0.25 (= 1 - 0.75
         alpha černého překryvu), rovnoměrně napříč celým obrazem. */
      .agc-error[hidden] { display: none; }
    `;
  }

  _renderStaticParts() {
    if (!this._els) return;
    this._els.title.textContent = this._config.title || '';
    if (this._config.accent_color) {
      this.style.setProperty('--agc-accent', this._config.accent_color);
    }
    const cfg = this._config;

    if (this._earthUniforms) {
      this._earthUniforms.exposure.value = cfg.brightness ?? DEFAULT_CONFIG.brightness;
      this._earthUniforms.nightAmbientStrength.value = cfg.night_ambient ?? DEFAULT_CONFIG.night_ambient;
      this._earthUniforms.colorSaturation.value = cfg.saturation ?? DEFAULT_CONFIG.saturation;
      this._earthUniforms.colorContrast.value = cfg.contrast ?? DEFAULT_CONFIG.contrast;
      this._earthUniforms.twilightStrength.value = cfg.twilight_strength ?? DEFAULT_CONFIG.twilight_strength;
    }
    if (this._cloudsUniforms) {
      this._cloudsUniforms.opacity.value = cfg.cloud_opacity ?? DEFAULT_CONFIG.cloud_opacity;
    }
    if (this._atmosphereUniforms) {
      const atmoIntensity = cfg.atmosphere_intensity ?? DEFAULT_CONFIG.atmosphere_intensity;
      this._atmosphereUniforms.glowIntensity.value = ATMOSPHERE_BASE_INTENSITY * atmoIntensity;
    }
    if (this._skyUniforms) {
      this._skyUniforms.skyIntensity.value = cfg.sky_intensity ?? DEFAULT_CONFIG.sky_intensity;
    }
    if (this._skyMesh) {
      this._skyMesh.visible = !!cfg.show_stars;
    }
    if (this._markerSprite) {
      const markerSize = cfg.marker_size ?? DEFAULT_CONFIG.marker_size;
      this._markerSprite.scale.set(markerSize, markerSize, 1);
    }
    // Tlačítka "vrátit domů"/"zámek" dávají smysl jen když je ruční
    // otáčení vůbec zapnuté a jsme v pohledu glóbu - jinak by natáčet
    // nešlo, takže by neměly co resetovat/zamykat. Solar tlačítko ve
    // stejném `.agc-view-controls` kontejneru zůstává vidět vždy.
    this._updateRotationButtonsVisibility();
  }

  // -- three.js inicializace -------------------------------------------------

  _initThree() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this._els.canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer = renderer;

    const scene = new THREE.Scene();
    this._scene = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this._camera = camera;

    const cfg = this._config || DEFAULT_CONFIG;

    // -- Hvězdné pozadí (skybox) ------------------------------------------
    // Procedurální hvězdy + mlhovina přímo v shaderu (viz earth-shaders.js).
    const skyGeometry = new THREE.SphereGeometry(50, 48, 48);
    this._skyUniforms = {
      skyIntensity: { value: cfg.sky_intensity ?? DEFAULT_CONFIG.sky_intensity },
    };
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: this._skyUniforms,
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skyMesh);
    this._skyMesh = skyMesh;

    // -- Země ---------------------------------------------------------------
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 96, 96);

    this._earthUniforms = {
      dayTexture: { value: null },
      nightTexture: { value: null },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      nightBrightness: { value: 2.6 },
      twilightStrength: { value: cfg.twilight_strength ?? DEFAULT_CONFIG.twilight_strength },
      exposure: { value: cfg.brightness ?? DEFAULT_CONFIG.brightness },
      nightAmbientStrength: { value: cfg.night_ambient ?? DEFAULT_CONFIG.night_ambient },
      colorSaturation: { value: cfg.saturation ?? DEFAULT_CONFIG.saturation },
      colorContrast: { value: cfg.contrast ?? DEFAULT_CONFIG.contrast },
    };
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: this._earthUniforms,
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
    });
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthMesh);
    this._earthMesh = earthMesh;

    // -- Mraky ----------------------------------------------------------------
    const cloudsGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.006, 96, 96);
    this._cloudsUniforms = {
      cloudsTexture: { value: null },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      opacity: { value: cfg.cloud_opacity ?? DEFAULT_CONFIG.cloud_opacity },
    };
    const cloudsMaterial = new THREE.ShaderMaterial({
      uniforms: this._cloudsUniforms,
      vertexShader: cloudsVertexShader,
      fragmentShader: cloudsFragmentShader,
      transparent: true,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
    scene.add(cloudsMesh);
    this._cloudsMesh = cloudsMesh;

    // -- Atmosféra (Fresnel záře) ---------------------------------------------
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.045, 64, 64);
    this._atmosphereUniforms = {
      // POZOR: `new THREE.Color(hex)` by tady tiše aplikovalo three.js
      // automatickou sRGB->lineární konverzi (od r152 defaultní chování
      // ColorManagement) - výsledek by byl citelně tmavší/míň sytý, než
      // hex hodnota napovídá (0x57c8ff by vyšlo jako [0.10, 0.58, 1.00]
      // místo [0.34, 0.78, 1.00]), protože náš vlastní atmosphereFragment
      // shader žádný zpětný převod na výstupu nedělá. `setHex(hex,
      // NoColorSpace)` dá barvu 1:1 podle hex hodnoty.
      glowColor: { value: new THREE.Color().setHex(0x57c8ff, THREE.NoColorSpace) },
      glowPower: { value: 2.15 },
      glowIntensity: {
        value: ATMOSPHERE_BASE_INTENSITY * (cfg.atmosphere_intensity ?? DEFAULT_CONFIG.atmosphere_intensity),
      },
    };
    const atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: this._atmosphereUniforms,
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphereMesh);
    this._atmosphereMesh = atmosphereMesh;

    // -- GPS značka -------------------------------------------------------
    const markerTexture = makeMarkerTexture('#33e6b0');
    const markerMaterial = new THREE.SpriteMaterial({
      map: markerTexture,
      depthTest: true,
      transparent: true,
    });
    const markerSprite = new THREE.Sprite(markerMaterial);
    // Počáteční hodnota - hned po _initThree() ji přepíše _renderStaticParts()
    // podle cfg.marker_size (posuvník "Velikost GPS značky" v editoru).
    const initialMarkerSize = cfg.marker_size ?? DEFAULT_CONFIG.marker_size;
    markerSprite.scale.set(initialMarkerSize, initialMarkerSize, 1);
    earthMesh.add(markerSprite);
    this._markerSprite = markerSprite;

    // -- Slunce (světelný zdroj + vizuální značka) ----------------------------
    const sunLight = new THREE.DirectionalLight(0xfff2d9, 1.55);
    scene.add(sunLight);
    this._sunLight = sunLight;
    scene.add(new THREE.AmbientLight(0x1c2b45, 0.5));

    // Dvouvrstvá záře - velký měkký halo + malé ostré jasné jádro, ať to
    // připomíná sluneční záblesk na okraji glóbu místo ploché tečky.
    // Měřítka o něco větší než dřív kvůli odsazenější kameře.
    const sunHaloMaterial = new THREE.SpriteMaterial({
      map: makeGlowSpriteTexture(),
      transparent: true,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sunHalo = new THREE.Sprite(sunHaloMaterial);
    sunHalo.scale.set(1.0, 1.0, 1);
    scene.add(sunHalo);
    this._sunHalo = sunHalo;

    const sunCoreMaterial = new THREE.SpriteMaterial({
      map: makeSunCoreTexture(),
      transparent: true,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    const sunSprite = new THREE.Sprite(sunCoreMaterial);
    sunSprite.scale.set(0.26, 0.26, 1);
    scene.add(sunSprite);
    this._sunSprite = sunSprite;

    // -- Měsíc ---------------------------------------------------------------
    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 48, 48);
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: null,
      roughness: 1,
      metalness: 0,
    });
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    scene.add(moonMesh);
    this._moonMesh = moonMesh;

    this._camWobble = { az: 0, el: 0 };
  }

  /**
   * Druhá, nezávislá three.js scéna + kamera pro pohled "sluneční soustava"
   * (tlačítko vlevo nahoře) - Slunce, 8 planet na dnešní pozici a jejich
   * oběžné dráhy. Sdílí STEJNÝ renderer/canvas/WebGL kontext jako hlavní
   * glóbus (žádný druhý GPU kontext, jen se přepíná, které dvojici
   * scene+camera se předá do `renderer.render()` - viz `_frame()`), takže
   * to nestojí nic navíc, dokud se pohled skutečně nezobrazí.
   */
  _initSolarScene() {
    const scene = new THREE.Scene();
    this._solarScene = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this._solarCamera = camera;

    // Stav "zaostření" na planetu po kliknutí (v0.11.0) - viz
    // _selectSolarPlanet()/_frameSolar(). Bez výběru kamera obíhá kolem
    // počátku scény (Slunce) v SOLAR_DISPLAY_MAX_R*1.55.
    this._solarFocusKey = null;
    this._solarFocusPoint = new THREE.Vector3(0, 0, 0);
    this._solarFocusDist = SOLAR_DISPLAY_MAX_R * 1.55;
    this._raycaster = new THREE.Raycaster();

    scene.add(new THREE.AmbientLight(0x445066, 1.3));
    const sunLight = new THREE.PointLight(0xfff2d9, 2.4, 0, 0.4);
    scene.add(sunLight);

    // Slunce - stejné sprite textury (glow + ostré jádro) jako u glóbusu,
    // viz makeGlowSpriteTexture()/makeSunCoreTexture() výš v souboru.
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowSpriteTexture(),
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }));
    sunHalo.scale.set(1.2, 1.2, 1);
    scene.add(sunHalo);
    const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSunCoreTexture(),
      transparent: true,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }));
    sunCore.scale.set(0.4, 0.4, 1);
    scene.add(sunCore);

    // Oběžné dráhy - tenké statické kruhy (viz auToDisplayRadius/
    // PLANET_MEAN_DISTANCE_AU - skutečná dráha planety je mírně eliptická,
    // ale kruh je pro tuhle vizualizaci naprosto dostatečný).
    this._solarPlanetMeshes = {};
    this._solarOrbitRadii = {};

    for (const key of PLANET_ORDER) {
      const r = auToDisplayRadius(PLANET_MEAN_DISTANCE_AU[key]);
      this._solarOrbitRadii[key] = r;

      const segments = 96;
      const positions = new Float32Array((segments + 1) * 3);
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        positions[i * 3] = r * Math.cos(a);
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = r * Math.sin(a);
      }
      const orbitGeometry = new THREE.BufferGeometry();
      orbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const orbitMaterial = new THREE.LineBasicMaterial({
        color: 0x8fb8ff,
        transparent: true,
        opacity: 0.28,
      });
      scene.add(new THREE.LineLoop(orbitGeometry, orbitMaterial));

      // Planeta samotná
      const visual = PLANET_VISUALS[key];
      const planetGeometry = new THREE.SphereGeometry(visual.radius, 24, 24);
      const planetMaterial = new THREE.MeshStandardMaterial({
        color: visual.color,
        roughness: 0.9,
        metalness: 0,
      });
      const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
      planetMesh.position.set(r, 0, 0); // dočasně na dráze - _updateUiText() ji hned přepíše na skutečnou pozici
      scene.add(planetMesh);
      this._solarPlanetMeshes[key] = planetMesh;

      if (key === 'earth') {
        // Zvýraznění Země (v0.11.0) - v přehledu celé soustavy je jinak
        // nerozeznatelná od Marsu/Venuše na první pohled, tohle hned
        // napoví "tady jsme". Reuse `makeMarkerTexture()` (stejný princip
        // jako GPS značka na glóbusu), jen jako jemné poloprůhledné halo
        // (`AdditiveBlending`, žádný ostrý bílý okraj) místo ostré tečky.
        const earthHighlight = new THREE.Sprite(new THREE.SpriteMaterial({
          map: makeMarkerTexture('rgba(125, 220, 255, 0.6)'),
          transparent: true,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        }));
        earthHighlight.scale.set(visual.radius * 5, visual.radius * 5, 1);
        planetMesh.add(earthHighlight);

        // Měsíc jako mini-model (v0.14.0) - PŘIDANÝ JAKO DÍTĚ zemské
        // mesh, takže při pohybu Země (viz `_updateSolarPositions`) letí
        // automaticky s ní (three.js skládá world pozici = pozice rodiče +
        // lokální pozice dítěte); jeho LOKÁLNÍ pozici (směr a vzdálenost od
        // Země) přepočítává `_updateSolarMoonPosition()` podle skutečné
        // aktuální fáze. Tenký prstenec dráhy pro čitelnost, stejný princip
        // jako oběžné dráhy planet výš, jen v měřítku Země.
        const moonOrbitSegments = 48;
        const moonOrbitPositions = new Float32Array((moonOrbitSegments + 1) * 3);
        for (let i = 0; i <= moonOrbitSegments; i++) {
          const a = (i / moonOrbitSegments) * Math.PI * 2;
          moonOrbitPositions[i * 3] = MOON_ORBIT_VISUAL_RADIUS * Math.cos(a);
          moonOrbitPositions[i * 3 + 1] = 0;
          moonOrbitPositions[i * 3 + 2] = MOON_ORBIT_VISUAL_RADIUS * Math.sin(a);
        }
        const moonOrbitGeometry = new THREE.BufferGeometry();
        moonOrbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(moonOrbitPositions, 3));
        const moonOrbitMaterial = new THREE.LineBasicMaterial({
          color: 0xaaaaaa,
          transparent: true,
          opacity: 0.35,
        });
        planetMesh.add(new THREE.LineLoop(moonOrbitGeometry, moonOrbitMaterial));

        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(MOON_VISUAL_RADIUS, 16, 16),
          new THREE.MeshStandardMaterial({ color: MOON_VISUAL_COLOR, roughness: 0.95, metalness: 0 })
        );
        // Stejné nasvícení Sluncem (PointLight v počátku scény, viz výš)
        // jako u planet - žádný speciální "fázový" shader/textura navíc,
        // fáze Měsíce se ukáže úplně sama jako přirozený vedlejší efekt
        // správně natočeného 3D nasvícení, přesně jako u ostatních planet.
        moonMesh.position.set(MOON_ORBIT_VISUAL_RADIUS, 0, 0); // dočasně - _updateSolarMoonPosition() ji hned přepíše
        planetMesh.add(moonMesh);
        this._solarMoonMesh = moonMesh;
      }

      if (visual.ring) {
        // Jednoduchý prstenec (Saturn) - mírně nakloněný, ať je i z
        // shora-šikma úhlu kamery vidět jako prstenec, ne jako čárka.
        const ringGeometry = new THREE.RingGeometry(visual.radius * 1.5, visual.radius * 2.3, 48);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xd8c9a0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
        });
        const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
        ringMesh.rotation.x = Math.PI / 2 - 0.45;
        planetMesh.add(ringMesh);
      }
    }

    // Pás asteroidů (v0.15.0, viz konstanty ASTEROID_BELT_* výš) - statický
    // dekorativní oblak bodů mezi drahou Marsu a Jupiteru. `THREE.Points`
    // (ne stovky jednotlivých Mesh) - jedna geometrie/draw-call pro
    // stovky bodů, prakticky zadarmo na výkon narozdíl od tolika
    // samostatných koulí.
    {
      const innerR = auToDisplayRadius(PLANET_MEAN_DISTANCE_AU.mars);
      const outerR = auToDisplayRadius(PLANET_MEAN_DISTANCE_AU.jupiter);
      const beltPositions = new Float32Array(ASTEROID_BELT_COUNT * 3);
      for (let i = 0; i < ASTEROID_BELT_COUNT; i++) {
        const a = Math.random() * Math.PI * 2;
        // sqrt(random) - rovnoměrné rozložení podle PLOCHY mezikruží, ne
        // podle poloměru (jinak by se body nepřirozeně hromadily u
        // vnitřního okraje).
        const r = innerR + (outerR - innerR) * Math.sqrt(Math.random());
        const y = (Math.random() - 0.5) * ASTEROID_BELT_HEIGHT;
        beltPositions[i * 3] = r * Math.cos(a);
        beltPositions[i * 3 + 1] = y;
        beltPositions[i * 3 + 2] = r * Math.sin(a);
      }
      const beltGeometry = new THREE.BufferGeometry();
      beltGeometry.setAttribute('position', new THREE.Float32BufferAttribute(beltPositions, 3));
      const beltMaterial = new THREE.PointsMaterial({
        color: ASTEROID_BELT_COLOR,
        size: 0.012,
        transparent: true,
        opacity: 0.7,
        sizeAttenuation: true,
      });
      scene.add(new THREE.Points(beltGeometry, beltMaterial));
    }

    // Pluto (v0.15.0, trpasličí planeta - NENÍ v PLANET_ORDER, viz
    // `getPlutoPosition()`/poznámka v planets.js) - vlastní kus kódu mimo
    // smyčku výš, protože do ní záměrně nepatří.
    {
      const r = auToDisplayRadius(PLUTO_MEAN_DISTANCE_AU);
      this._solarOrbitRadii.pluto = r;

      const segments = 96;
      const plutoOrbitPositions = new Float32Array((segments + 1) * 3);
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        plutoOrbitPositions[i * 3] = r * Math.cos(a);
        plutoOrbitPositions[i * 3 + 1] = 0;
        plutoOrbitPositions[i * 3 + 2] = r * Math.sin(a);
      }
      const plutoOrbitGeometry = new THREE.BufferGeometry();
      plutoOrbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(plutoOrbitPositions, 3));
      const plutoOrbitMaterial = new THREE.LineBasicMaterial({
        color: 0x8fb8ff,
        transparent: true,
        opacity: 0.18,
      });
      // POZOR: tahle plochá kružnice (v rovině ekliptiky) je u Pluta
      // hrubší aproximace než u ostatních 8 planet - jeho skutečná dráha
      // je skloněná ~17° k ekliptice (mnohem víc než kterákoli z
      // ostatních). Samotná planeta (počítaná přes plný Keplerův řešič
      // VČETNĚ sklonu, viz `_updateSolarPositions`) proto bude na scéně
      // reálně dost mimo tuhle kruhovou čáru - to je OČEKÁVANÉ, ne bug.
      scene.add(new THREE.LineLoop(plutoOrbitGeometry, plutoOrbitMaterial));

      const plutoMesh = new THREE.Mesh(
        new THREE.SphereGeometry(PLUTO_VISUAL.radius, 16, 16),
        new THREE.MeshStandardMaterial({ color: PLUTO_VISUAL.color, roughness: 0.9, metalness: 0 })
      );
      plutoMesh.position.set(r, 0, 0); // dočasně - _updateSolarPositions() ji hned přepíše
      scene.add(plutoMesh);
      this._solarPlanetMeshes.pluto = plutoMesh;
    }
  }

  /**
   * Přepočítá pozice planet na dnešní datum a zapíše je do už existujících
   * planet-meshí (`_solarPlanetMeshes`). Voláno jen z `_updateUiText()`
   * (1×/s) - reálná poloha planet se v rámci sekund/minut nemění vůbec
   * znatelně, takže přepočítávat to každý vykreslovaný snímek (60/s) by
   * bylo zbytečné plýtvání.
   */
  _updateSolarPositions(now) {
    if (!this._solarPlanetMeshes) return;
    const positions = getPlanetPositions(now);
    // Pluto (v0.15.0) není v PLANET_ORDER/getPlanetPositions() (trpasličí
    // planeta, ne jedna z 8 "hlavních"), ale má stejný tvar dat
    // ({x,y,z,distanceAU,...}) - přimíchaný sem se s ním dál zachází úplně
    // stejně jako s ostatními (scale/info panel/elongace/raycast fungují
    // beze změny, protože všude berou klíč obecně, ne natvrdo PLANET_ORDER).
    positions.pluto = getPlutoPosition(now);
    // Uloženo stranou (surové AU souřadnice, ne scale-nutá pozice v scéně) -
    // info panel (`_updateSolarInfoPanel`) z toho počítá SKUTEČNOU vzdálenost
    // planeta-Země, což by ze zobrazovací (odmocninové) škály vyšlo špatně.
    this._solarRawPositions = positions;
    // Referenční datum k téhle sadě pozic (živé "teď", nebo simulovaný čas
    // během časové animace, viz v0.11.0) - "co je dnes vidět ze Země"
    // (v0.13.0) musí počítat výšku nad obzorem pro STEJNÝ okamžik, ne
    // znovu volat `new Date()` a rozjet se s tím, co se zrovna kreslí.
    this._solarPositionsDate = now;
    for (const key of Object.keys(this._solarPlanetMeshes)) {
      const p = positions[key];
      const mesh = this._solarPlanetMeshes[key];
      if (!p || !mesh) continue;
      // Heliocentrická ekliptika (x,y,z v AU, z = kolmo na ekliptiku) →
      // scéna (Y-up): scale škáluje vzdálenost od Slunce (ne z, ať sklony
      // drah zůstanou vizuálně čitelné, ne přehnané).
      const displayR = auToDisplayRadius(p.distanceAU);
      const scale = p.distanceAU > 0 ? displayR / p.distanceAU : 0;
      mesh.position.set(p.x * scale, p.z * scale, p.y * scale);
    }
    this._updateSolarMoonPosition(now);
    this._updateSolarInfoPanel();
  }

  /**
   * Přepočítá LOKÁLNÍ pozici Měsíce vůči Zemi (viz `_solarMoonMesh`,
   * přidaný jako dítě zemské mesh v `_initSolarScene`) podle skutečné
   * aktuální fáze - `moon.phase` (0=nov, 0.5=úplněk) z astro.js je už
   * definovaná jako (ekliptikální délka Měsíce - ekliptikální délka
   * Slunce)/360°, takže `phase * 2π` je přesně úhel Měsíce vůči směru
   * Země→Slunce, žádný nový výpočet navíc. 0° = Měsíc směrem ke Slunci
   * (nov), 180° = na opačné straně (úplněk) - stejná prográdní rotace
   * (rostoucí úhel = X směrem k Z) jako zbytek scény, viz komentář u
   * `_updateSolarPositions()`.
   */
  _updateSolarMoonPosition(date) {
    const moonMesh = this._solarMoonMesh;
    const earthMesh = this._solarPlanetMeshes && this._solarPlanetMeshes.earth;
    if (!moonMesh || !earthMesh) return;

    const ex = earthMesh.position.x, ez = earthMesh.position.z;
    const distToSun = Math.sqrt(ex * ex + ez * ez) || 1;
    const sunDirX = -ex / distToSun, sunDirZ = -ez / distToSun;

    const moon = getMoonPosition(date);
    const angle = moon.phase * 2 * Math.PI;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const dirX = sunDirX * cosA - sunDirZ * sinA;
    const dirZ = sunDirX * sinA + sunDirZ * cosA;

    moonMesh.position.set(dirX * MOON_ORBIT_VISUAL_RADIUS, 0, dirZ * MOON_ORBIT_VISUAL_RADIUS);
  }

  /**
   * Klik (ne tažení) na canvas v solar view - viz `_dragTotalMove`/
   * `SOLAR_CLICK_MAX_MOVE_PX` v `_bindDragRotation`. Raycast proti planetám
   * (ne proti drahám/Slunci) a přepnutí výběru (`_selectSolarPlanet`).
   */
  _handleSolarClick(clientX, clientY) {
    const key = this._raycastSolarPlanetAt(clientX, clientY);
    this._selectSolarPlanet(key);
  }

  /** Vrátí klíč planety pod danými klientskými souřadnicemi (nebo null). */
  _raycastSolarPlanetAt(clientX, clientY) {
    if (!this._solarPlanetMeshes || !this._solarCamera || !this._raycaster) return null;
    const canvas = this._els.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._solarCamera);
    // Object.keys() místo PLANET_ORDER - zahrnuje i Pluto (v0.15.0), který
    // v PLANET_ORDER záměrně není (viz komentář u ELEMENTS.pluto v
    // planets.js), ale klikatelný/vybíratelný stejně jako ostatní být má.
    const keys = Object.keys(this._solarPlanetMeshes);
    const meshes = keys.map((k) => this._solarPlanetMeshes[k]).filter(Boolean);
    const hits = this._raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hitMesh = hits[0].object;
    return keys.find((k) => this._solarPlanetMeshes[k] === hitMesh) || null;
  }

  /**
   * Vybere/odvybere planetu v solar view - `null` (klik do prázdna) nebo
   * klik na už vybranou planetu (přepínač) se vrátí k přehledu celé
   * soustavy. Samotné plynulé přiblížení kamery řeší `_frameSolar()`
   * (`_solarFocusKey` je jediný zdroj pravdy, tahle metoda jen aktualizuje
   * i textový info panel).
   */
  _selectSolarPlanet(key) {
    const next = key && key === this._solarFocusKey ? null : key;
    if (this._solarFocusKey === next) return;
    this._solarFocusKey = next;
    this._updateSolarInfoPanel();
  }

  /** Přepíše obsah/viditelnost info panelu (jméno + vzdálenosti) podle
   * `_solarFocusKey`. Voláno z `_selectSolarPlanet()` (okamžitě po kliku)
   * i z `_updateSolarPositions()` (1×/s, ať vzdálenosti sledují reálný
   * pohyb planet, i když se výběr zrovna nezměnil). */
  _updateSolarInfoPanel() {
    const panel = this._els.solarInfo;
    if (!panel) return;
    const key = this._solarFocusKey;
    if (!key) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    if (this._els.solarInfoName) this._els.solarInfoName.textContent = PLANET_LABELS_CS[key] || key;

    const positions = this._solarRawPositions;
    const p = positions && positions[key];
    const earth = positions && positions.earth;

    if (this._els.solarInfoSun) {
      this._els.solarInfoSun.textContent = p ? `${formatAU(p.distanceAU)} od Slunce` : '';
    }
    if (p && earth && key !== 'earth') {
      const dx = p.x - earth.x, dy = p.y - earth.y, dz = p.z - earth.z;
      const distAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (this._els.solarInfoEarth) this._els.solarInfoEarth.textContent = `${formatAU(distAU)} od Země`;

      // Konjunkce/opozice (v0.12.0) - viz computeElongation()/
      // describeSolarAlignment() výš, počítáno ze stejných surových
      // heliocentrických souřadnic jako vzdálenost od Země o pár řádků výš.
      if (this._els.solarInfoAlign) {
        const elong = computeElongation(p, earth);
        this._els.solarInfoAlign.textContent = describeSolarAlignment(key, elong, earth.distanceAU);
      }
    } else {
      if (this._els.solarInfoEarth) this._els.solarInfoEarth.textContent = '';
      if (this._els.solarInfoAlign) this._els.solarInfoAlign.textContent = '';
    }

    // "Co je dnes vidět ze Země" (v0.13.0) - jen pro planety viditelné
    // pouhým okem (viz NAKED_EYE_PLANETS) a jen když je domovská poloha
    // známá (bez ní nejde spočítat výšku nad obzorem/azimut). Datum musí
    // odpovídat SADĚ pozic výš (`_solarPositionsDate`) - živé "teď", nebo
    // simulovaný čas během časové animace (v0.11.0), ne nezávislé
    // `new Date()`.
    if (this._els.solarInfoVisibility) {
      if (this._location && NAKED_EYE_PLANETS.includes(key)) {
        const refDate = this._solarPositionsDate || new Date();
        const horizontal = getPlanetHorizontalPositions(refDate, this._location.lat, this._location.lon);
        const h = horizontal[key];
        const isNight = this._isNightAtHome(refDate);
        this._els.solarInfoVisibility.textContent = h ? describeVisibility(h.altitudeDeg, h.azimuthDeg, isNight) : '';
      } else {
        this._els.solarInfoVisibility.textContent = '';
      }
    }
  }

  /**
   * `true` = po setmění (nebo polární noc), `false` = ještě/už denní
   * světlo, `null` = domovská poloha není známá (nedá se spočítat). Stejná
   * "před východem/po západu" logika jako `_updateUiText()`'s odpočet do
   * východu/západu, jen jako jednoduchý boolean pro info panel (v0.13.0).
   */
  _isNightAtHome(now) {
    if (!this._location) return null;
    const times = getSunTimes(now, this._location.lat, this._location.lon);
    if (times.polar === 'night') return true;
    if (times.polar === 'day') return false;
    if (!times.sunrise || !times.sunset) return null;
    return now < times.sunrise || now >= times.sunset;
  }

  _reloadTextures() {
    this._loadTextures();
  }

  /**
   * Načte texturu s jedním automatickým opakováním při selhání (výpadek sítě
   * / dočasná chyba HTTP se u statických assetů běžně vyřeší druhým pokusem)
   * a s viditelnou chybovou hláškou, pokud selže i opakování - místo
   * dosavadního tichého "nenačte se to a karta zůstane prázdná".
   */
  _loadTextureWithRetry(loader, url, onLoad, label) {
    const attempt = (isRetry) => {
      loader.load(
        isRetry ? `${url}&retry=1` : url,
        onLoad,
        undefined,
        (err) => {
          if (!isRetry) {
            setTimeout(() => attempt(true), 800);
            return;
          }
          console.error(`[astronomical-globe-card] Nepodařilo se načíst texturu "${label}":`, url, err);
          this._pendingTextureErrors = (this._pendingTextureErrors || 0) + 1;
          if (this._els && this._els.error) {
            this._els.error.hidden = false;
            this._els.error.textContent = `Nepodařilo se načíst texturu (${label}). Zkontroluj připojení a zkus obnovit stránku.`;
          }
        }
      );
    };
    attempt(false);
  }

  _loadTextures() {
    const tier = QUALITY_TIERS[this._config.quality] || QUALITY_TIERS.medium;
    const folder = tier.folder;
    const loader = new THREE.TextureLoader();
    const base = `${CARD_DIR}assets/textures/${folder}/`;

    // Den/noc/mraky jedou v NAŠICH VLASTNÍCH ShaderMaterial (earth-shaders.js),
    // které nemají žádný vestavěný zpětný sRGB<->lineární převod na výstupu.
    // Kdyby se jim texturám nastavilo SRGBColorSpace (jako se to dřív dělalo
    // přes stejný `setTex` pro všechno), GPU by je při čtení v shaderu tiše
    // dekódoval na lineární hodnoty - ale bez odpovídajícího zpětného
    // překódování na výstupu by byl výsledek citelně tmavší, což byla reálná
    // příčina dojmu "ztmavovacího filtru přes celou kartu". Proto tu chceme
    // NoColorSpace - texture2D() v shaderu pak vrací syrové 0-1 hodnoty
    // přesně podle bajtů v JPG, přesně to, s čím naše barevné ladění počítá.
    const setRawTex = (tex) => {
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = 4;
      return tex;
    };
    // Měsíc naopak jede v built-in MeshStandardMaterial, který sRGB<->lineární
    // převod na výstupu DĚLÁ automaticky - tam SRGBColorSpace zůstává správně
    // (dekódování na vstupu + zakódování na výstupu se navzájem vyruší).
    const setColorTex = (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };

    this._loadTextureWithRetry(loader, `${base}earth-day.jpg${V}`, (tex) => {
      this._earthUniforms.dayTexture.value = setRawTex(tex);
    }, 'den');
    this._loadTextureWithRetry(loader, `${base}earth-night.jpg${V}`, (tex) => {
      this._earthUniforms.nightTexture.value = setRawTex(tex);
    }, 'noc');
    this._loadTextureWithRetry(loader, `${base}earth-clouds.jpg${V}`, (tex) => {
      this._cloudsUniforms.cloudsTexture.value = setRawTex(tex);
    }, 'mraky');
    this._loadTextureWithRetry(loader, `${base}moon.jpg${V}`, (tex) => {
      this._moonMesh.material.map = setColorTex(tex);
      this._moonMesh.material.needsUpdate = true;
    }, 'Měsíc');
    // Hvězdné pozadí se negeneruje z textury (viz earth-shaders.js), takže
    // tu není co dohrávat.
  }

  // -- Aktualizace dat z Home Assistanta -------------------------------------

  _resolveLocation() {
    const cfg = this._config;
    const hass = this._hass;
    if (cfg.location_source === 'entity' && cfg.entity && hass) {
      const st = hass.states[cfg.entity];
      if (st && st.attributes && typeof st.attributes.latitude === 'number') {
        return {
          lat: st.attributes.latitude,
          lon: st.attributes.longitude,
          label: st.attributes.friendly_name || cfg.entity,
          ok: true,
        };
      }
      return { lat: null, lon: null, label: cfg.entity, ok: false };
    }
    if (hass && hass.config) {
      return {
        lat: hass.config.latitude,
        lon: hass.config.longitude,
        label: hass.config.location_name || 'Domov',
        ok: true,
      };
    }
    return { lat: null, lon: null, label: '', ok: false };
  }

  _updateFromHass() {
    if (!this._built) return;
    const loc = this._resolveLocation();

    if (!loc.ok || typeof loc.lat !== 'number' || typeof loc.lon !== 'number') {
      this._els.error.hidden = false;
      this._els.error.textContent =
        this._config.location_source === 'entity'
          ? `Entita "${this._config.entity}" nemá k dispozici polohu (latitude/longitude).`
          : 'Home Assistant nemá nastavenou domovskou polohu.';
      this._location = null;
      return;
    }
    this._els.error.hidden = true;
    this._location = loc;
  }

  // -- Render smyčka ---------------------------------------------------------

  _startLoop() {
    if (this._rafId) return;
    const tick = () => {
      this._rafId = requestAnimationFrame(tick);
      this._frame();
    };
    this._rafId = requestAnimationFrame(tick);

    if (!this._uiInterval) {
      this._uiInterval = setInterval(() => this._updateUiText(), 1000);
    }
  }

  _stopLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._uiInterval) {
      clearInterval(this._uiInterval);
      this._uiInterval = null;
    }
  }

  /**
   * Mírně "nahne" klidový směr kamery (`camDir`, jednotkový vektor) ke
   * Slunci nebo Měsíci, pokud je zrovna "jejich čas" - Slunce blízko obzoru
   * (svítání/soumrak, jako na referenčním snímku se září nad okrajem
   * glóbu), nebo Měsíc nad obzorem v noci. Bez ručního otáčení by je totiž
   * kamera sledující jen domovskou polohu skoro nikdy neukázala (jsou sice
   * v 3D scéně na fyzikálně správném místě, ale mimo záběr).
   *
   * Váha (0..1) plynule doznívá s výškou nad obzorem (viz `triangleWeight`
   * / lineární náběh u Měsíce), takže se náklon nikdy neobjeví/nezmizí
   * skokem - jen sleduje reálný pohyb Slunce/Měsíce po obloze (řádově
   * minuty), žádné vlastní stavové doběhy tu nejsou potřeba. Náklon je
   * navíc omezený na `CELESTIAL_MAX_NUDGE` (~14°), ať domovská značka
   * zůstane většinou v záběru i při plné síle efektu.
   */
  _applyCelestialReveal(camDir, homeDir, sunDirWorld, moonDir) {
    // Výška tělesa nad obzorem z pohledu domovské polohy = 90° minus úhlová
    // vzdálenost mezi domovem a bodem, kde je dané těleso právě v zenitu -
    // homeDir/sunDirWorld/moonDir jsou všechno jednotkové vektory ze
    // stejného geoToVector3(), takže stačí skalární součin (stejná
    // matematika jako getSunTimes(), jen vyjádřená vektorově).
    const elevationOf = (dir) =>
      Math.PI / 2 - Math.acos(Math.max(-1, Math.min(1, homeDir.dot(dir))));

    let targetDir = null;
    let weight = 0;

    if (this._config.show_sun_marker) {
      const sunElevation = elevationOf(sunDirWorld);
      const sunWeight = triangleWeight(sunElevation, SUN_REVEAL_PEAK, SUN_REVEAL_HALF_WIDTH);
      if (sunWeight > weight) {
        weight = sunWeight;
        targetDir = sunDirWorld;
      }
    }
    if (this._config.show_moon && moonDir) {
      const sunElevation = elevationOf(sunDirWorld);
      const moonElevation = elevationOf(moonDir);
      if (sunElevation <= MOON_REVEAL_MAX_SUN_ELEVATION && moonElevation > 0) {
        const moonWeight = Math.min(1, moonElevation / MOON_REVEAL_RISE_ANGLE);
        if (moonWeight > weight) {
          weight = moonWeight;
          targetDir = moonDir;
        }
      }
    }

    if (!targetDir || weight <= 0) return camDir;

    const camNorm = camDir.clone().normalize();
    const targetNorm = targetDir.clone().normalize();
    const dot = Math.max(-1, Math.min(1, camNorm.dot(targetNorm)));
    const angleBetween = Math.acos(dot);
    if (angleBetween < 1e-4) return camDir; // uz skoro presne smeruje tam

    const axis = new THREE.Vector3().crossVectors(camNorm, targetNorm);
    if (axis.length() < 1e-6) return camDir; // presne protilehly smer - osa neni definovana (extremni edge case)
    axis.normalize();

    const nudgeAngle = Math.min(angleBetween, CELESTIAL_MAX_NUDGE * weight);
    return camDir.clone().applyAxisAngle(axis, nudgeAngle);
  }

  /** Vykreslí pohled "sluneční soustava" - pomalá dekorativní orbitální
   * kamera kolem Slunce (viz SOLAR_CAMERA_ORBIT_SPEED) plus ruční az/el
   * offset z tažení (`_solarAzOffset`/`_solarElOffset`, viz
   * `_bindDragRotation`). Planety samotné se tady nehýbou (aktualizuje je
   * jen `_updateSolarPositions()` 1×/s).
   *
   * Kamera se navíc plynule (frame-rate nezávislá exponenciála, stejný
   * princip jako u návratu glóbu domů) přibližuje na `_solarFocusPoint`/
   * `_solarFocusDist` - ve výchozím stavu je to Slunce/`SOLAR_DISPLAY_MAX_R`,
   * po kliknutí na planetu (`_selectSolarPlanet()`) její pozice a menší
   * vzdálenost, takže "zaostření" vypadá jako plynulý dolet kamery, ne skok.
   */
  _frameSolar(t, dt) {
    if (!this._solarScene || !this._solarCamera) return;

    if (this._solarTimeSpeed !== 0) {
      // Časová animace (v0.11.0): posune simulovaný čas o (rychlost × dt) a
      // PŘEPOČÍTÁ POZICE KAŽDÝ SNÍMEK - na rozdíl od běžného živého
      // sledování (1×/s v _updateUiText) by se jinak animace při vyšších
      // rychlostech (měsíc/rok za sekundu) trhala. Pokud je zrovna vybraná
      // planeta (_solarFocusKey), zaostření kamery níž ji přirozeně
      // sleduje i během pohybu - žádný extra kód navíc, `focusMesh.position`
      // se prostě mění pod rukama.
      this._solarSimTime = new Date(this._solarSimTime.getTime() + this._solarTimeSpeed * dt * MS_PER_DAY);
      this._updateSolarPositions(this._solarSimTime);
      this._updateSolarTimeUi();
    }

    const az = t * SOLAR_CAMERA_ORBIT_SPEED + this._solarAzOffset;
    const el = Math.max(SOLAR_EL_MIN, Math.min(SOLAR_EL_MAX, SOLAR_CAMERA_ELEVATION + this._solarElOffset));

    const focusMesh = this._solarFocusKey ? this._solarPlanetMeshes[this._solarFocusKey] : null;
    const targetPoint = focusMesh ? focusMesh.position : SOLAR_ORIGIN;
    const targetDist = focusMesh
      ? Math.max(SOLAR_FOCUS_MIN_DIST, PLANET_VISUALS[this._solarFocusKey].radius * SOLAR_FOCUS_DIST_FACTOR)
      : SOLAR_DISPLAY_MAX_R * 1.55;

    // k = podíl vzdálenosti k cíli, který se "doletí" za tenhle snímek -
    // při typickém dt (~1/60s) a SOLAR_FOCUS_TIME_CONSTANT dorazí kamera na
    // nový cíl znatelně (~95 %) za necelou vteřinu, bez ohledu na FPS.
    const k = 1 - Math.exp(-Math.max(0, dt) / SOLAR_FOCUS_TIME_CONSTANT);
    this._solarFocusPoint.lerp(targetPoint, k);
    this._solarFocusDist += (targetDist - this._solarFocusDist) * k;

    const dist = this._solarFocusDist;
    const camera = this._solarCamera;
    const fp = this._solarFocusPoint;
    camera.position.set(
      fp.x + Math.cos(az) * Math.cos(el) * dist,
      fp.y + Math.sin(el) * dist,
      fp.z + Math.sin(az) * Math.cos(el) * dist
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(fp.x, fp.y, fp.z);
    this._renderer.render(this._solarScene, camera);
  }

  _frame() {
    if (!this._renderer) return;
    const t = this._clock.getElapsedTime();
    const dt = t - (this._lastFrameT ?? t);
    this._lastFrameT = t;

    if (this._viewMode === 'solar') {
      // Pohled "sluneční soustava" nepotřebuje domovskou polohu vůbec (na
      // rozdíl od glóbusu níž) - nemá smysl ho blokovat na chybějící
      // entitě/poloze. Samotné pozice planet se přepočítávají jen 1×/s v
      // _updateUiText(), tady se jen animuje pomalá orbitální kamera.
      this._frameSolar(t, dt);
      return;
    }

    if (!this._location) return;
    const now = new Date();

    const sun = getSunPosition(now);
    const sunDirWorld = geoToVector3(sun.lat, sun.lon, 1);
    this._earthUniforms.sunDirection.value.copy(sunDirWorld);
    this._cloudsUniforms.sunDirection.value.copy(sunDirWorld);
    this._sunLight.position.copy(sunDirWorld).multiplyScalar(10);
    const sunPos = sunDirWorld.clone().multiplyScalar(EARTH_RADIUS * 4.2);
    this._sunSprite.position.copy(sunPos);
    this._sunHalo.position.copy(sunPos);
    this._sunSprite.visible = !!this._config.show_sun_marker;
    this._sunHalo.visible = !!this._config.show_sun_marker;

    let moonDir = null;
    if (this._config.show_moon) {
      const moon = getMoonPosition(now);
      moonDir = geoToVector3(moon.lat, moon.lon, 1);
      this._moonMesh.position.copy(moonDir).multiplyScalar(MOON_ORBIT_RADIUS);
      this._moonMesh.visible = true;
    } else {
      this._moonMesh.visible = false;
    }

    this._cloudsMesh.visible = !!this._config.show_clouds;
    // jemný nezávislý drift mraků - čistě dekorativní, neovlivňuje přesnost terminátoru
    if (this._config.show_clouds) {
      this._cloudsMesh.rotation.y = t * 0.006;
    }

    // GPS značka + kamera sledující domovskou/sledovanou polohu
    const homeDir = geoToVector3(this._location.lat, this._location.lon, 1);
    this._markerSprite.position.copy(homeDir).multiplyScalar(1.01);

    let camDir = homeDir.clone();
    let camUp = new THREE.Vector3(0, 1, 0);

    if (this._config.manual_rotation) {
      // Po MANUAL_IDLE_TIMEOUT sekundách nečinnosti se ruční natočení plynule
      // (slerp doběh k identitě, nezávislý na FPS) vrátí zpět na domovskou
      // polohu - ať karta po odložení telefonu/myši nezůstane natočená mimo
      // sledovanou polohu. Dá se to zastavit tlačítkem se zámkem
      // (`_autoReturnEnabled`), a tlačítko "vrátit domů" (`_resetRequested`)
      // tuhle stejnou animaci vynutí OKAMŽITĚ, nezávisle na zámku i na
      // uplynulém čase nečinnosti.
      if (!this._dragging) {
        // Úhel mezi _manualQuat a identitou = 2*acos(|w|) (jednotkový
        // kvaternion). Math.min(1, ...) jen ošetřuje drobný float přetečení
        // nad 1 z opakovaného násobení/slerpu.
        const angleFromHome = 2 * Math.acos(Math.min(1, Math.abs(this._manualQuat.w)));
        if (angleFromHome > MANUAL_RETURN_SNAP_ANGLE) {
          const idleFor = t - this._lastInteractionT;
          const shouldReturn =
            this._resetRequested || (this._autoReturnEnabled && idleFor > MANUAL_IDLE_TIMEOUT);
          if (shouldReturn) {
            const k = 1 - Math.exp(-dt / MANUAL_RETURN_TIME_CONSTANT);
            this._manualQuat.slerp(IDENTITY_QUATERNION, k);
            const newAngle = 2 * Math.acos(Math.min(1, Math.abs(this._manualQuat.w)));
            if (newAngle < MANUAL_RETURN_SNAP_ANGLE) {
              this._manualQuat.identity();
              this._resetRequested = false;
            }
          }
        }
      }
      camDir.applyQuaternion(this._manualQuat);
      camUp.applyQuaternion(this._manualQuat);
    }

    // Automatická jemná animace - potlačená během aktivního tažení, ať se
    // nepere s gestem uživatele (5°/3° výchylka je jinak nenápadná, ale
    // společně s ručním otáčením by to rušilo 1:1 odezvu na prst/myš).
    // Aplikuje se AŽ NA výsledek trackball rotace (staré az/el-kolem-Y, tady
    // stačí - výchylka je jen pár stupňů, žádný gimbal problém v praxi
    // nehrozí, i kdyby uživatel předtím otočil hodně "arcballem").
    if (this._config.rotation_wobble && !this._dragging) {
      const wob = this._wobbleSeed;
      const azWobble = Math.sin(t * (2 * Math.PI / 300) + wob) * degToRad(5);
      const elWobble = Math.sin(t * (2 * Math.PI / 420) + wob * 1.7) * degToRad(3);
      camDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), azWobble);
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), camDir).normalize();
      camDir.applyAxisAngle(right, elWobble);
    }

    // Mírné naklonění klidové kamery ke Slunci/Měsíci, když je "jejich čas"
    // (Slunce u obzoru, nebo Měsíc nad obzorem v noci) - stejná podmínka
    // "ne během tažení" jako u wobble, viz _applyCelestialReveal().
    if (this._config.celestial_reveal && !this._dragging) {
      camDir = this._applyCelestialReveal(camDir, homeDir, sunDirWorld, moonDir);
    }

    this._camera.position.copy(camDir).multiplyScalar(CAMERA_DISTANCE);
    this._camera.up.copy(camUp);
    this._camera.lookAt(0, 0, 0);

    this._renderer.render(this._scene, this._camera);
  }

  _updateUiText() {
    if (!this._els) return;
    const now = new Date();

    if (this._viewMode === 'solar') {
      // Živé sledování reálného "teď" jen mimo časovou animaci (v0.11.0) -
      // jakmile běží (nebo je pauznutá na simulovaném čase), pozice
      // aktualizuje KAŽDÝ SNÍMEK `_frameSolar()`, ne tenhle 1×/s interval,
      // jinak by si tenhle kód s animací "přetahoval" pozice zpátky na
      // aktuální datum uprostřed přehrávání.
      if (this._solarTimeSpeed === 0 && !this._solarSimTime) {
        this._updateSolarPositions(now);
      }
    }

    const hass = this._hass;
    const locale = getLocale(hass);
    const hour24 = uses24h(hass);

    this._els.date.textContent = now
      .toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })
      .toUpperCase();
    this._els.time.textContent = now.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !hour24,
    });

    if (!this._location) {
      this._els.countdown.textContent = '';
      this._els.daylength.textContent = '';
      this._updateMoonIcon(now);
      this._updateOrbitIcon(now);
      return;
    }

    const times = getSunTimes(now, this._location.lat, this._location.lon);

    if (this._config.show_countdown) {
      if (times.polar === 'day') {
        this._els.countdown.textContent = '☀️ Polární den';
      } else if (times.polar === 'night') {
        this._els.countdown.textContent = '🌑 Polární noc';
      } else if (now < times.sunrise) {
        const h = (times.sunrise - now) / 3600000;
        this._els.countdown.textContent = `🌅 do východu: ${formatDuration(h)}`;
      } else if (now < times.sunset) {
        const h = (times.sunset - now) / 3600000;
        this._els.countdown.textContent = `🌇 do západu: ${formatDuration(h)}`;
      } else {
        const tomorrow = new Date(now.getTime() + 86400000);
        const tTimes = getSunTimes(tomorrow, this._location.lat, this._location.lon);
        if (tTimes.sunrise) {
          const h = (tTimes.sunrise - now) / 3600000;
          this._els.countdown.textContent = `🌅 do východu: ${formatDuration(h)}`;
        } else {
          this._els.countdown.textContent = '';
        }
      }
    } else {
      this._els.countdown.textContent = '';
    }

    if (this._config.show_day_length && times.dayLengthHours != null) {
      this._els.daylength.textContent = `Délka dne: ${formatDuration(times.dayLengthHours)}`;
    } else {
      this._els.daylength.textContent = '';
    }

    this._updateMoonIcon(now);
    this._updateOrbitIcon(now);
  }

  _updateMoonIcon(now) {
    const canvas = this._els.moonIcon;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const moon = getMoonPosition(now);
    this._paintMoonPhase(ctx, w, h, moon.illuminatedFraction, moon.waxing);
  }

  /**
   * Vykreslí fyzikálně korektní fázi Měsíce jako pohled na osvětlenou
   * polokouli (per-pixel osvětlení, ne aproximace elipsou). k = osvětlená
   * frakce 0..1 (0 = nov, 1 = úplněk), waxing = dorůstající/couvající.
   */
  _paintMoonPhase(ctx, w, h, k, waxing) {
    const r = w / 2 - 3;
    const cx = w / 2, cy = h / 2;
    const img = ctx.createImageData(w, h);
    const theta = Math.acos(Math.max(-1, Math.min(1, 2 * k - 1)));
    const s = waxing ? 1 : -1;
    const Lx = Math.sin(theta) * s;
    const Lz = Math.cos(theta);
    const light = [242, 236, 216];
    const dark = [23, 29, 41];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const nx = (x + 0.5 - cx) / r;
        const ny = (y + 0.5 - cy) / r;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) {
          img.data[idx + 3] = 0;
          continue;
        }
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        const illum = nx * Lx + nz * Lz;
        const t = Math.max(0, Math.min(1, (illum + 0.06) / 0.12));
        img.data[idx] = dark[0] + (light[0] - dark[0]) * t;
        img.data[idx + 1] = dark[1] + (light[1] - dark[1]) * t;
        img.data[idx + 2] = dark[2] + (light[2] - dark[2]) * t;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _updateOrbitIcon(now) {
    const el = this._els.orbitEarth;
    if (!el) return;
    const start = Date.UTC(now.getUTCFullYear(), 0, 1);
    const dayOfYear = (now.getTime() - start) / 86400000;
    const angle = (dayOfYear / 365.25) * Math.PI * 2 - Math.PI / 2;
    const cx = 22, cy = 22, r = 18;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    el.setAttribute('cx', x.toFixed(2));
    el.setAttribute('cy', y.toFixed(2));
  }

  _onResize() {
    if (!this._renderer || !this._els.stage) return;
    const rect = this._els.stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    if (this._solarCamera) {
      this._solarCamera.aspect = w / h;
      this._solarCamera.updateProjectionMatrix();
    }
  }
}

// ---------------------------------------------------------------------------
// Vizuální editor karty
// ---------------------------------------------------------------------------

const EDITOR_SCHEMA = [
  {
    name: 'title',
    selector: { text: {} },
  },
  {
    name: 'location_source',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'home', label: 'Domovská poloha Home Assistanta' },
          { value: 'entity', label: 'Sledovaná entita (person / device_tracker / zone)' },
        ],
      },
    },
  },
  {
    name: 'entity',
    selector: { entity: { domain: ['person', 'device_tracker', 'zone'] } },
  },
  {
    name: 'quality',
    selector: {
      select: {
        mode: 'dropdown',
        options: Object.entries(QUALITY_TIERS).map(([value, t]) => ({ value, label: t.label })),
      },
    },
  },
  { name: 'show_clouds', selector: { boolean: {} } },
  { name: 'show_moon', selector: { boolean: {} } },
  { name: 'show_sun_marker', selector: { boolean: {} } },
  { name: 'show_stars', selector: { boolean: {} } },
  { name: 'show_countdown', selector: { boolean: {} } },
  { name: 'show_day_length', selector: { boolean: {} } },
  { name: 'rotation_wobble', selector: { boolean: {} } },
  { name: 'manual_rotation', selector: { boolean: {} } },
  { name: 'celestial_reveal', selector: { boolean: {} } },
  {
    name: 'brightness',
    selector: { number: { min: 0.5, max: 5, step: 0.1, mode: 'slider' } },
  },
  {
    name: 'night_ambient',
    selector: { number: { min: 0.2, max: 3, step: 0.1, mode: 'slider' } },
  },
  {
    name: 'saturation',
    selector: { number: { min: 0.6, max: 2.5, step: 0.05, mode: 'slider' } },
  },
  {
    name: 'contrast',
    selector: { number: { min: 0, max: 0.6, step: 0.02, mode: 'slider' } },
  },
  {
    name: 'twilight_strength',
    selector: { number: { min: 0, max: 1, step: 0.02, mode: 'slider' } },
  },
  {
    name: 'cloud_opacity',
    selector: { number: { min: 0, max: 1, step: 0.05, mode: 'slider' } },
  },
  {
    name: 'atmosphere_intensity',
    selector: { number: { min: 0.2, max: 3, step: 0.1, mode: 'slider' } },
  },
  {
    name: 'sky_intensity',
    selector: { number: { min: 0.2, max: 3, step: 0.1, mode: 'slider' } },
  },
  {
    name: 'marker_size',
    selector: { number: { min: 0.02, max: 0.3, step: 0.01, mode: 'slider' } },
  },
  { name: 'accent_color', selector: { text: {} } },
];

const EDITOR_LABELS = {
  title: 'Titulek (volitelné)',
  location_source: 'Zdroj polohy',
  entity: 'Entita polohy',
  quality: 'Kvalita textur',
  show_clouds: 'Zobrazit mraky',
  show_moon: 'Zobrazit Měsíc',
  show_sun_marker: 'Zobrazit značku Slunce',
  show_stars: 'Zobrazit hvězdné pozadí',
  show_countdown: 'Zobrazit odpočet do východu/západu',
  show_day_length: 'Zobrazit délku dne',
  rotation_wobble: 'Jemná animovaná rotace',
  manual_rotation: 'Ruční otáčení tažením (myš/prst)',
  celestial_reveal: 'Naklonit pohled ke Slunci/Měsíci u obzoru',
  brightness: 'Jas (světla měst v noci)',
  night_ambient: 'Podsvícení nočního oceánu',
  saturation: 'Sytost barev',
  contrast: 'Kontrast',
  twilight_strength: 'Síla soumrakové záře',
  cloud_opacity: 'Krytí mraků',
  atmosphere_intensity: 'Síla atmosférické záře',
  sky_intensity: 'Jas hvězd a mlhoviny',
  marker_size: 'Velikost GPS značky',
  accent_color: 'Barva zvýraznění (CSS, volitelné)',
};

class AstronomicalGlobeCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        ha-form { display: block; padding: 8px 0; }
        .agc-editor-version {
          display: flex; justify-content: flex-end; align-items: center;
          gap: 6px; padding: 0 2px 6px 2px; font-size: 11px;
          color: var(--secondary-text-color, #888); opacity: 0.8;
          font-family: var(--code-font-family, monospace);
        }
      </style>
      <div class="agc-editor-version">Astronomical Globe Card v${CARD_VERSION}</div>
    `;
    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = this._config;
    form.schema = EDITOR_SCHEMA;
    form.computeLabel = (item) => EDITOR_LABELS[item.name] || item.name;
    form.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const newConfig = ev.detail.value;
      this._config = newConfig;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: newConfig } }));
    });
    this._form = form;
    this.shadowRoot.appendChild(form);
  }
}

// ---------------------------------------------------------------------------
// Registrace
// ---------------------------------------------------------------------------

customElements.define('astronomical-globe-card', AstronomicalGlobeCard);
customElements.define('astronomical-globe-card-editor', AstronomicalGlobeCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'astronomical-globe-card',
  name: 'Astronomical Globe Card',
  description: 'Realistický 3D glóbus Země s reálným terminátorem, Měsícem a polohou GPS (styl Apple Watch Astronomie).',
  preview: false,
});

// eslint-disable-next-line no-console
console.info(
  `%c ASTRONOMICAL-GLOBE-CARD %c v${CARD_VERSION} `,
  'color: white; background: #1c2b45; font-weight: 700;',
  'color: #1c2b45; background: white; font-weight: 700;'
);

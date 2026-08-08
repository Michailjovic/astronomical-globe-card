# Astronomical Globe Card

Realistický 3D glóbus Země pro Home Assistant Lovelace, inspirovaný ciferníkem
**Astronomie** na Apple Watch – reálné NASA/Solar System Scope textury,
fyzikálně korektní den/noc terminátor počítaný z aktuální polohy Slunce,
atmosférická záře, mraky a Měsíc jako samostatné těleso se skutečnou fází
a polohou.

Žádný build krok – čisté ES moduly, three.js je vendorováno lokálně v `lib/`.

## Instalace (manuální)

1. Zkopírujte **celou složku** `astronomical-globe-card/` do `<config>/www/`,
   např.:

   ```
   <config>/www/astronomical-globe-card/
       astronomical-globe-card.js
       lib/
       assets/
   ```

2. V Home Assistantu: **Nastavení → Dashboardy → ⋮ → Resources** → přidat
   nový resource:

   - URL: `/local/astronomical-globe-card/astronomical-globe-card.js`
   - Typ: **JavaScript Module**

3. Obnovte prohlížeč (Ctrl+Shift+R / vyčistit cache).

4. Přidejte kartu do dashboardu:

   ```yaml
   type: custom:astronomical-globe-card
   ```

   Nebo v UI editoru dashboardu vyhledejte **Astronomical Globe Card**
   a nastavte přes grafický editor (entita, kvalita textur, přepínače).

## Konfigurace (YAML)

```yaml
type: custom:astronomical-globe-card
title: ""                     # volitelný titulek nad kartou
location_source: home         # 'home' (HA domovská poloha) | 'entity'
entity: person.michael        # nutné jen pokud location_source: entity
quality: medium                # 'low' | 'medium' | 'high'
show_clouds: true
show_moon: true
show_sun_marker: true
show_countdown: true          # "do východu/západu: X h Y min"
show_day_length: true         # "Délka dne: X h Y min"
rotation_wobble: true         # jemná živá animace kamery kolem tvé polohy
accent_color: ""              # volitelná CSS barva
```

### Zdroj polohy

- `location_source: home` — použije `hass.config.latitude/longitude`
  (Nastavení → Systém → Obecné). Funguje vždy, bez závislosti na entitě.
- `location_source: entity` + `entity: person.xxx` (nebo `device_tracker.*`,
  `zone.*`) — glóbus sleduje reálnou polohu dané entity. Entita musí mít
  atributy `latitude`/`longitude` (person, device_tracker a zone je mají
  standardně).

### Kvalita textur

| Kvalita | Rozlišení Země | Velikost (den+noc+mraky+Měsíc) |
|---------|----------------|----------------------------------|
| low     | 1024×512       | ~300 KB (nejrychlejší, slabší tablety) |
| medium  | 2048×1024      | ~1,2 MB (doporučeno) |
| high    | 4096×2048      | ~3 MB (nejlepší vzhled, náročnější na GPU) |

Kvalitu lze změnit kdykoli přes vizuální editor karty i za běhu.

## Jak to funguje

- **Terminátor** se počítá z reálné subsolární polohy (deklinace + rovnice
  času, nízko-přesné USNO/NOAA vzorce) a vykresluje se přímo ve fragment
  shaderu jako plynulý přechod den/noc textury s teplou soumrakovou září.
- **Měsíc** má skutečnou polohu (zjednodušená Meeových nízko-přesná řada,
  přesnost řádově desítky obloukových minut) a jeho fáze vzniká přirozeně
  fyzikálním osvětlením 3D koule stejným směrem slunečního světla – žádná
  "podvržená" textura fáze.
- **Kamera** je uzamčená na tvé aktuální/domovské poloze (GPS tečka je proto
  vždy viditelná, podobně jako na Apple Watch), s jemnou pomalou animací
  (`rotation_wobble`) pro živý dojem, aniž by to ovlivnilo přesnost
  terminátoru.
- Karta vlastní `getConfigElement()`/`getStubConfig()`, takže funguje
  s vizuálním editorem dashboardu, a při odpojení z DOM korektně uvolňuje
  three.js zdroje (žádné memory leaky při přepínání pohledů).

## Zdroje a licence

- **Textury Země a Měsíce**: [Solar System Scope](https://www.solarsystemscope.com/textures/)
  (CC BY 4.0 – „Solar System Scope“).
- **three.js**: MIT licence, vendorováno lokálně v `lib/three.module.min.js`
  (v0.160.0), žádná závislost na CDN za běhu.
- Astronomické výpočty (`lib/astro.js`) jsou vlastní implementace
  standardních veřejně publikovaných nízko-přesných algoritmů (NOAA Solar
  Calculator, Meeus – *Astronomical Algorithms*).

## Možná budoucí vylepšení

- Normálová/specular mapa oceánu pro ostřejší specular highlight.
- Volitelné hvězdné pozadí.
- Alternativní "volný" režim kamery (tažení myší / prstem).

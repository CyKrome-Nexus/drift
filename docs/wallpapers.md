# Wallpapers and providers

Drift shows real wallpapers from **providers**: stock-video APIs that Drift reads, maps onto one
`Wallpaper` shape (`packages/core/src/catalog.ts`) and merges into one catalog
(`packages/wallpapers`). No screen knows which provider a wallpaper came from.

| Provider | What | Key | Limits | Terms Drift follows |
|---|---|---|---|---|
| `coverr` | Stock video loops (ambient, nature, abstract, night sky) | `COVERR_API_KEY` | Free "Demo" key: 50 requests/hour. Paid Coverr plan: 2,000/hour, same key and API | Credit Coverr wherever its videos show; record a download when one is applied or saved; never sell the videos on their own, so they are free in Drift |
| `nasa` | Hand-picked public-domain footage of Earth, the Sun and the planets (`NASA_PICKS`) | none | none for these files | Credit NASA; never imply NASA endorses Drift |
| `drift` | Drift's 24 generated gradient loops | none | none | Drift's own. Shown only where no other provider has anything (offline, or a category no provider covers) |

Ids are `<provider>:<provider's id>`: `coverr:S1YbPl1NfI`, `nasa:GSFC_20170412_Lights_m12573_EarthAtNight`,
`drift:6`. Favourites, lists and history saved before providers (plain numbers) are read as
`drift:<n>`, on both apps and in synced libraries.

## Choosing providers (env, like the backend's providers)

```sh
# Desktop: apps/desktop/.env       Phone: apps/mobile/.env (EXPO_PUBLIC_ prefix)
VITE_WALLPAPER_PROVIDERS=coverr,nasa,drift   # priority order; this is the default
VITE_COVERR_API_KEY=…
```

A provider listed without its key is skipped with a console warning, never fatal; `drift` is
always added last. Pages interleave the providers in order and drop repeats. Answers are cached
for 30 minutes, and searches wait for typing to pause, because free keys have hourly limits.

## Why these providers, and not others

- **Unsplash and Pexels forbid wallpaper apps** in their API terms ("unofficial clients, wallpaper
  applications"; "including making Pexels content available as a wallpaper app").
- **Pixabay** forbids hotlinking and distributing content "on a Standalone basis", which is what a
  wallpaper app does with an unedited file.
- **NASA's library search** is mostly narrated features, interviews and news, so NASA is a curated
  list, not a live search. Add picks to `NASA_PICKS` after checking the files exist.

## Going paid

Coverr is the same API on a paid plan (higher limits, same key). Licensed stock APIs
(Shutterstock, Adobe Stock, Storyblocks) cover more, but their keys must not ship inside an app:
anyone can unpack one. They belong on a Drift server, which then becomes one more provider here
(an adapter that calls it), and the apps switch to it with an env change.

## Adding a provider

1. `packages/wallpapers/src/providers/<name>.ts`: implement `WallpaperProvider`. Map the API's
   items with `media` (poster, thumbnail, preview clip, files smallest first) and a `credit`
   that meets its terms; set `tier: 'free'` unless Drift has the right to charge for the content.
2. Register it in `PROVIDER_FACTORIES` (`config.ts`), with the env it needs.
3. Desktop: allow its API host in `connect-src` and its media hosts in `img-src` / `media-src`
   (`apps/desktop/src-tauri/tauri.conf.json`), and the media hosts in `MEDIA_HOSTS`
   (`src-tauri/src/media.rs`), which downloads and lock-screen images go through.
4. Tests with a fake `fetch` in `packages/wallpapers/src/wallpapers.test.ts`.

## Where the files play

- **App previews:** posters on cards. The hero and detail play the real file (desktop, at most
  1080 lines) or the provider's short preview clip (phone, light on data).
- **Desktop wallpaper:** the engine passes the wallpaper's `media` to each wallpaper window,
  which picks the file for its display and the Quality setting and plays it muted on the shared
  loop clock. The lock screen (Windows) gets the poster. Downloads save the file into
  Settings › Download location (`src-tauri/src/media.rs`).
- **Android:** the module downloads the video once (`VideoCache`) and the wallpaper service plays
  it with `MediaPlayer` straight onto the wallpaper surface, muted, looped, cropped to fill.
- **iOS:** three seconds from a quarter of the way into the video become the Live Photo
  (`LivePhotoMaker`), cropped to the screen.

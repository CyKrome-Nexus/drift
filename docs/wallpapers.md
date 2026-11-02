# Wallpapers and providers

Drift shows real wallpapers from **providers**: stock-video APIs that Drift reads, maps onto one
`Wallpaper` shape (`packages/core/src/catalog.ts`) and merges into one catalog
(`packages/wallpapers`). No screen knows which provider a wallpaper came from.

| Provider | What | Key | Limits | On by default |
|---|---|---|---|---|
| `pexels` | The largest free stock-video library; portrait videos for the phone | `PEXELS_API_KEY` | 200 requests/hour, 20,000/month (raised on request) | yes |
| `pixabay` | Free stock video, strong on nature, backgrounds and abstract motion | `PIXABAY_API_KEY` | 100 requests/minute | yes |
| `drift` | Drift's 24 generated gradient loops | none | none | always, as the fallback where no provider has anything |
| `coverr` | Stock video loops | `COVERR_API_KEY` | 50/hour free, 2,000/hour on a paid Coverr plan | no, add it to the list |
| `nasa` | Hand-picked public-domain footage of Earth, the Sun and the planets (`NASA_PICKS`) | none | none | no, add it to the list |

Every provider's wallpapers carry a credit (videographer and provider) that the app shows, and are
free tier.

Ids are `<provider>:<provider's id>`: `coverr:S1YbPl1NfI`, `nasa:GSFC_20170412_Lights_m12573_EarthAtNight`,
`drift:6`. Favourites, lists and history saved before providers (plain numbers) are read as
`drift:<n>`, on both apps and in synced libraries.

## Choosing providers (env, like the backend's providers)

```sh
# Desktop: apps/desktop/.env       Phone: apps/mobile/.env (EXPO_PUBLIC_ prefix)
VITE_WALLPAPER_PROVIDERS=pexels,pixabay,drift   # priority order; this is the default
VITE_PEXELS_API_KEY=…     # https://www.pexels.com/api/new/
VITE_PIXABAY_API_KEY=…    # https://pixabay.com/api/docs/ (shown when signed in)
```

A provider listed without its key is skipped with a console warning, never fatal; `drift` is
always added last. Pages interleave the providers in order and drop repeats. Answers are cached
for 30 minutes, and searches wait for typing to pause, because free keys have hourly limits.

The phone's catalog asks for portrait footage (Pexels filters by it; for Pixabay and popular
lists Drift keeps the portrait videos when there are enough), the desktop's for landscape.

## Licensing: personal use

Drift is a personal project, and Pexels and Pixabay are used as personal-use sources. Before Drift
is distributed to others, revisit them: Pexels' API terms forbid "making Pexels content available
as a wallpaper app", Unsplash's forbid wallpaper applications, and Pixabay's licence forbids
distributing content on a standalone basis. Coverr (commercial use allowed) and NASA (public
domain) are the providers that hold up for a public release; they stay available behind the same
env switch. NASA's library search is mostly narrated features and news, so NASA is a curated list.

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

# Gumroad: paste-in kit

Everything for the Lyricist Pro page on Gumroad. About 10 minutes, top to bottom.
Every image is in this folder. The description is `description.html`. Open it in
a browser, select all, copy, and paste it into Gumroad so the headings and bold
come with it.

## 1. Build the file people download

On the PC: `cd V:\src\Lyricist-4.2.0` → `git pull origin main` → `npm run release:customer`.
Upload the `Setup.exe` it prints. That is the build without the creator Ghost.

## 2. New product

Gumroad → **Products** → **New product** → **Digital product**.

| Field | Paste this |
|---|---|
| Name | `Lyricist Pro — Songwriting Studio for Windows` |
| Price | `29` |
| Pay what they want | **On**, minimum `$29`. Lets people throw extra in the case. |
| URL | `lyricist-pro` |

## 3. Product page

| Field | Paste this |
|---|---|
| Description | all of `description.html` (see the top of this file) |
| Cover | upload in this order: `covers/01-skyline-cover-video.mov` (the moving skyline), then `covers/01-hero.jpg` through `covers/09-everything.jpg` |
| Thumbnail | `thumbnail-600.png` |
| Call to action | `I want this!` |
| Summary | `18 songwriting tools in one Windows app, from the first line to the finished, mastered song.` |

**Additional details**: add one row each.

| Attribute | Value |
|---|---|
| Platform | Windows 10 / 11 |
| Tools | 18 |
| Writing tools | Free OpenRouter key, no card |
| Black Hole Studios | Free cloud engine for short songs; full length on a free Kaggle account |
| Subscription | None. Pay once. |
| Updates | New versions land in your Gumroad library |

**Category**: Music & Sound Design.
**Tags**: `songwriting`, `lyrics`, `songwriter`, `music production`, `ai music`, `suno`, `mastering`, `windows`.

## 4. Content (what buyers see after paying)

Upload the `Setup.exe` from step 1, then paste this under it:

> **Thanks for grabbing Lyricist Pro.**
>
> 1. Run the installer. Windows shows a blue box that says "Windows protected your PC". That isn't a virus warning. It shows because the installer isn't signed with a paid certificate. Click **More info**, then **Run anyway**.
> 2. Open **Settings** in the app and paste a free OpenRouter key (openrouter.ai, about two minutes, no card). That switches on the writing tools.
> 3. Press **Play Demo** on any tab and the Ghost walks you through it.
>
> New versions show up right here in your library. Stuck? Email cfunkycreations@gmail.com.
>
> Funk

## 5. Profile (your Gumroad home page)

Settings → **Profile**.

| Field | Paste this |
|---|---|
| Name | `CFunky Creations` |
| Username | `cfunkycreations` |
| Logo / profile picture | `profile/avatar-1000.png` |
| Bio | `Funk Audio Flow OpSec. Austin, Texas. Street musician turned app builder. Lyricist Pro is my open guitar case.` |

Then on your profile page: **Edit profile** → add a **Featured product** section
with Lyricist Pro, and a **Rich text** section on top holding
`profile/header-1500x500.jpg`. If Gumroad shows color options, use background
`#050208` and accent `#FF8A3D`.

## 6. Publish

Hit **Publish** and you're live.

## Later: the phone version

Once the phone version is live, add this line to the description under
"What you need", with the real link:

> Also on iPhone and Android: open `[PHONE LINK]` in Safari or Chrome and add it to your home screen.

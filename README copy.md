To display your images perfectly in a GitHub release note while keeping them simple and robust, the best method is to use the **direct GitHub user-content URL**.

Since your images are in the `public` folder, once you push your code to GitHub, they are hosted on GitHub's servers.

### Step 1: Get your Image URLs

If your repo is at `https://github.com/rimu-7/clipdude`, and your image is at `public/screenshot.png` on the `main` branch, your direct link is:
`https://raw.githubusercontent.com/rimu-7/clipdude/main/public/screenshot.png`

### Step 2: The Perfect Release Note Structure

Copy and paste this into your GitHub Release. It uses clean Markdown tables or standard blocks to show your images clearly.

---

## ClipDude v1.0.4 — Release Notes

ClipDude is now ready for use. This project focuses on a fast, private experience by keeping all clipboard data in a local SQLite database.

### Official Downloads

All build assets, including installers for Windows, macOS, and Linux, are available below:
**[GitHub Release Assets](https://github.com/rimu-7/clipdude/releases)**

---

### Product Preview

| Dashboard View | Settings & Privacy |
| :------------- | :----------------- |
|                |                    |

_(Note: Replace `main-ui.png` and `settings-ui.png` with your actual filenames from the public folder)_

---

### Core Philosophy

- **Local Storage:** Data never leaves your machine. No cloud sync, just local SQLite.
- **Minimalist Interface:** Non-rounded, "boxy" aesthetic for high performance.
- **Batch Organization:** History is stored in discrete batches for better resource management.
- **Background Operation:** Runs natively from the system tray or menubar.

---

### Installation Instructions

**macOS**

1.  Move **ClipDude.app** to your **Applications** folder.
2.  If blocked by security, run this in Terminal:
    `xattr -cr /Applications/clipdude.app`

**Windows**

1.  Run the installer.
2.  Click **More Info** → **Run Anyway** on the SmartScreen prompt.

**Linux**

1.  Download the `.AppImage`.
2.  Run `chmod +x clipdude_0.1.0_amd64.AppImage` to make it executable.

---

_Bismillah. Technical feedback and bug reports can be submitted via the [GitHub Issues](https://www.google.com/search?q=https://github.com/rimu-7/clipdude/issues) page._

---

### Pro Tip for Images

If you want to be 100% sure the images look perfect, **drag and drop** the images from your computer directly into the GitHub Release edit box. GitHub will automatically upload them to its own CDN and give you a special `![]()` link that is guaranteed to never break, even if you delete the files from your `public` folder later.

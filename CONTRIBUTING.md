# Contributing to EasyReads

Thanks for your interest in improving EasyReads!

## Reporting bugs and suggesting features

Open an [issue](https://github.com/ikibirdir/EasyReads/issues). For bugs, please include:

- your browser and OS
- what you did, what you expected to happen and what actually happened
- any errors from the browser console (open it with <kbd>F12</kbd> or <kbd>Cmd</kbd>+<kbd>Opt</kbd>+<kbd>I</kbd>)

## Making changes

1. Fork the repo and create a branch from `main`.
2. Install and run the app:
   ```bash
   npm install
   npm run dev
   ```
3. Make your change. Keep to the existing style: plain JavaScript with no frameworks, and 4-space indentation.
4. Check that the production build still works:
   ```bash
   npm run build
   npm run preview
   ```
5. Open a pull request that explains what you changed and why. For UI changes, add a screenshot.

If you change the MediaPipe version, update it in **both** places: the `<script>` tags in `index.html` and `MEDIAPIPE_FACE_MESH_VERSION` in `src/main.js`.

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
